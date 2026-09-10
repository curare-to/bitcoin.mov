import type { Event, EventTemplate } from 'nostr-tools/pure'
import { MOVIE_KIND } from './relays'

/* ------------------------------------------------------------------ *
 * kind 31888 — the bitcoin.mov submission event (addressable/replaceable).
 *
 * This module is the SINGLE SOURCE OF TRUTH for the event shape. It reads
 * events defensively (relays contain malformed / partial / spam events from
 * other apps and bad actors) and builds them for submission, so the read and
 * write sides can never drift apart.
 * ------------------------------------------------------------------ */

export const VIDEO_TYPES = [
  'movie',
  'documentary',
  'short',
  'interview',
  'series',
  'other',
] as const

export type VideoType = (typeof VIDEO_TYPES)[number]

/** Field length caps — spam/abuse defense; truncate rather than reject. */
const CAP = {
  title: 200,
  director: 120,
  description: 4000,
  tag: 60,
  url: 500,
} as const

export interface WatchLink {
  url: string
  /** Optional marker from the `r` tag, e.g. "watch" | "imdb" | "trailer". */
  label: string | null
}

/** A parsed, display-ready submission. */
export interface Video {
  /** Nostr event id (hex). Unique per submission version. */
  id: string
  /** Author pubkey (hex). */
  pubkey: string
  /** The `d` tag — stable identifier for this entry under its author. */
  identifier: string
  /** Addressable coordinate `kind:pubkey:d` — unique per editable entry. */
  address: string
  /** Unix seconds. */
  createdAt: number
  title: string
  year: number | null
  type: VideoType
  director: string | null
  durationSeconds: number | null
  /** Safe (https / http) links to watch or reference. */
  links: WatchLink[]
  /** Poster/thumbnail, https only (avoids mixed-content blocking). */
  image: string | null
  /** External id for dedup, e.g. "imdb:tt2821314" (NIP-73 `i` tag). */
  externalId: string | null
  lang: string | null
  hashtags: string[]
  /** Freeform review/description (plain text — never rendered as HTML). */
  description: string
}

/* ----------------------------- helpers ----------------------------- */

/** True only for http(s) URLs. Blocks javascript:, data:, etc. */
export function isSafeUrl(value: string, httpsOnly = false): boolean {
  try {
    const u = new URL(value)
    if (httpsOnly) return u.protocol === 'https:'
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function clip(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/** First tag whose name matches; returns its value (index 1) or null. */
function tagValue(tags: string[][], name: string): string | null {
  const t = tags.find((t) => t[0] === name && typeof t[1] === 'string')
  return t ? t[1] : null
}

function allTags(tags: string[][], name: string): string[][] {
  return tags.filter((t) => t[0] === name && typeof t[1] === 'string')
}

/** URL/tag-safe slug for a `d` identifier fallback. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/**
 * Deterministic `d` identifier for a submission: the external id when given
 * (so "the same film" stays one editable entry), else a title+year slug.
 */
export function deriveIdentifier(input: SubmitInput): string {
  const ext = input.externalId.trim().toLowerCase()
  if (ext) return ext
  const y = coerceYear(input.year)
  return slug(y ? `${input.title}-${y}` : input.title) || 'untitled'
}

/**
 * The replaceable coordinate key `pubkey:d`. Two events with the same key are
 * versions of one entry — keep the newest.
 */
export function replaceableKey(event: {
  pubkey: string
  tags: string[][]
}): string {
  const d = tagValue(event.tags, 'd') ?? ''
  return `${event.pubkey}:${d}`
}

function coerceType(value: string | null): VideoType {
  const v = (value ?? '').toLowerCase().trim()
  return (VIDEO_TYPES as readonly string[]).includes(v)
    ? (v as VideoType)
    : 'other'
}

function coerceYear(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null
}

function coerceDuration(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 && n < 60 * 60 * 24 ? n : null
}

/* ------------------------------ read ------------------------------- */

/**
 * Parse a raw Nostr event into a Video, or null if it isn't a usable
 * submission. A submission MUST have a non-empty title and at least the right
 * kind — everything else is optional and defended with fallbacks.
 */
export function parseEvent(event: Event): Video | null {
  if (event.kind !== MOVIE_KIND) return null
  const tags = Array.isArray(event.tags) ? event.tags : []

  const rawTitle = tagValue(tags, 'title')
  const title = rawTitle ? clip(rawTitle, CAP.title) : ''
  if (!title) return null // no title → not a usable entry

  const identifier = tagValue(tags, 'd') ?? ''

  const links: WatchLink[] = allTags(tags, 'r')
    .map((t) => ({ url: clip(t[1], CAP.url), label: t[2] ? clip(t[2], CAP.tag) : null }))
    .filter((l) => isSafeUrl(l.url))

  const rawImage = tagValue(tags, 'image')
  const image = rawImage && isSafeUrl(rawImage, true) ? clip(rawImage, CAP.url) : null

  const hashtags = Array.from(
    new Set(
      allTags(tags, 't')
        .map((t) => clip(t[1], CAP.tag).toLowerCase())
        .filter(Boolean),
    ),
  )

  const director = tagValue(tags, 'director')
  const lang = tagValue(tags, 'lang')

  return {
    id: event.id,
    pubkey: event.pubkey,
    identifier,
    address: `${MOVIE_KIND}:${event.pubkey}:${identifier}`,
    createdAt: event.created_at,
    title,
    year: coerceYear(tagValue(tags, 'year')),
    type: coerceType(tagValue(tags, 'type')),
    director: director ? clip(director, CAP.director) : null,
    durationSeconds: coerceDuration(tagValue(tags, 'duration')),
    links,
    image,
    externalId: tagValue(tags, 'i'),
    lang: lang ? clip(lang, CAP.tag) : null,
    hashtags,
    description: clip(event.content ?? '', CAP.description),
  }
}

/* ------------------------------ write ------------------------------ */

/** Input collected by the submission form. */
export interface SubmitInput {
  title: string
  year: string
  type: VideoType
  director: string
  durationSeconds: string
  watchUrl: string
  imdbUrl: string
  image: string
  externalId: string
  lang: string
  description: string
}

export interface ValidationResult {
  ok: boolean
  errors: Partial<Record<keyof SubmitInput, string>>
}

/** Validate form input before we bother the signer extension. */
export function validateInput(input: SubmitInput): ValidationResult {
  const errors: ValidationResult['errors'] = {}

  if (!input.title.trim()) errors.title = 'Title is required.'
  if (!input.watchUrl.trim()) {
    errors.watchUrl = 'A watch/reference URL is required.'
  } else if (!isSafeUrl(input.watchUrl.trim())) {
    errors.watchUrl = 'Must be a valid http(s) URL.'
  }
  if (input.imdbUrl.trim() && !isSafeUrl(input.imdbUrl.trim())) {
    errors.imdbUrl = 'Must be a valid http(s) URL.'
  }
  if (input.image.trim() && !isSafeUrl(input.image.trim(), true)) {
    errors.image = 'Poster must be an https URL.'
  }
  if (input.year.trim() && coerceYear(input.year) === null) {
    errors.year = 'Enter a year between 1900 and 2100.'
  }
  if (input.durationSeconds.trim() && coerceDuration(input.durationSeconds) === null) {
    errors.durationSeconds = 'Duration must be a positive number of seconds.'
  }

  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * Build the unsigned kind 31888 event template from validated input.
 * The extension (NIP-07) fills in pubkey/id/sig — we never touch a key here.
 *
 * `dOverride` reuses an existing entry's `d` when editing, so the new event
 * replaces the old one instead of creating a duplicate.
 */
export function buildTemplate(input: SubmitInput, dOverride?: string): EventTemplate {
  const identifier = dOverride?.trim() || deriveIdentifier(input)
  const tags: string[][] = [
    ['d', identifier], // makes the event addressable/replaceable
    ['title', input.title.trim()],
  ]

  const year = coerceYear(input.year)
  if (year) tags.push(['year', String(year)])

  tags.push(['type', input.type])

  if (input.director.trim()) tags.push(['director', clip(input.director, CAP.director)])

  const duration = coerceDuration(input.durationSeconds)
  if (duration) tags.push(['duration', String(duration)])

  if (input.watchUrl.trim()) tags.push(['r', input.watchUrl.trim(), 'watch'])
  if (input.imdbUrl.trim()) tags.push(['r', input.imdbUrl.trim(), 'imdb'])
  if (input.image.trim()) tags.push(['image', input.image.trim()])
  if (input.externalId.trim()) tags.push(['i', clip(input.externalId, CAP.tag)])
  if (input.lang.trim()) tags.push(['lang', clip(input.lang, CAP.tag)])

  // Discoverability hashtags: always "bitcoin", plus the type.
  tags.push(['t', 'bitcoin'])
  tags.push(['t', input.type])

  return {
    kind: MOVIE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: clip(input.description, CAP.description),
  }
}

/** Reverse of buildTemplate: fill the form from an existing entry, for editing. */
export function videoToInput(video: Video): SubmitInput {
  const imdb = video.links.find((l) => l.label === 'imdb')
  const watch = video.links.find((l) => l !== imdb) ?? video.links[0] ?? null
  return {
    title: video.title,
    year: video.year ? String(video.year) : '',
    type: video.type,
    director: video.director ?? '',
    durationSeconds: video.durationSeconds ? String(video.durationSeconds) : '',
    watchUrl: watch?.url ?? '',
    imdbUrl: imdb?.url ?? '',
    image: video.image ?? '',
    externalId: video.externalId ?? '',
    lang: video.lang ?? '',
    description: video.description,
  }
}

/** The single "best" link to watch — prefers an explicit `watch` marker. */
export function primaryLink(video: Video): WatchLink | null {
  return (
    video.links.find((l) => l.label === 'watch') ??
    video.links.find((l) => l.label !== 'imdb') ??
    video.links[0] ??
    null
  )
}
