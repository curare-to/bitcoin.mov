import { NAMESPACE_HASHTAG, SUBMISSION_KIND } from './schemaEvent'

/**
 * Relay set.
 *
 * Currently pointed at a single local relay for development. Publishing is
 * best-effort (Promise.allSettled), so a relay being down is not fatal.
 * Note: `ws://` (not `wss://`) only works when the app itself is served over
 * http — a browser on an https page blocks insecure-websocket connections.
 */
export const READ_RELAYS = ['ws://localhost:10547'] as const

export const WRITE_RELAYS = ['ws://localhost:10547'] as const

/**
 * The kind that identifies a bitcoin.mov submission.
 *
 * 31888 is an **addressable** (parameterized-replaceable) kind (range
 * 30000–39999). The coordinate `(kind, pubkey, d)` is unique, so an author can
 * edit their entry by republishing with the same `d` tag — relays keep only the
 * latest version. See `deriveIdentifier` / `replaceableKey` in schema.ts.
 *
 * Defined in schemaEvent.ts alongside the kind 31889 schema that describes it.
 */
export const MOVIE_KIND = SUBMISSION_KIND

/**
 * Legacy discovery hashtag, kept on every submission we write and still used
 * as a relay filter so entries published before schemas existed keep showing
 * up. It is **not** required: the namespace is the schema author's pubkey, and
 * entries declare which schema they follow with an `a` tag pointing at
 * `31889:<pubkey>:<d>`. See SCHEMA_NAMESPACE in schemaEvent.ts.
 */
export const NAMESPACE_TAG = NAMESPACE_HASHTAG
