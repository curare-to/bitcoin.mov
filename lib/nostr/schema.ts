import type { Event, EventTemplate } from 'nostr-tools/pure'
import {
  DEFAULT_SCHEMA,
  buildSuggestionTemplate,
  deriveIdentifier as deriveIdentifierFromValues,
  isSafeUrl,
  validateValues,
  verifySuggestion,
  VIDEO_TYPES,
  type SuggestionSchema,
  type VideoType,
} from './schemaEvent'

/* ------------------------------------------------------------------ *
 * kind 31888 — the bitcoin.mov suggestion event (addressable/replaceable).
 *
 * This module turns those events into display-ready `Video` objects and back
 * again. The *shape* of the event — which tags exist, which are required, what
 * each may contain — lives in schemaEvent.ts as a publishable kind 31889
 * schema event; everything here reads and writes through it, so the read and
 * write sides can never drift apart.
 *
 * Events that don't match the schema are rejected, not repaired: relays carry
 * malformed, partial and hostile events from other apps, and a half-parsed
 * entry is worse than a missing one.
 * ------------------------------------------------------------------ */

export { VIDEO_TYPES, isSafeUrl }
export type { VideoType, SuggestionSchema }

export interface WatchLink {
  url: string
  /** Optional marker from the `r` tag, e.g. "watch" | "imdb" | "trailer". */
  label: string | null
}

/** A parsed, display-ready suggestion. */
export interface Video {
  /** Nostr event id (hex). Unique per suggestion version. */
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

/** First tag whose name matches; returns its value (index 1) or null. */
function tagValue(tags: string[][], name: string): string | null {
  const t = tags.find((t) => t[0] === name && typeof t[1] === 'string')
  return t ? t[1] : null
}

function allTags(tags: string[][], name: string): string[][] {
  return tags.filter((t) => t[0] === name && typeof t[1] === 'string')
}

/**
 * Deterministic `d` identifier for a suggestion: the external id when given
 * (so "the same film" stays one editable entry), else a title+year slug.
 */
export function deriveIdentifier(input: SuggestionInput): string {
  return deriveIdentifierFromValues({ ...input })
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
  const v = (value ?? '').trim().toLowerCase()
  return (VIDEO_TYPES as readonly string[]).includes(v)
    ? (v as VideoType)
    : 'other'
}

/** Posters must be https — http ones are blocked as mixed content anyway. */
function safeImage(value: string | null): string | null {
  const url = value?.trim()
  return url && isSafeUrl(url, true) ? url : null
}

function toInt(value: string | null): number | null {
  if (!value) return null
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/* ------------------------------ read ------------------------------- */

/**
 * Parse a raw Nostr event into a Video, or null if it doesn't satisfy the
 * schema. Every rule applied here — required `d` and `title`, allowed types,
 * https-only posters, length caps — comes from the schema event, so tightening
 * the list is a matter of republishing it rather than editing this file.
 */
export function parseSuggestion(
  event: Event,
  schema: SuggestionSchema = DEFAULT_SCHEMA,
): Video | null {
  if (!verifySuggestion(event, schema).ok) return null

  const tags = event.tags
  // `d` and `title` are guaranteed by the schema (normalizeSchema forces them);
  // `type` is not, so it keeps a fallback for schemas that leave it out.
  const identifier = (tagValue(tags, 'd') ?? '').trim()
  const director = tagValue(tags, 'director')
  const lang = tagValue(tags, 'lang')

  // Belt and braces at the render boundary: the schema checks the `r` tags it
  // names (watch, imdb), but an entry may carry `r` tags with other markers,
  // and these URLs go straight into href/src. Never trust an unchecked one.
  const links: WatchLink[] = allTags(tags, 'r')
    .map((t) => ({ url: t[1].trim(), label: t[2] ? t[2].trim() : null }))
    .filter((l) => isSafeUrl(l.url))

  const hashtags = Array.from(
    new Set(
      allTags(tags, 't')
        .map((t) => t[1].trim().toLowerCase())
        .filter(Boolean),
    ),
  )

  return {
    id: event.id,
    pubkey: event.pubkey,
    identifier,
    address: `${schema.kind}:${event.pubkey}:${identifier}`,
    createdAt: event.created_at,
    title: (tagValue(tags, 'title') ?? '').trim(),
    year: toInt(tagValue(tags, 'year')),
    type: coerceType(tagValue(tags, 'type')),
    director: director ? director.trim() : null,
    durationSeconds: toInt(tagValue(tags, 'duration')),
    links,
    image: safeImage(tagValue(tags, 'image')),
    externalId: tagValue(tags, 'i')?.trim() ?? null,
    lang: lang ? lang.trim() : null,
    hashtags,
    description: (event.content ?? '').trim(),
  }
}

/* ------------------------------ write ------------------------------ */

/** Input collected by the suggestion form — keys are schema field names. */
export interface SuggestionInput {
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
  errors: Partial<Record<keyof SuggestionInput | 'visibility', string>>
}

/**
 * Validate form input against the schema before we bother the signer
 * extension. Pass the connected `pubkey` so a non-public schema can check
 * whether this key is allowed to submit at all.
 */
export function validateInput(
  input: SuggestionInput,
  schema: SuggestionSchema = DEFAULT_SCHEMA,
  options: { pubkey?: string } = {},
): ValidationResult {
  const errors = validateValues({ ...input }, schema, options)
  return { ok: Object.keys(errors).length === 0, errors }
}

/**
 * Build the unsigned kind 31888 event template from validated input.
 * The extension (NIP-07) fills in pubkey/id/sig — we never touch a key here.
 *
 * `dOverride` reuses an existing entry's `d` when editing, so the new event
 * replaces the old one instead of creating a duplicate.
 */
export function buildSuggestion(
  input: SuggestionInput,
  dOverride?: string,
  schema: SuggestionSchema = DEFAULT_SCHEMA,
): EventTemplate {
  return buildSuggestionTemplate({ ...input }, schema, { identifier: dOverride })
}

/** Reverse of buildSuggestion: fill the form from an existing entry, for editing. */
export function videoToInput(video: Video): SuggestionInput {
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
