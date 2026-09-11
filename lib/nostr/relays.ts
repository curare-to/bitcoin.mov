import { CURATED_SUGGESTION_KIND } from './curatedSchemaEvent'

export { CURATED_SUGGESTION_KIND }

/**
 * Relay set — defined in relayList.ts so the seed scripts share it. Publishing
 * is best-effort, so a relay being down is not fatal.
 */
export { READ_RELAYS, WRITE_RELAYS } from './relayList'
