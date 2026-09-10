import type { Video } from '@/lib/nostr/schema'

/* ------------------------------------------------------------------ *
 * Duplicate-film collapsing.
 *
 * The list is open, so the same film gets submitted by many different people
 * (each author's entry is independently editable). We group submissions into
 * one "film" card, keyed by:
 *   1. external id (e.g. imdb:tt2821314) when present, else
 *   2. a normalized title + year.
 * The newest submission is the card's representative; the rest are its
 * additional reviews/submissions, surfaced in the detail view.
 * ------------------------------------------------------------------ */

export interface FilmGroup {
  key: string
  /** Newest submission — represents the film in lists. */
  primary: Video
  /** All submissions for this film, newest first (includes primary). */
  submissions: Video[]
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** The grouping key for a single submission. */
export function groupKey(video: Video): string {
  if (video.externalId) return `ext:${video.externalId.toLowerCase().trim()}`
  const t = normalizeTitle(video.title)
  return video.year ? `ty:${t}:${video.year}` : `t:${t}`
}

/**
 * Collapse a flat list of submissions (already sorted newest-first) into
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
    const submissions = groups.get(key)!
    // Input is newest-first, so submissions[0] is the newest.
    return { key, primary: submissions[0], submissions }
  })
}
