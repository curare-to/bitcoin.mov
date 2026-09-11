/**
 * Shared plumbing for the seed / schema / curate / verify scripts.
 *
 * Everything schema-related still comes from lib/nostr/curatedSchemaEvent.ts — the one
 * definition the browser also uses. This module is only the bits a *script*
 * needs: relays, key handling, and talking to a pool.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getPublicKey, verifyEvent } from 'nostr-tools/pure'
import * as nip19 from 'nostr-tools/nip19'
import {
  DEFAULT_CURATED_SCHEMA,
  CURATED_SCHEMA_KIND,
  parseCuratedSchemaEvent,
} from '../lib/nostr/curatedSchemaEvent.ts'
import { WRITE_RELAYS } from '../lib/nostr/relayList.ts'

const args = process.argv.slice(2)

/**
 * Relays every script reads and writes: the same list the app uses, from
 * lib/nostr/relayList.ts, so seeding lands where the site looks. Override with
 * one or more `--relay=ws://…` to aim a run at a scratch relay instead.
 */
export const RELAYS = (() => {
  const given = args
    .filter((a) => a.startsWith('--relay='))
    .map((a) => a.slice('--relay='.length))
  return given.length > 0 ? given : [...WRITE_RELAYS]
})()

/** `--name=value`, repeatable. Returns every value given. */
export function flags(name) {
  const prefix = `--${name}=`
  return args.filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length))
}

/** First `--name=value`, or undefined. */
export function flag(name) {
  return flags(name)[0]
}

/** `--name` present? */
export function has(name) {
  return args.includes(`--${name}`)
}

/** A positive integer flag, with a default. */
export function intFlag(name, fallback) {
  const raw = flag(name)
  if (raw === undefined) return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a non-negative whole number (got "${raw}").`)
    process.exit(1)
  }
  return n
}

/**
 * "wss://relay.damus.io, wss://nos.lol (production)" — the target, and which
 * NODE_ENV chose it. Printed by every script that publishes: with the relay
 * list switching on the environment, this line is what makes a production
 * run recognisable before anything is signed.
 */
export function describeRelays() {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
  return `${RELAYS.join(', ')} (${mode})`
}

export function short(pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}…` : '?'
}

export function tagValue(event, name) {
  return event.tags?.find((t) => t[0] === name && typeof t[1] === 'string')?.[1] ?? ''
}

/**
 * Decode NOSTR_NSEC, or exit with instructions. `usage` is the command line to
 * suggest, so each script can point at itself.
 */
export function readSecretKey(usage) {
  const nsec = process.env.NOSTR_NSEC
  if (!nsec) {
    console.error(
      `\nMissing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... ${usage}\n` +
        'Or preview first by adding --dry-run.',
    )
    process.exit(1)
  }
  try {
    const decoded = nip19.decode(nsec.trim())
    if (decoded.type !== 'nsec') throw new Error('not an nsec')
    return decoded.data
  } catch {
    console.error('NOSTR_NSEC is not a valid nsec1… key.')
    process.exit(1)
  }
}

/**
 * A stable throwaway key for seeded "other people".
 *
 * Deterministic rather than random on purpose: kind 31888 is addressable, so
 * the same author + `d` replaces. Random keys every run would leave the relay
 * accumulating a fresh copy of the whole batch each time. A sha256 digest is a
 * valid secp256k1 scalar for all practical purposes.
 */
export function seededSecretKey(salt, index) {
  return new Uint8Array(createHash('sha256').update(`${salt}:${index}`).digest())
}

/** `count` stable throwaway identities, as { sk, pubkey, npub }. */
export function seededAuthors(salt, count) {
  return Array.from({ length: count }, (_, i) => {
    const sk = seededSecretKey(salt, i)
    const pubkey = getPublicKey(sk)
    return { sk, pubkey, npub: nip19.npubEncode(pubkey) }
  })
}

const WELL_KNOWN = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'public', '.well-known', 'curare.to', 'nostr.json',
)

/**
 * The curator this site is committed to: the pubkey that signed the schema in
 * public/.well-known/curare.to/nostr.json. That file is what the deployed app
 * reads, so it is what the scripts scope to as well — otherwise `verify` could
 * pass a relay the app would show as empty. Null before the file exists.
 */
export function wellKnownCurator() {
  try {
    const doc = JSON.parse(readFileSync(WELL_KNOWN, 'utf8'))
    const event = doc?.schema
    if (!event || !verifyEvent(event)) return null
    return parseCuratedSchemaEvent(event) ? event.pubkey : null
  } catch {
    return null
  }
}

/**
 * The schema as published on the relay, falling back to the bundled default.
 *
 * Scoped to the well-known curator when the site has one: the schema is the
 * one *that* pubkey published, and any other schema on the relay under the
 * same identifier is reported, not silently picked. Before the site has a
 * well-known file — the very first `seed:schema` — the newest schema wins,
 * since there is nothing yet to prefer.
 *
 * Returns `{ schema, published, curator, others }`.
 */
export async function loadSchema(pool, relays = RELAYS) {
  const curator = wellKnownCurator()
  const events = await pool.querySync(relays, { kinds: [CURATED_SCHEMA_KIND], limit: 50 })
  const candidates = events
    .map(parseCuratedSchemaEvent)
    .filter((s) => s !== null && s.identifier === DEFAULT_CURATED_SCHEMA.identifier)
    .sort((a, b) => (b.source?.createdAt ?? 0) - (a.source?.createdAt ?? 0))

  const published = curator
    ? candidates.find((s) => s.namespace === curator)
    : candidates[0]
  const others = [...new Set(
    candidates.filter((s) => s.namespace !== published?.namespace).map((s) => s.namespace),
  )]

  return {
    schema: published ?? DEFAULT_CURATED_SCHEMA,
    published: Boolean(published),
    curator,
    others,
  }
}

/**
 * Publish one event; returns how many relays actually took it.
 *
 * `pool.publish()` does not reject when a relay is unreachable — it *resolves*
 * with the string "connection failure: …" (see the pool's ensureRelay catch in
 * nostr-tools). Counting fulfilled promises therefore reports every dead relay
 * as a success. A relay that rejects the event rejects the promise, so both
 * failure modes have to be excluded.
 *
 * On success the relay's OK `reason` comes back, and that is routinely the
 * empty string — so this cannot test for a truthy value either.
 */
export async function publish(pool, event, relays = RELAYS) {
  const results = await Promise.allSettled(pool.publish([...relays], event))
  return results.filter(
    (r) =>
      r.status === 'fulfilled' &&
      !String(r.value ?? '').startsWith('connection failure:'),
  ).length
}

/** Sockets keep the event loop alive; leave deliberately. */
export function done(pool, code = 0, relays = RELAYS) {
  pool.close([...relays])
  setTimeout(() => process.exit(code), 500)
}

export { nip19 }
