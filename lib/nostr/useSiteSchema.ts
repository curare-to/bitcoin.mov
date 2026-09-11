'use client'

import { useEffect, useState } from 'react'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import {
  parseCuratedSchemaEvent,
  type CuratedSchema,
} from './curatedSchemaEvent'

/* ------------------------------------------------------------------ *
 * The schema this site has actually published.
 *
 * `npm run seed:schema` writes the signed kind 31889 event to
 * public/.well-known/curare.to/nostr.json, and the static export serves it.
 * It is the site's single source of truth about its own list: the pubkey that
 * signed it is the curator, which fixes the schema coordinate suggestions must
 * reply to, whose canonical events count, and (via its `relay` tags) where to
 * read all of that from. Nothing about the curator is hardcoded — a site with
 * no such file has no list, and says so.
 *
 * The submit form gates on it and is driven by it; the video store waits for
 * it before subscribing to anything. One fetch serves both.
 *
 * Same-origin. `<Link>` and asset URLs get next.config's `basePath` applied
 * automatically; a hand-written fetch does not, so it is prefixed here from
 * the same variable next.config reads (NEXT_PUBLIC_* is inlined at build).
 * ------------------------------------------------------------------ */

export const SITE_SCHEMA_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/.well-known/curare.to/nostr.json`

export type SiteSchemaState =
  | { status: 'loading'; schema: null; reason: null }
  | { status: 'ready'; schema: CuratedSchema; reason: null }
  | { status: 'unavailable'; schema: null; reason: string }

const LOADING: SiteSchemaState = { status: 'loading', schema: null, reason: null }

/**
 * Fetch the well-known file and turn it into a schema, or say why it can't.
 * Every failure is an `unavailable` with a reason, never a throw — the form
 * shows the reason so the operator can see what's missing.
 */
async function loadSiteSchema(signal: AbortSignal): Promise<SiteSchemaState> {
  let response: Response
  try {
    // `no-cache` revalidates rather than trusting a cached copy, so a freshly
    // published schema shows up without a hard refresh.
    response = await fetch(SITE_SCHEMA_PATH, { signal, cache: 'no-cache' })
  } catch (err) {
    if (signal.aborted) return LOADING
    return unavailable(`could not be fetched (${err instanceof Error ? err.message : 'network error'})`)
  }
  if (!response.ok) return unavailable(`${response.status} ${response.statusText}`.trim())

  let event: unknown
  try {
    event = await response.json()
  } catch {
    return unavailable('is not valid JSON')
  }

  // The file is the signed event itself — nothing beside it that a reader
  // might trust without a signature covering it.
  if (!event || typeof event !== 'object' || !('sig' in event)) {
    return unavailable('is not a signed Nostr event')
  }

  // The site serves it, but the signature is what ties it to the curator —
  // a file is only as trustworthy as the key that signed what's inside it.
  if (!verifyEvent(event as Event)) return unavailable('holds an event whose signature does not verify')

  const schema = parseCuratedSchemaEvent(event as Event)
  if (!schema) return unavailable('holds an event that is not a usable schema')

  return { status: 'ready', schema, reason: null }
}

let cached: Promise<SiteSchemaState> | null = null

/**
 * The site's published schema, fetched once per page load and shared by
 * everything that needs it — the store and the submit form both do, and they
 * must agree on who the curator is.
 */
export function siteSchema(): Promise<SiteSchemaState> {
  if (!cached) {
    cached = loadSiteSchema(new AbortController().signal).catch(() =>
      unavailable('could not be loaded'),
    )
  }
  return cached
}

function unavailable(reason: string): SiteSchemaState {
  return { status: 'unavailable', schema: null, reason }
}

/** The site's published schema, for components. */
export function useSiteSchema(): SiteSchemaState {
  const [state, setState] = useState<SiteSchemaState>(LOADING)

  useEffect(() => {
    let cancelled = false
    siteSchema().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
