'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useVideos } from '@/lib/nostr/useVideos'
import { canonicalFilms, type FilmGroup } from '@/lib/util/dedup'
import { VideoGrid } from './VideoGrid'
import { FilterBar, DEFAULT_TYPE, type SortMode, type TypeFilter } from './FilterBar'

function matchesSearch(group: FilmGroup, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return group.entries.some((v) => {
    return (
      v.title.toLowerCase().includes(needle) ||
      (v.director?.toLowerCase().includes(needle) ?? false) ||
      v.description.toLowerCase().includes(needle) ||
      v.hashtags.some((t) => t.includes(needle))
    )
  })
}

export function VideoBrowser() {
  const { videos, loading, schemaStatus } = useVideos()
  const [search, setSearch] = useState('')
  const [type, setType] = useState<TypeFilter>(DEFAULT_TYPE)
  const [sort, setSort] = useState<SortMode>('recent')

  const curated = useMemo(() => canonicalFilms(videos), [videos])

  const groups = useMemo(() => {
    let result = curated

    if (type !== 'all') {
      result = result.filter((g) => g.entries.some((v) => v.type === type))
    }
    if (search.trim()) {
      result = result.filter((g) => matchesSearch(g, search.trim()))
    }
    if (sort === 'title') {
      result = [...result].sort((a, b) =>
        a.primary.title.localeCompare(b.primary.title),
      )
    }
    // 'recent' is the store's native order (newest representative first).
    return result
  }, [curated, type, search, sort])

  return (
    <div>
      <FilterBar
        search={search}
        onSearch={setSearch}
        type={type}
        onType={setType}
        sort={sort}
        onSort={setSort}
        count={groups.length}
      />

      {loading && videos.length === 0 ? (
        <LoadingState />
      ) : schemaStatus === 'unavailable' ? (
        <NoListState />
      ) : groups.length === 0 ? (
        <EmptyState hasAny={curated.length > 0} />
      ) : (
        <VideoGrid groups={groups} />
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden animate-pulse"
        >
          <div className="aspect-[2/3] bg-[var(--color-surface-2)]" />
          <div className="p-3.5 space-y-2">
            <div className="h-3 w-1/2 bg-[var(--color-surface-2)] rounded" />
            <div className="h-4 w-3/4 bg-[var(--color-surface-2)] rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The site serves no schema at /.well-known/curare.to/nostr.json, so there is
 * no curator and no list to read — different from a list that exists and is
 * empty, and nothing the visitor can do about it.
 */
function NoListState() {
  return (
    <div className="text-center py-20 border border-dashed border-[var(--color-border)] rounded-[var(--radius-card)]">
      <div className="text-4xl mb-3">🎬</div>
      <h2 className="font-semibold text-lg mb-1">No list published</h2>
      <p className="text-[var(--color-muted)] max-w-md mx-auto">
        This site hasn’t published a curated schema, so there’s no list to
        show yet.
      </p>
    </div>
  )
}

/**
 * `filtered` is "there are curated films, just none matching what you picked" —
 * as opposed to nothing having been curated at all. Very different situations,
 * and the second one has somewhere useful to send you. It's based on whether
 * anything is curated, not on the filter's value, because the page no longer
 * opens on "All".
 */
function EmptyState({ hasAny: filtered }: { hasAny: boolean }) {
  return (
    <div className="text-center py-20 border border-dashed border-[var(--color-border)] rounded-[var(--radius-card)]">
      <div className="text-4xl mb-3">🎬</div>
      <h2 className="font-semibold text-lg mb-1">
        {filtered ? 'No titles match your filters' : 'Nothing curated yet'}
      </h2>
      <p className="text-[var(--color-muted)] max-w-md mx-auto">
        {filtered ? (
          'Try clearing the search or picking a different category.'
        ) : (
          <>
            This page lists the titles the curator has signed off on. Nothing has
            been yet —{' '}
            <Link
              href="/suggestions"
              className="text-[var(--color-btc)] hover:underline"
            >
              see what’s been suggested
            </Link>
            .
          </>
        )}
      </p>
    </div>
  )
}
