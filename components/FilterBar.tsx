'use client'

import { VIDEO_TYPES, type VideoType } from '@/lib/nostr/schema'
import type { FilmGroup } from '@/lib/util/dedup'
import { typeLabel } from '@/lib/util/format'

export type TypeFilter = VideoType | 'all'
export type SortMode = 'recent' | 'title'

/**
 * The category the home page opens on. Movies are the marquee — the reel and
 * the grid both start there, and "All" is one click away. A marquee with
 * nothing on it is no welcome, though: a list curated without a single movie
 * opens on "All" instead. Before anything has loaded there is nothing to show
 * either way, so the chip stays on Movie rather than jumping.
 */
export function defaultType(groups: FilmGroup[]): TypeFilter {
  const hasMovie = groups.some((g) => g.entries.some((v) => v.type === 'movie'))
  return hasMovie || groups.length === 0 ? 'movie' : 'all'
}

const FILTERS: TypeFilter[] = ['all', ...VIDEO_TYPES]

export function FilterBar({
  search,
  onSearch,
  type,
  onType,
  sort,
  onSort,
  count,
}: {
  search: string
  onSearch: (v: string) => void
  type: TypeFilter
  onType: (v: TypeFilter) => void
  sort: SortMode
  onSort: (v: SortMode) => void
  count: number
}) {
  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search by title, director, description…"
            aria-label="Search titles"
            className="w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-btc)] transition-colors placeholder:text-[var(--color-muted)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="text-sm text-[var(--color-muted)]">
            Sort
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => onSort(e.target.value as SortMode)}
            className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--color-btc)] transition-colors"
          >
            <option value="recent">Newest</option>
            <option value="title">Title A–Z</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const active = f === type
          return (
            <button
              key={f}
              type="button"
              onClick={() => onType(f)}
              aria-pressed={active}
              className={`font-condensed uppercase tracking-wider px-3 py-1.5 rounded-md text-xs border transition-colors ${
                active
                  ? 'bg-[var(--color-btc)] text-black border-[var(--color-btc)] font-semibold'
                  : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-muted)]'
              }`}
            >
              {f === 'all' ? 'All' : typeLabel(f as VideoType)}
            </button>
          )
        })}

        <span className="ml-auto font-condensed uppercase tracking-widest text-xs text-[var(--color-muted)]">
          {count} title{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  )
}
