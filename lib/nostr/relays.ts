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
 */
export const MOVIE_KIND = 31888

/**
 * Namespace hashtag. Custom kind numbers are shared — kind 1888, for instance,
 * is already squatted by an unrelated encrypted-note app. 31888 is currently
 * clean, but scoping reads to this tag (which every bitcoin.mov submission
 * carries) future-proofs against a foreign app crowding real entries out of a
 * relay's `limit` window. The parser still requires a `title` tag as a second
 * line of defense.
 */
export const NAMESPACE_TAG = 'bitcoin'
