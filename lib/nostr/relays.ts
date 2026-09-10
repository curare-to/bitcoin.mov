import { NAMESPACE_HASHTAG, SUGGESTION_KIND } from './schemaEvent'

export { SUGGESTION_KIND }

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
 * Legacy discovery hashtag, kept on every suggestion we write and still used
 * as a relay filter so entries published before schemas existed keep showing
 * up. It is **not** the namespace and it is not required: a suggestion is a
 * reply to its schema event, and the `a` tag naming `31889:<pubkey>:<d>` is
 * what actually scopes it. See SCHEMA_NAMESPACE in schemaEvent.ts.
 */
export const NAMESPACE_TAG = NAMESPACE_HASHTAG
