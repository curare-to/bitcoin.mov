/**
 * Seed — run the three seeding steps in order.
 *
 * The list is three kinds of event by three kinds of author, so seeding it
 * convincingly takes three steps:
 *
 *   1. seed:schema       kind 31889, signed by YOUR key — the schema and the
 *                        list's identity. Your pubkey becomes the curator.
 *   2. seed:suggestions  kind 31888, signed by a cast of generated throwaway
 *                        keys — the crowd suggesting titles in reply to it.
 *   3. seed:curated      kind 31890, signed by YOUR key — the ones you sign off
 *                        on, referencing the suggestions they came from.
 *
 * Each step also runs on its own; this just chains them and stops at the first
 * failure. Steps 1 and 3 need NOSTR_NSEC — step 2 signs as other people.
 *
 *   npm run seed:dry                  # preview all three, nothing signed
 *   NOSTR_NSEC=nsec1... npm run seed
 *
 * To keep the key out of it entirely, give only the npub. Steps 1 and 3 then
 * print their events unsigned to stdout instead of signing and publishing —
 * step 2 still publishes, since its authors are generated keys — and all
 * narration goes to stderr, so this captures exactly the events you need to
 * sign:
 *
 *   NOSTR_NPUB=npub1... npm run --silent seed > to-sign.jsonl
 *
 * Every step is idempotent: all three kinds are addressable and the generated
 * authors are derived from a fixed salt, so re-running replaces rather than
 * duplicates.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { UNSIGNED, say } from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

const STEPS = [
  ['1/3  schema', 'schema.mjs'],
  ['2/3  suggestions', 'seed-suggestions.mjs'],
  ['3/3  curated', 'seed-curated.mjs'],
]

for (const [label, script] of STEPS) {
  say(`\n${'─'.repeat(60)}\n${label}\n${'─'.repeat(60)}`)
  const result = spawnSync(
    process.execPath,
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(here, script), ...args],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) {
    console.error(`\nStopped: ${script} exited with ${result.status}.`)
    process.exit(result.status ?? 1)
  }
}

say(
  `\n${'─'.repeat(60)}\n` +
    (args.includes('--dry-run')
      ? 'Previewed. Nothing was signed or published.'
      : UNSIGNED
        ? 'Unsigned events are on stdout. Sign and publish them, save the signed\n' +
          'schema as public/.well-known/curare.to/nostr.json, then: npm run verify'
        : 'Seeded. Check it with:  npm run verify'),
)
