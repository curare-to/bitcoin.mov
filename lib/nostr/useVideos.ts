'use client'

import { useSyncExternalStore } from 'react'
import type { Event } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'
import { pool } from './pool'
import { READ_RELAYS, CURATED_SUGGESTION_KIND } from './relays'
import { parseEntry, replaceableKey, type Video } from './schema'
import {
  CURATED_CANONICAL_KIND,
  curatedSchemaAddress,
  type CuratedSchema,
} from './curatedSchemaEvent'
import { siteSchema, type SiteSchemaState } from './useSiteSchema'

/* ------------------------------------------------------------------ *
 * The one place a relay subscription lives.
 *
 * Nothing is subscribed to until the site's published schema has been fetched
 * from /.well-known/curare.to/nostr.json. The pubkey that signed it is the
 * curator, and that scopes everything: suggestions are the ones replying to
 * *that* curator's schema coordinate, canonical events are the ones *that*
 * curator signed, and the relays are the ones the schema names. There is no
 * hardcoded curator to fall back to — a site with no published schema has no
 * list, and the snapshot says so.
 *
 * Long-lived subscriptions feed a Map keyed by replaceable coordinate (the
 * same entry arrives from multiple relays and in multiple versions). Parsed,
 * sorted results are exposed to React via useSyncExternalStore. The server
 * snapshot is a stable empty/loading value so client hydration matches.
 * ------------------------------------------------------------------ */

export interface VideosSnapshot {
  videos: Video[]
  loading: boolean
  /** Whether the site has a published schema to read a list from. */
  schemaStatus: SiteSchemaState['status']
  /** The published schema, once fetched — what every entry is verified against. */
  schema: CuratedSchema | null
}

const EMPTY_SNAPSHOT: VideosSnapshot = {
  videos: [],
  loading: true,
  schemaStatus: 'loading',
  schema: null,
}

class VideoStore {
  private events = new Map<string, Event>()
  private listeners = new Set<() => void>()
  private subs: { close(): void }[] = []
  private started = false
  private schema: CuratedSchema | null = null
  private schemaStatus: SiteSchemaState['status'] = 'loading'
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
    // Guard: exactly once for the app's lifetime (survives React StrictMode's
    // mount/unmount/mount and page navigations).
    if (this.started) return
    this.started = true

    // Relays can be flaky and never send EOSE, and the well-known fetch can
    // hang — flip out of loading regardless.
    this.loadingTimer = setTimeout(() => this.finishLoading(), 6000)

    siteSchema().then((state) => {
      this.schemaStatus = state.status
      if (state.status !== 'ready') {
        // No published schema: no curator, no coordinate, nothing to read.
        this.finishLoading()
        return
      }
      this.schema = state.schema
      this.open(state.schema)
    })
  }

  /** Subscribe, scoped to the curator who signed the site's schema. */
  private open(schema: CuratedSchema) {
    const address = curatedSchemaAddress(schema)
    if (!address) {
      this.finishLoading()
      return
    }

    // Two ways in, both keyed on the curator. Suggestions are whatever anyone
    // published in reply to *this* schema's coordinate; canonical events are
    // the ones *this* curator signed. `verifyCuratedCanonical` enforces the
    // author rule too — the `authors` filter just spares the relay the work.
    // Overlap across relays is free: `upsert` dedupes by coordinate.
    const filters: Filter[] = [
      { kinds: [CURATED_SUGGESTION_KIND], '#a': [address], limit: 500 },
      {
        kinds: [CURATED_CANONICAL_KIND],
        authors: [schema.namespace],
        '#a': [address],
        limit: 500,
      },
    ]

    // Read from where the schema says the list lives; the configured relays
    // are only for a schema that doesn't say.
    const relays = schema.relays.length > 0 ? [...schema.relays] : [...READ_RELAYS]

    this.subs = filters.map((filter) =>
      pool.subscribeMany(relays, filter, {
        onevent: (event) => {
          this.upsert(event)
          this.scheduleFlush()
        },
        oneose: () => this.finishLoading(),
      }),
    )
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
    if (this.schema) {
      for (const event of this.events.values()) {
        const parsed = parseEntry(event, this.schema)
        if (parsed) videos.push(parsed)
      }
      videos.sort((a, b) => b.createdAt - a.createdAt)
    }
    this.snapshot = {
      videos,
      loading: this.loading,
      schemaStatus: this.schemaStatus,
      schema: this.schema,
    }
    for (const listener of this.listeners) listener()
  }
}

export const videoStore = new VideoStore()

// Dev-only handle for manual testing in the browser console. Tree-shaken /
// never assigned in production builds.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  ;(window as unknown as { __videoStore?: VideoStore }).__videoStore = videoStore
}

/** Subscribe a component to the live list of suggestions. */
export function useVideos(): VideosSnapshot {
  return useSyncExternalStore(
    videoStore.subscribe,
    videoStore.getSnapshot,
    videoStore.getServerSnapshot,
  )
}
