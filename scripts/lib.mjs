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
 * Unsigned mode: NOSTR_NPUB given and NOSTR_NSEC not.
 *
 * The scripts can build every event a curator needs from the pubkey alone —
 * reply roots, `p` tags, coordinates — but signing takes the key, and there
 * is no reason a seed script should hold it. With only the npub, each script
 * that would have signed prints the unsigned events instead, one JSON object
 * per line on stdout, with `pubkey` filled in so the signer can check whom
 * it is signing for. Everything else it says goes to stderr, so
 *
 *   NOSTR_NPUB=npub1... npm run --silent seed:schema > schema.json
 *
 * captures nothing but the event. Sign it however you sign things — a
 * hardware device, a bunker, `nak` — and publish it yourself.
 */
export const UNSIGNED = Boolean(process.env.NOSTR_NPUB) && !process.env.NOSTR_NSEC

/** Narration. Off stdout in unsigned mode, so stdout is only events. */
export const say = UNSIGNED ? console.error : console.log

/** Print an unsigned event for external signing: stdout, one line, pubkey set. */
export function emitUnsigned(template, pubkey) {
  const { kind, created_at, tags, content } = template
  console.log(JSON.stringify({ kind, created_at, tags, content, pubkey }))
}

/**
 * Who is publishing, and whether we can sign for them.
 *
 *   NOSTR_NSEC  → { pubkey, sk, canSign: true }
 *   NOSTR_NPUB  → { pubkey, sk: null, canSign: false }   (unsigned mode)
 *   neither     → exits with instructions
 *
 * Both set: the nsec is used, and the npub must be its own — a mismatch means
 * someone is confused about which key this is, which is worth stopping for.
 */
export function readSigner(usage) {
  const nsec = process.env.NOSTR_NSEC
  const npub = process.env.NOSTR_NPUB

  if (!nsec && !npub) {
    console.error(
      `\nMissing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... ${usage}\n\n` +
        'Or, to sign elsewhere, give only the public key and the unsigned\n' +
        'events are printed to stdout instead:\n' +
        `  NOSTR_NPUB=npub1... ${usage} > events.jsonl\n\n` +
        'Or preview first by adding --dry-run.',
    )
    process.exit(1)
  }

  let npubHex = null
  if (npub) {
    try {
      const decoded = nip19.decode(npub.trim())
      if (decoded.type !== 'npub') throw new Error('not an npub')
      npubHex = decoded.data
    } catch {
      console.error('NOSTR_NPUB is not a valid npub1… key.')
      process.exit(1)
    }
  }

  if (!nsec) return { pubkey: npubHex, sk: null, canSign: false }

  let sk
  try {
    const decoded = nip19.decode(nsec.trim())
    if (decoded.type !== 'nsec') throw new Error('not an nsec')
    sk = decoded.data
  } catch {
    console.error('NOSTR_NSEC is not a valid nsec1… key.')
    process.exit(1)
  }
  const pubkey = getPublicKey(sk)
  if (npubHex && npubHex !== pubkey) {
    console.error(
      `NOSTR_NPUB (${short(npubHex)}) is not the public key of NOSTR_NSEC ` +
        `(${short(pubkey)}). Which key is this?`,
    )
    process.exit(1)
  }
  return { pubkey, sk, canSign: true }
}

/** The curator's pubkey from the environment alone, if either key is given. */
export function curatorFromEnv() {
  const nsec = process.env.NOSTR_NSEC
  const npub = process.env.NOSTR_NPUB
  try {
    if (nsec) {
      const d = nip19.decode(nsec.trim())
      if (d.type === 'nsec') return getPublicKey(d.data)
    }
    if (npub) {
      const d = nip19.decode(npub.trim())
      if (d.type === 'npub') return d.data
    }
  } catch {
    // reported properly by readSigner when it matters
  }
  return null
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
  return wellKnownSchema()?.namespace ?? null
}

/** The schema in the well-known file, signature checked — or null. */
export function wellKnownSchema() {
  try {
    const event = JSON.parse(readFileSync(WELL_KNOWN, 'utf8'))
    if (!event?.sig || !verifyEvent(event)) return null
    return parseCuratedSchemaEvent(event)
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
  // Who the site is committed to, in order of how much they've told us: the
  // signed schema on disk says everything; a key in the environment says only
  // who — enough to build against, since a coordinate needs only the pubkey.
  const local = wellKnownSchema()
  const curator = local?.namespace ?? curatorFromEnv()

  const events = await pool.querySync(relays, { kinds: [CURATED_SCHEMA_KIND], limit: 50 })
  const candidates = events
    .map(parseCuratedSchemaEvent)
    .filter((s) => s !== null && s.identifier === DEFAULT_CURATED_SCHEMA.identifier)
    .sort((a, b) => (b.source?.createdAt ?? 0) - (a.source?.createdAt ?? 0))

  const published = curator
    ? candidates.find((s) => s.namespace === curator)
    : candidates[0]
  const others = [...new Set(
    candidates.filter((s) => s.namespace !== (published ?? local)?.namespace).map((s) => s.namespace),
  )]

  const schema =
    published ??
    local ??
    (curator
      ? { ...DEFAULT_CURATED_SCHEMA, namespace: curator, relays: [...WRITE_RELAYS] }
      : DEFAULT_CURATED_SCHEMA)

  return {
    schema,
    /** The relay has this curator's schema. */
    published: Boolean(published),
    /** The schema came from disk or the environment, not (yet) the relay. */
    assumed: !published && Boolean(schema.namespace),
    curator: schema.namespace || null,
    others,
  }
}

/**
 * Which relays can actually be reached. `querySync` on a dead relay returns an
 * empty list, indistinguishable from an empty relay, and "0 entries" is a
 * misleading thing to report when the truth is "nothing answered". Check
 * first, and say so.
 */
export async function checkRelays(pool, relays = RELAYS) {
  const reachable = []
  const unreachable = []
  await Promise.all(
    relays.map(async (url) => {
      try {
        await pool.ensureRelay(url, { connectionTimeout: 4000 })
        reachable.push(url)
      } catch {
        unreachable.push(url)
      }
    }),
  )
  return { reachable, unreachable }
}

/**
 * Exit unless at least one relay answers, naming the ones that didn't.
 * Every script that reads or publishes calls this first.
 */
export async function requireRelays(pool, relays = RELAYS) {
  const { reachable, unreachable } = await checkRelays(pool, relays)
  for (const url of unreachable) console.error(`! ${url} is not reachable`)
  if (reachable.length === 0) {
    console.error(
      `\nNo relay answered. ${relays.length === 1 ? 'Is it running?' : 'Are they running?'} ` +
        'Nothing read, nothing published.',
    )
    process.exit(1)
  }
  return reachable
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
