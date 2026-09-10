/**
 * Verify script — checks a relay's kind 31888 entries against the schema.
 *
 * Read-only: it signs nothing, publishes nothing and needs no key. Use it to
 * see what the app will actually show (entries that don't match the schema are
 * rejected, not repaired) and why anything is being dropped.
 *
 *   npm run verify
 *   npm run verify -- ws://relay.example.com
 */
import { SimplePool } from 'nostr-tools/pool'
import {
  DEFAULT_SCHEMA,
  SCHEMA_KIND,
  parseSchemaEvent,
  schemaAddress,
  schemaDisplayName,
  verifySuggestion,
} from '../lib/nostr/schemaEvent.ts'

const relays = process.argv.slice(2).filter((a) => a.startsWith('ws'))
const READ_RELAYS = relays.length > 0 ? relays : ['ws://localhost:10547']

async function main() {
  const pool = new SimplePool()
  console.log(`Reading ${READ_RELAYS.join(', ')}…\n`)

  // A schema published to the relay wins over the bundled one — that is the
  // whole point of putting it on Nostr. Fall back when there isn't one.
  const schemaEvents = await pool.querySync(READ_RELAYS, {
    kinds: [SCHEMA_KIND],
    limit: 50,
  })
  const published = schemaEvents
    .map(parseSchemaEvent)
    .filter((s) => s !== null && s.identifier === DEFAULT_SCHEMA.identifier)
    .sort((a, b) => (b.source?.createdAt ?? 0) - (a.source?.createdAt ?? 0))[0]

  const schema = published ?? DEFAULT_SCHEMA
  console.log(
    published
      ? `Using published schema ${schemaAddress(published)}`
      : `No kind ${SCHEMA_KIND} schema on the relay — using the bundled one ` +
          `("${DEFAULT_SCHEMA.identifier}"). Publish it with: npm run schema`,
  )
  console.log(
    `  ${schemaDisplayName(schema)} — ${schema.description}\n` +
      `  kind ${schema.kind}, visibility: ${schema.visibility}\n`,
  )

  const events = await pool.querySync(READ_RELAYS, {
    kinds: [schema.kind],
    limit: 1000,
  })

  let ok = 0
  const rejected = []
  const reasons = new Map()

  for (const event of events) {
    const result = verifySuggestion(event, schema)
    if (result.ok) {
      ok += 1
      continue
    }
    const title = event.tags.find((t) => t[0] === 'title')?.[1] ?? '(no title)'
    rejected.push({ title, id: event.id, violations: result.violations })
    for (const v of result.violations) {
      const key = `${v.field}: ${v.message}`
      reasons.set(key, (reasons.get(key) ?? 0) + 1)
    }
  }

  console.log(`${events.length} entries: ${ok} verify, ${rejected.length} rejected.`)

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
        '\nThose entries predate the schema they should be replying to.\n' +
          'Re-run `npm run seed` — kind 31888 is addressable, so it replaces\n' +
          'them by `d` rather than creating duplicates.',
      )
    }
  }

  pool.close(READ_RELAYS)
  setTimeout(() => process.exit(rejected.length > 0 ? 1 : 0), 300)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
