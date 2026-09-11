import type { Video } from '@/lib/nostr/schema'

/* ------------------------------------------------------------------ *
 * Duplicate-film collapsing.
 *
 * The list is open, so the same film gets suggested by many different people
 * (each author's entry is independently editable). We group entries into
 * one "film" card, keyed by:
 *   1. external id (e.g. imdb:tt2821314) when present, else
 *   2. a normalized title + year.
 * The curated entry represents the card when there is one, else the newest;
 * the rest are its additional reviews, surfaced in the detail view.
 * ------------------------------------------------------------------ */

export interface FilmGroup {
  key: string
  /** Represents the film in lists: the curated entry, else the newest. */
  primary: Video
  /** Every entry for this film, newest first (includes primary). */
  entries: Video[]
}

/**
 * The films the curator has signed off on — what the home page lists.
 *
 * Grouping runs over *every* entry first, then groups without a curated one are
 * dropped. Filtering the videos instead would work, but each group would then
 * know only about its curated entry, losing the "+N more suggestions" count and
 * the sibling list on the detail page. The curated entry represents the film;
 * the suggestions behind it are still worth knowing about.
 */
export function curatedFilms(videos: Video[]): FilmGroup[] {
  return groupFilms(videos).filter((group) => group.primary.curated)
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** The grouping key for a single entry. */
export function groupKey(video: Video): string {
  if (video.externalId) return `ext:${video.externalId.toLowerCase().trim()}`
  const t = normalizeTitle(video.title)
  return video.year ? `ty:${t}:${video.year}` : `t:${t}`
}

/**
 * Collapse a flat list of entries (already sorted newest-first) into
 * de-duplicated film groups, preserving newest-first order by representative.
 */
export function groupFilms(videos: Video[]): FilmGroup[] {
  const groups = new Map<string, Video[]>()
  const order: string[] = []

  for (const video of videos) {
    const key = groupKey(video)
    let bucket = groups.get(key)
    if (!bucket) {
      bucket = []
      groups.set(key, bucket)
      order.push(key)
    }
    bucket.push(video)
  }

  return order.map((key) => {
    const entries = groups.get(key)!
    // Input is newest-first, so entries[0] is the newest. A curated entry
    // outranks it: the curator's version represents the film, however many
    // people suggested it or how recently.
    const primary = entries.find((v) => v.curated) ?? entries[0]
    return { key, primary, entries }
  })
}
