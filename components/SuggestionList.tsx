'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useVideos } from '@/lib/nostr/useVideos'
import { Poster } from '@/components/ui/Poster'
import { typeLabel, shortPubkey, timeAgo, isLandscapeThumb } from '@/lib/util/format'

/* ------------------------------------------------------------------ *
 * The raw suggestion feed.
 *
 * The home page shows *films*: duplicates collapsed, the curated version
 * standing in for the rest. This shows *suggestions*: one row per event, whoever
 * signed it, in the order they arrived. It's the view you want before adding a
 * title — to see whether someone already has, and whether the curator has taken
 * it up — which is exactly what the home page's grouping hides.
 * ------------------------------------------------------------------ */

export function SuggestionList() {
  const { videos, loading } = useVideos()
  const [search, setSearch] = useState('')

  const { rows, curatedCount } = useMemo(() => {
    // A suggestion counts as curated when a curated entry shares its `d` —
    // that's the coordinate both land on.
    const curatedIds = new Set(
      videos.filter((v) => v.canonical).map((v) => v.identifier),
    )
    const suggestions = videos.filter((v) => !v.canonical)

    const needle = search.trim().toLowerCase()
    const rows = suggestions
      .filter(
        (v) =>
          !needle ||
          v.title.toLowerCase().includes(needle) ||
          (v.director?.toLowerCase().includes(needle) ?? false) ||
          v.identifier.toLowerCase().includes(needle),
      )
      .map((v) => ({ video: v, curated: curatedIds.has(v.identifier) }))

    return {
      rows,
      curatedCount: suggestions.filter((v) => curatedIds.has(v.identifier)).length,
    }
  }, [videos, search])

  const total = videos.filter((v) => !v.canonical).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suggestions…"
          className="w-full sm:max-w-xs rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-btc)] transition-colors placeholder:text-[var(--color-muted)]"
        />
        <p className="text-sm text-[var(--color-muted)] shrink-0">
          {search.trim() ? `${rows.length} of ${total}` : `${total} suggestions`}
          {curatedCount > 0 && ` · ${curatedCount} curated`}
        </p>
      </div>

      {loading && videos.length === 0 ? (
        <p className="text-[var(--color-muted)] py-16 text-center">
          Loading suggestions…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[var(--color-muted)] py-16 text-center">
          {search.trim()
            ? `Nothing matching “${search.trim()}”. Yours could be the first.`
            : 'No suggestions yet. Yours could be the first.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ video, curated }) => (
            <li key={video.id}>
              <Link
                href={`/video?id=${encodeURIComponent(video.id)}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 hover:border-[var(--color-muted)] transition-colors"
              >
                <Poster
                  src={video.image}
                  alt=""
                  className={`shrink-0 rounded-lg ${
                    isLandscapeThumb(video.image) ? 'w-16 h-10' : 'w-10 h-14'
                  }`}
                />

                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{video.title}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    {typeLabel(video.type)}
                    {video.year && ` · ${video.year}`}
                    {' · '}
                    <span className="font-mono">{shortPubkey(video.pubkey)}</span>
                    {' · '}
                    {timeAgo(video.createdAt)}
                  </p>
                </div>

                {curated && (
                  <span
                    className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-[var(--color-btc)] text-black font-medium"
                    title="The curator has signed off on this title"
                  >
                    Curated
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
