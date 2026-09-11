'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useVideos } from '@/lib/nostr/useVideos'
import { curatedFilms, type FilmGroup } from '@/lib/util/dedup'
import { VideoGrid } from './VideoGrid'
import { FilterBar, type SortMode, type TypeFilter } from './FilterBar'

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
  const { videos, loading } = useVideos()
  const [search, setSearch] = useState('')
  const [type, setType] = useState<TypeFilter>('all')
  const [sort, setSort] = useState<SortMode>('recent')

  const groups = useMemo(() => {
    let result = curatedFilms(videos)

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
  }, [videos, type, search, sort])

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
      ) : groups.length === 0 ? (
        <EmptyState hasAny={groups.length > 0 || search.trim() !== '' || type !== 'all'} />
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
 * `filtered` distinguishes "your search matched nothing" from "nothing has been
 * curated yet" — very different situations, and the second one has somewhere
 * useful to send you.
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
