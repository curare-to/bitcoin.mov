/**
 * Verify script — checks a relay's kind 31888 entries against the schema.
 *
 * Read-only: it signs nothing, publishes nothing and needs no key. Use it to
 * see what the app will actually show (entries that don't match the schema are
 * rejected, not repaired) and why anything is being dropped.
 *
 *   npm run verify
 *   npm run verify -- --relay=ws://relay.example.com
 */
import { SimplePool } from 'nostr-tools/pool'
import {
  CURATED_CANONICAL_KIND,
  DEFAULT_CURATED_SCHEMA,
  CURATED_SCHEMA_KIND,
  curatedSchemaAddress,
  curatedSchemaDisplayName,
  verifyCuratedCanonical,
  verifyCuratedSuggestion,
} from '../lib/nostr/curatedSchemaEvent.ts'
import { RELAYS as READ_RELAYS, describeRelays, done, loadSchema, requireRelays } from './lib.mjs'

async function main() {
  const pool = new SimplePool()
  console.log(`Reading ${describeRelays()}…\n`)
  await requireRelays(pool, READ_RELAYS)

  // A schema published to the relay wins over the bundled one — that is the
  // whole point of putting it on Nostr. Fall back when there isn't one.
  const { schema, published, curator, others } = await loadSchema(pool, READ_RELAYS)
  console.log(
    published
      ? `Using published schema ${curatedSchemaAddress(schema)}` +
          (curator ? '\n  (the curator named by public/.well-known/curare.to/nostr.json)' : '')
      : curator
        ? `The well-known file names curator ${curator.slice(0, 8)}…, but the relay has no ` +
          `schema by them.\n  Publish it: NOSTR_NSEC=nsec1... npm run seed:schema`
        : `No kind ${CURATED_SCHEMA_KIND} schema on the relay — using the bundled one ` +
          `("${DEFAULT_CURATED_SCHEMA.identifier}"). Publish it with: npm run seed:schema`,
  )
  if (others.length > 0) {
    console.log(
      `  ! ${others.length} other schema(s) share this identifier on the relay, by ` +
        `${others.map((p) => p.slice(0, 8) + '…').join(', ')} — the app ignores them, ` +
        `and so does this`,
    )
  }
  console.log(
    `  ${curatedSchemaDisplayName(schema)} — ${schema.description}\n` +
      `  kind ${schema.kind}, visibility: ${schema.visibility}`,
  )
  if (published && schema.relays.length > 0) {
    const missing = schema.relays.filter((r) => !READ_RELAYS.includes(r))
    console.log(`  relays:     ${schema.relays.join(', ')}`)
    if (missing.length > 0) {
      console.log(
        `  ! the schema names ${missing.join(', ')} but this run is reading ` +
          `${READ_RELAYS.join(', ')} — suggestions may be landing where you aren't looking`,
      )
    }
  }
  console.log()

  // Both halves of the list: what people suggested, and what the curator
  // signed off on. Curated entries answer to the same schema plus two rules.
  const [suggestions, curations] = await Promise.all([
    pool.querySync(READ_RELAYS, { kinds: [schema.kind], limit: 1000 }),
    schema.namespace
      ? pool.querySync(READ_RELAYS, {
          kinds: [CURATED_CANONICAL_KIND],
          authors: [schema.namespace],
          limit: 1000,
        })
      : Promise.resolve([]),
  ])

  let ok = 0
  const rejected = []
  const reasons = new Map()

  const check = (event, verify, label) => {
    const result = verify(event, schema)
    if (result.ok) {
      ok += 1
      return
    }
    const title = event.tags.find((t) => t[0] === 'title')?.[1] ?? '(no title)'
    rejected.push({ title: `${title} [${label}]`, id: event.id, violations: result.violations })
    for (const v of result.violations) {
      const key = `${v.field}: ${v.message}`
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
  }

  for (const event of suggestions) check(event, verifyCuratedSuggestion, 'suggestion')
  for (const event of curations) check(event, verifyCuratedCanonical, 'curated')

  const total = suggestions.length + curations.length
  console.log(
    `${total} entries (${suggestions.length} suggested, ${curations.length} curated): ` +
      `${ok} verify, ${rejected.length} rejected.`,
  )

  if (rejected.length > 0) {
    console.log('\nRejected:')
    for (const r of rejected.slice(0, 20)) {
      console.log(`  ✗ ${r.title}  (${r.id.slice(0, 8)}…)`)
      for (const v of r.violations) console.log(`      ${v.field}: ${v.message}`)
    }
    if (rejected.length > 20) console.log(`  … and ${rejected.length - 20} more.`)

    console.log('\nBy reason:')
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(3)}×  ${reason}`)
    }

    if ([...reasons.keys()].some((r) => r.startsWith('schema:'))) {
      console.log(
        '\nThose entries reply to a different schema than the one this site is\n' +
          'committed to — an older version, or one published by another key.\n' +
          'Re-run `npm run seed` with the key that signed the well-known file;\n' +
          'kind 31888 is addressable, so it replaces them by `d` rather than\n' +
          'creating duplicates.',
      )
    }
  }

  done(pool, rejected.length > 0 ? 1 : 0, READ_RELAYS)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
