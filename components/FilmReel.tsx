'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Link from 'next/link'
import { Poster } from './ui/Poster'
import { useVideos } from '@/lib/nostr/useVideos'
import { curatedFilms, type FilmGroup } from '@/lib/util/dedup'
import { DEFAULT_TYPE } from './FilterBar'
import { typeLabel, timeAgo, isLandscapeThumb } from '@/lib/util/format'
import { VIDEO_TYPES, type VideoType } from '@/lib/nostr/schema'

/**
 * A horizontal reel of the newest suggestions at the top of the page,
 * mempool.space-style. Each thumbnail is its OWN little strip of film — a
 * poster set into film stock with sprocket-hole perforations along just its
 * top and bottom edges — and the cells are spaced apart. The newest sits at
 * the head, tinted amber like a pending block.
 */
type TypeFilter = VideoType | 'all'

export function FilmReel() {
  const { videos } = useVideos()
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [type, setType] = useState<TypeFilter>(DEFAULT_TYPE)

  const allGroups = useMemo(() => curatedFilms(videos), [videos])

  // Only offer chips for types that actually have films.
  const availableTypes = useMemo(() => {
    const present = new Set<VideoType>()
    for (const g of allGroups) for (const v of g.entries) present.add(v.type)
    return VIDEO_TYPES.filter((t) => present.has(t))
  }, [allGroups])

  // The full timeline for the selected type, ordered by release year in the
  // chosen direction — every match shows, so neither the earliest nor the
  // latest is hidden. Missing years sort to the end; publish time breaks ties.
  const reel = useMemo(() => {
    const filtered =
      type === 'all'
        ? allGroups
        : allGroups.filter((g) => g.entries.some((v) => v.type === type))
    const ascending = [...filtered].sort((a, b) => {
      const ya = a.primary.year ?? Infinity
      const yb = b.primary.year ?? Infinity
      if (ya !== yb) return ya - yb
      return a.primary.createdAt - b.primary.createdAt
    })
    return dir === 'asc' ? ascending : ascending.reverse()
  }, [allGroups, type, dir])

  // The most recent release keeps the amber highlight, whichever way it's sorted.
  const newestKey = useMemo(() => {
    let best: FilmGroup | null = null
    for (const g of reel) {
      if (
        !best ||
        (g.primary.year ?? -Infinity) > (best.primary.year ?? -Infinity) ||
        ((g.primary.year ?? -Infinity) === (best.primary.year ?? -Infinity) &&
          g.primary.createdAt > best.primary.createdAt)
      ) {
        best = g
      }
    }
    return best?.key
  }, [reel])

  // Scroll affordance: show left/right arrows only when there's more to reach.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const updateEdges = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    })
  }, [])

  useEffect(() => {
    updateEdges()
    const el = scrollRef.current
    if (!el) return
    window.addEventListener('resize', updateEdges)
    return () => window.removeEventListener('resize', updateEdges)
    // Recompute when the visible set changes (filter/direction/new events).
  }, [updateEdges, reel, type, dir])

  const nudge = (direction: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  if (allGroups.length === 0) return null

  return (
    <section
      aria-label="Curated titles by year"
      className="border-b border-[var(--color-border)]"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-condensed uppercase tracking-[0.25em] text-[11px] text-[var(--color-muted)]">
            On screen · by year
          </span>
          <button
            type="button"
            onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={`Sort by year, ${
              dir === 'asc' ? 'oldest to newest' : 'newest to oldest'
            }. Click to reverse.`}
            className="font-condensed uppercase tracking-widest text-[10px] text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer inline-flex items-center gap-1 shrink-0"
          >
            {dir === 'asc' ? 'oldest ▸ newest' : 'newest ▸ oldest'}
            <span aria-hidden className="text-[var(--color-btc)]">⇅</span>
          </button>
        </div>

        {availableTypes.length > 1 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <TypeChip active={type === 'all'} onClick={() => setType('all')}>
              All
            </TypeChip>
            {availableTypes.map((t) => (
              <TypeChip
                key={t}
                active={type === t}
                onClick={() => setType(t)}
              >
                {typeLabel(t)}
              </TypeChip>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={updateEdges}
          className="reel-scroll overflow-x-auto"
          style={{
            maskImage:
              'linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, #000 48px, #000 calc(100% - 48px), transparent)',
          }}
        >
          {reel.length === 0 ? (
            <p className="px-4 sm:px-6 py-8 font-condensed uppercase tracking-widest text-[11px] text-[var(--color-muted)]">
              {type === 'all'
                ? 'Nothing curated yet.'
                : `No ${typeLabel(type as VideoType)} entries yet.`}
            </p>
          ) : (
            <div className="flex gap-3 w-max px-4 sm:px-6 py-3">
              {reel.map((group) => (
                <FilmFrame
                  key={group.key}
                  group={group}
                  featured={group.key === newestKey}
                />
              ))}
            </div>
          )}
        </div>

        {edges.left && <ScrollArrow dir="left" onClick={() => nudge(-1)} />}
        {edges.right && <ScrollArrow dir="right" onClick={() => nudge(1)} />}
      </div>
    </section>
  )
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-condensed uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-[3px] border transition-colors ${
        active
          ? 'bg-[var(--color-btc)] text-black border-[var(--color-btc)] font-semibold'
          : 'border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-muted)]'
      }`}
    >
      {children}
    </button>
  )
}

function ScrollArrow({
  dir,
  onClick,
}: {
  dir: 'left' | 'right'
  onClick: () => void
}) {
  const left = dir === 'left'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={left ? 'Scroll left' : 'Scroll right'}
      className={`absolute top-1/2 -translate-y-1/2 z-10 grid place-items-center w-9 h-9 rounded-full bg-black/70 border border-[var(--color-border-2)] text-[var(--color-text)] backdrop-blur hover:bg-black/90 hover:text-[var(--color-btc)] hover:border-[var(--color-btc)] transition-colors cursor-pointer ${
        left ? 'left-2' : 'right-2'
      }`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={left ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}

function FilmFrame({
  group,
  featured,
}: {
  group: FilmGroup
  featured: boolean
}) {
  const v = group.primary
  // Fixed cell height keeps the strip aligned; width follows the aspect —
  // landscape (16:9) for YouTube stills, portrait (2:3) for poster art.
  const landscape = isLandscapeThumb(v.image)

  return (
    <Link
      href={`/video?id=${encodeURIComponent(v.id)}`}
      className={`group block shrink-0 ${landscape ? 'w-[408px]' : 'w-[158px]'}`}
    >
      <div
        className={`film-stock rounded-[3px] overflow-hidden transition-transform duration-200 group-hover:-translate-y-0.5 ${
          featured
            ? 'ring-2 ring-[var(--color-btc)]'
            : 'ring-1 ring-white/10'
        }`}
      >
        {/* top perforations for this cell */}
        <div className="sprockets h-[17px]" />

        <div className="relative px-1">
          <div className="relative overflow-hidden rounded-[1px]">
            <Poster
              src={v.image}
              alt={v.title}
              className="h-[225px]"
              imgClassName="poster-img group-hover:scale-[1.04] transition-transform duration-300"
            />

            {featured && (
              <div className="absolute top-0 inset-x-0 h-0.5 bg-[var(--color-btc)]" />
            )}

            <div className="absolute top-1 left-1 font-condensed uppercase tracking-wider text-[10px] px-1.5 py-px rounded-[2px] bg-black/75 text-[var(--color-amber)]">
              {typeLabel(v.type)}
            </div>
            {v.year && (
              <div className="absolute top-1 right-1 font-condensed text-[10px] px-1.5 py-px rounded-[2px] bg-black/75 text-[var(--color-text)]">
                {v.year}
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black via-black/80 to-transparent">
              <h3 className="font-condensed uppercase text-[13px] leading-tight tracking-wide line-clamp-2 text-[var(--color-text)] group-hover:text-[var(--color-btc)] transition-colors">
                {v.title}
              </h3>
              <p className="font-condensed text-[10px] text-[var(--color-muted)] mt-0.5">
                {timeAgo(v.createdAt)}
                {group.entries.length > 1 &&
                  ` · ×${group.entries.length}`}
              </p>
            </div>
          </div>
        </div>

        {/* bottom perforations for this cell */}
        <div className="sprockets h-[17px]" />
      </div>
    </Link>
  )
}
