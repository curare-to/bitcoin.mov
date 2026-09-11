/**
 * The relays this list lives on — the ONE place to change before deploying.
 *
 * Both the app (lib/nostr/relays.ts) and the scripts (scripts/lib.mjs) read
 * from here, so publishing and reading can't drift onto different relays. This
 * file has no imports on purpose: plain Node loads it as well as the bundler.
 *
 * Before going live:
 *   - Use `wss://`, not `ws://`. GitHub Pages serves over https, and browsers
 *     refuse an insecure websocket from an https page — the app would connect
 *     to nothing and show nothing, with no error to speak of.
 *   - Then re-run `npm run seed` so the schema, suggestions and curated entries
 *     actually exist on the relays the deployed site reads.
 */
export const READ_RELAYS = ['ws://localhost:10547'] as const

export const WRITE_RELAYS = ['ws://localhost:10547'] as const
