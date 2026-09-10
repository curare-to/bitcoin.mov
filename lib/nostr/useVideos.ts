'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import { pool } from './pool'
import { READ_RELAYS, MOVIE_KIND, NAMESPACE_TAG } from './relays'
import { parseEvent, replaceableKey, type Video } from './schema'

/* ------------------------------------------------------------------ *
 * The one place a relay subscription lives.
 *
 * A single long-lived subscription feeds a Map<id, Event> (id-level dedup —
 * the same event arrives from multiple relays). Parsed, sorted results are
 * exposed to React via useSyncExternalStore. The server snapshot is a stable
 * empty/loading value so client hydration matches exactly.
 * ------------------------------------------------------------------ */

export interface VideosSnapshot {
  videos: Video[]
  loading: boolean
}

const EMPTY_SNAPSHOT: VideosSnapshot = { videos: [], loading: true }

class VideoStore {
  private events = new Map<string, Event>()
  private listeners = new Set<() => void>()
  private sub: { close(): void } | null = null
  private loading = true
  private snapshot: VideosSnapshot = EMPTY_SNAPSHOT
  private flushScheduled = false
  private loadingTimer: ReturnType<typeof setTimeout> | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): VideosSnapshot => this.snapshot

  getServerSnapshot = (): VideosSnapshot => EMPTY_SNAPSHOT

  /** Show a just-published event immediately, before it echoes back. */
  pushEvent = (event: Event): void => {
    this.upsert(event)
    this.scheduleFlush()
  }

  /**
   * Store an event under its replaceable coordinate (pubkey:d), keeping only
   * the newest version. Different relays may hold different "latest" versions,
   * so this client-side merge is what actually realizes edits.
   */
  private upsert(event: Event) {
    const key = replaceableKey(event)
    const existing = this.events.get(key)
    if (existing && existing.created_at >= event.created_at) return
    this.events.set(key, event)
  }

  private start() {
    // Guard: exactly one subscription for the app's lifetime (survives
    // React StrictMode's mount/unmount/mount and page navigations).
    if (this.sub) return

    this.sub = pool.subscribeMany(
      [...READ_RELAYS],
      { kinds: [MOVIE_KIND], '#t': [NAMESPACE_TAG], limit: 500 },
      {
        onevent: (event) => {
          this.upsert(event)
          this.scheduleFlush()
        },
        oneose: () => this.finishLoading(),
      },
    )

    // Relays can be flaky and never send EOSE — flip out of loading anyway.
    this.loadingTimer = setTimeout(() => this.finishLoading(), 6000)
  }

  private finishLoading() {
    if (!this.loading) return
    this.loading = false
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer)
      this.loadingTimer = null
    }
    this.rebuild()
  }

  /** Coalesce bursts of incoming events into one rebuild/notify. */
  private scheduleFlush() {
    if (this.flushScheduled) return
    this.flushScheduled = true
    setTimeout(() => {
      this.flushScheduled = false
      this.rebuild()
    }, 200)
  }

  private rebuild() {
    const videos: Video[] = []
    for (const event of this.events.values()) {
      const parsed = parseEvent(event)
      if (parsed) videos.push(parsed)
    }
    videos.sort((a, b) => b.createdAt - a.createdAt)
    this.snapshot = { videos, loading: this.loading }
    for (const listener of this.listeners) listener()
  }
}

export const videoStore = new VideoStore()

// Dev-only handle for manual testing in the browser console. Tree-shaken /
// never assigned in production builds.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  ;(window as unknown as { __videoStore?: VideoStore }).__videoStore = videoStore
}

/** Subscribe a component to the live list of submissions. */
export function useVideos(): VideosSnapshot {
  return useSyncExternalStore(
    videoStore.subscribe,
    videoStore.getSnapshot,
    videoStore.getServerSnapshot,
  )
}
