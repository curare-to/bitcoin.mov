'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Event } from 'nostr-tools/pure'
import { pool } from '@/lib/nostr/pool'
import { READ_RELAYS, CURATED_SUGGESTION_KIND } from '@/lib/nostr/relays'
import { parseEntry, type Video } from '@/lib/nostr/schema'
import { useVideos } from '@/lib/nostr/useVideos'
import { useNip07 } from '@/lib/nostr/useNip07'
import { groupKey } from '@/lib/util/dedup'
import { Poster } from './ui/Poster'
import {
  formatDuration,
  typeLabel,
  timeAgo,
  shortPubkey,
  hostOf,
} from '@/lib/util/format'

type FetchState = 'idle' | 'loading' | 'found' | 'missing'

export function VideoDetail() {
  const params = useSearchParams()
  const id = params.get('id')
  const { videos } = useVideos()
  const { pubkey } = useNip07()

  // Prefer an event already in the store; otherwise fetch it directly by id.
  const fromStore = useMemo(
    () => videos.find((v) => v.id === id) ?? null,
    [videos, id],
  )
  const [fetched, setFetched] = useState<Video | null>(null)
  const [state, setState] = useState<FetchState>('idle')

  useEffect(() => {
    if (!id) {
      setState('missing')
      return
    }
    if (fromStore) {
      setState('found')
      return
    }
    let cancelled = false
    setState('loading')
    pool
      .get([...READ_RELAYS], { ids: [id], kinds: [CURATED_SUGGESTION_KIND] })
      .then((event: Event | null) => {
        if (cancelled) return
        const parsed = event ? parseEntry(event) : null
        setFetched(parsed)
        setState(parsed ? 'found' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setState('missing')
      })
    return () => {
      cancelled = true
    }
  }, [id, fromStore])

  const video = fromStore ?? fetched

  // Other suggestions of the same film, from whatever the store has loaded.
  const siblings = useMemo(() => {
    if (!video) return []
    const key = groupKey(video)
    return videos.filter((v) => v.id !== video.id && groupKey(v) === key)
  }, [videos, video])

  if (state === 'loading' || (state === 'idle' && id)) {
    return <p className="text-[var(--color-muted)] py-16 text-center">Loading…</p>
  }

  if (!video) {
    return (
      <div className="text-center py-20 flex flex-col gap-3">
        <div className="text-4xl">🍿</div>
        <h1 className="text-xl font-semibold">Entry not found</h1>
        <p className="text-[var(--color-muted)]">
          This suggestion couldn’t be located on the relays we read.
        </p>
        <Link href="/" className="text-[var(--color-btc)] hover:underline">
          ← Back to all titles
        </Link>
      </div>
    )
  }

  const duration = formatDuration(video.durationSeconds)

  return (
    <article className="flex flex-col gap-8">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] w-fit"
      >
        ← All titles
      </Link>

      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 sm:gap-8">
        <Poster
          src={video.image}
          alt={video.title}
          className="aspect-[2/3] rounded-[var(--radius-card)] border border-[var(--color-border)] w-full max-w-[220px]"
        />

        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm mb-2">
              <span className="px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-btc)] font-medium">
                {typeLabel(video.type)}
              </span>
              {video.year && (
                <span className="text-[var(--color-muted)]">{video.year}</span>
              )}
              {duration && (
                <span className="text-[var(--color-muted)]">· {duration}</span>
              )}
              {video.canonical && (
                <span
                  className="px-2 py-0.5 rounded-full bg-[var(--color-btc)] text-black font-medium"
                  title="Signed off by the list's curator"
                >
                  Curated
                </span>
              )}
            </div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tight">
              {video.title}
            </h1>
            {video.director && (
              <p className="text-[var(--color-muted)] mt-1">
                Directed by {video.director}
              </p>
            )}
          </div>

          {video.links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {video.links.map((link, i) => (
                <a
                  key={`${link.url}-${i}`}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--color-btc)] text-black hover:bg-[var(--color-btc-dark)] transition-colors first:font-semibold"
                >
                  {link.label === 'imdb'
                    ? 'IMDb'
                    : link.label === 'watch'
                      ? `Watch on ${hostOf(link.url)}`
                      : hostOf(link.url)}
                </a>
              ))}
            </div>
          )}

          {video.description && (
            <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-text)]/90">
              {video.description}
            </p>
          )}

          {video.hashtags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {video.hashtags.map((t) => (
                <span
                  key={t}
                  className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          <p className="text-xs text-[var(--color-muted)] mt-2">
            Submitted {timeAgo(video.createdAt)} by{' '}
            <span className="font-mono">{shortPubkey(video.pubkey)}</span>
          </p>

          {video.canonical && video.source?.pubkey && (
            <p className="text-sm text-[var(--color-muted)]">
              Curated from a suggestion by{' '}
              <span className="font-mono">{shortPubkey(video.source.pubkey)}</span>
            </p>
          )}

          {pubkey === video.pubkey && (
            <Link
              href={`/submit?edit=${encodeURIComponent(video.id)}`}
              className="w-fit text-sm text-[var(--color-btc)] hover:underline"
            >
              Edit this entry →
            </Link>
          )}
        </div>
      </div>

      {siblings.length > 0 && (
        <section className="border-t border-[var(--color-border)] pt-6">
          <h2 className="font-semibold mb-3">
            Other suggestions for this title ({siblings.length})
          </h2>
          <ul className="flex flex-col gap-3">
            {siblings.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{s.title}</span>
                  <Link
                    href={`/video?id=${encodeURIComponent(s.id)}`}
                    className="text-[var(--color-btc)] hover:underline whitespace-nowrap"
                  >
                    View →
                  </Link>
                </div>
                {s.description && (
                  <p className="text-sm text-[var(--color-muted)] mt-1 line-clamp-2">
                    {s.description}
                  </p>
                )}
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  {timeAgo(s.createdAt)} · {shortPubkey(s.pubkey)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
