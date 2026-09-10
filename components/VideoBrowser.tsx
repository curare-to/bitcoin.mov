'use client'

import { useMemo, useState } from 'react'
import { useVideos } from '@/lib/nostr/useVideos'
import { groupFilms, type FilmGroup } from '@/lib/util/dedup'
import { VideoGrid } from './VideoGrid'
import { FilterBar, type SortMode, type TypeFilter } from './FilterBar'

function matchesSearch(group: FilmGroup, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return group.submissions.some((v) => {
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
    let result = groupFilms(videos)

    if (type !== 'all') {
      result = result.filter((g) => g.submissions.some((v) => v.type === type))
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
        <EmptyState hasAny={videos.length > 0} />
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

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="text-center py-20 border border-dashed border-[var(--color-border)] rounded-[var(--radius-card)]">
      <div className="text-4xl mb-3">🎬</div>
      <h2 className="font-semibold text-lg mb-1">
        {hasAny ? 'No titles match your filters' : 'No titles yet'}
      </h2>
      <p className="text-[var(--color-muted)] max-w-md mx-auto">
        {hasAny
          ? 'Try clearing the search or picking a different category.'
          : 'Be the first to add a Bitcoin title — submissions are published to Nostr as kind 31888 events.'}
      </p>
    </div>
  )
}
