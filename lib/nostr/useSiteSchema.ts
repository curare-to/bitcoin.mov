'use client'

import { useEffect, useState } from 'react'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import {
  parseCuratedSchemaEvent,
  CURATED_SCHEMA_NAMESPACE,
  type CuratedSchema,
} from './curatedSchemaEvent'

/* ------------------------------------------------------------------ *
 * The schema this site has actually published.
 *
 * `npm run seed:schema` writes the signed kind 31889 event to
 * public/.well-known/curare.to/nostr.json, and the static export serves it. Its
 * presence is what it means for the site to be accepting suggestions: no file,
 * no published schema, nothing to submit to. So the submit form fetches it,
 * gates on it, and — when it's there — is driven by it, rather than by the
 * bundled DEFAULT_CURATED_SCHEMA. The bundled copy is what the *reader* side uses to
 * verify entries off relays; this is what a *writer* is handed to fill in.
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

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return unavailable('is not valid JSON')
  }

  const event = (body as { schema?: unknown })?.schema
  if (!event || typeof event !== 'object') return unavailable('has no `schema` event in it')

  // The site serves it, but the signature is what ties it to the curator —
  // a file is only as trustworthy as the key that signed what's inside it.
  if (!verifyEvent(event as Event)) return unavailable('holds an event whose signature does not verify')

  const schema = parseCuratedSchemaEvent(event as Event)
  if (!schema) return unavailable('holds an event that is not a usable schema')

  // Not fatal — the form should follow what the site publishes — but it means
  // the reader side (CURATED_SCHEMA_NAMESPACE) and the writer side disagree about who
  // the curator is, which is a deploy mistake worth surfacing.
  if (CURATED_SCHEMA_NAMESPACE && schema.namespace !== CURATED_SCHEMA_NAMESPACE) {
    console.warn(
      `${SITE_SCHEMA_PATH} was published by ${schema.namespace.slice(0, 8)}…, ` +
        `but CURATED_SCHEMA_NAMESPACE is ${CURATED_SCHEMA_NAMESPACE.slice(0, 8)}…`,
    )
  }

  return { status: 'ready', schema, reason: null }
}

function unavailable(reason: string): SiteSchemaState {
  return { status: 'unavailable', schema: null, reason }
}

/** The site's published schema, fetched once per mount. */
export function useSiteSchema(): SiteSchemaState {
  const [state, setState] = useState<SiteSchemaState>(LOADING)

  useEffect(() => {
    const controller = new AbortController()
    loadSiteSchema(controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next)
    })
    return () => controller.abort()
  }, [])

  return state
}
