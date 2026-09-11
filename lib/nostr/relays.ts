import { NAMESPACE_HASHTAG, SUGGESTION_KIND } from './schemaEvent'

export { SUGGESTION_KIND }

/**
 * Relay set — defined in relayList.ts so the seed scripts share it. Publishing
 * is best-effort, so a relay being down is not fatal.
 */
export { READ_RELAYS, WRITE_RELAYS } from './relayList'

/**
 * Legacy discovery hashtag, kept on every suggestion we write and still used
 * as a relay filter so entries published before schemas existed keep showing
 * up. It is **not** the namespace and it is not required: a suggestion is a
 * reply to its schema event, and the `a` tag naming `31889:<pubkey>:<d>` is
 * what actually scopes it. See SCHEMA_NAMESPACE in schemaEvent.ts.
 */
export const NAMESPACE_TAG = NAMESPACE_HASHTAG
