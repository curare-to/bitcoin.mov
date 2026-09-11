/**
 * Seed step 3 — sign off on some of the seeded suggestions as kind 31890
 * *curated entries*, in reply to the schema, using YOUR key.
 *
 * Only the pubkey that published the schema may curate, so this is the one seed
 * step that needs your nsec. It curates a subset by default: a list where
 * everything is curated shows none of the interesting states, and the point of
 * seeding is to see the app as it actually behaves.
 *
 *   npm run seed:curated -- --dry-run     # no key needed, nothing signed
 *   NOSTR_NSEC=nsec1... npm run seed:curated
 *   NOSTR_NSEC=nsec1... npm run seed:curated -- --count=20
 *   NOSTR_NSEC=nsec1... npm run seed:curated -- --all
 *
 * Curated entries keep the suggestion's `d`, so re-running revises them rather
 * than piling up duplicates.
 */
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import {
  CURATION_KIND,
  buildCurationTemplate,
  eventToValues,
  schemaAddress,
  suggestionRef,
  verifyCuration,
} from '../lib/nostr/schemaEvent.ts'
import { planCuration } from './curate.mjs'
import {
  RELAYS,
  done,
  has,
  intFlag,
  loadSchema,
  nip19,
  publish,
  readSecretKey,
  short,
} from './lib.mjs'

async function main() {
  const dryRun = has('dry-run')
  const all = has('all')
  const count = intFlag('count', 12)

  const pool = new SimplePool()
  const { schema, published } = await loadSchema(pool)
  const address = schemaAddress(schema)

  if (!published || !address) {
    // In a dry run nothing has been published yet by definition, so having
    // nothing to preview is the expected state, not a failure.
    const message =
      'No kind 31889 schema on the relay, so there is no curator and nothing to\n' +
      'curate under. Run the seed steps in order:\n\n' +
      '  NOSTR_NSEC=nsec1... npm run seed:schema\n' +
      '  npm run seed:suggestions\n' +
      '  NOSTR_NSEC=nsec1... npm run seed:curated\n'
    if (dryRun) console.log(`${message}\nNothing to preview yet.`)
    else console.error(message)
    done(pool, dryRun ? 0 : 1)
    return
  }

  console.log(`Curating for ${address}`)
  console.log(`  curator: ${short(schema.namespace)}\n`)

  const [suggestions, curations] = await Promise.all([
    pool.querySync(RELAYS, { kinds: [schema.kind], '#a': [address], limit: 1000 }),
    pool.querySync(RELAYS, {
      kinds: [CURATION_KIND],
      authors: [schema.namespace],
      limit: 1000,
    }),
  ])

  const rows = planCuration(suggestions, curations, schema)
  const eligible = rows.filter((r) => r.valid.ok)
  const invalid = rows.length - eligible.length

  if (eligible.length === 0) {
    const message = 'No valid suggestions to curate. Run `npm run seed:suggestions` first.'
    if (dryRun) console.log(message)
    else console.error(message)
    done(pool, dryRun ? 0 : 1)
    return
  }

  // Stable pick: sorted by `d`, so re-running curates the same entries and
  // revises them rather than curating a different arbitrary subset each time.
  const ordered = [...eligible].sort((a, b) => a.d.localeCompare(b.d))
  const picked = all ? ordered : ordered.slice(0, count)

  console.log(
    `${rows.length} suggestions (${invalid} invalid, ` +
      `${rows.filter((r) => r.done).length} already curated).\n` +
      `Curating ${picked.length}${all ? ' (all)' : ` of ${eligible.length}`}.`,
  )

  const templates = picked.map((row) => ({
    row,
    template: buildCurationTemplate(
      eventToValues(row.event, schema),
      schema,
      suggestionRef(row.event, schema),
      { identifier: row.d },
    ),
  }))

  if (dryRun) {
    console.log(`\nDRY RUN — ${templates.length} kind ${CURATION_KIND} events:\n`)
    for (const { template } of templates) console.log(JSON.stringify(template))
    console.log('\nNo key used, nothing published.')
    done(pool)
    return
  }

  const sk = readSecretKey('npm run seed:curated')
  const pubkey = getPublicKey(sk)
  if (pubkey !== schema.namespace) {
    console.error(
      `\nThat key is ${short(pubkey)}, but this schema was published by ` +
        `${short(schema.namespace)}.\nOnly the pubkey that published the schema may curate.`,
    )
    done(pool, 1)
    return
  }

  console.log(`\nSigning as ${nip19.npubEncode(pubkey)}`)
  console.log(`Publishing to ${RELAYS.length} relays…\n`)

  let ok = 0
  for (const { row, template } of templates) {
    const check = verifyCuration({ ...template, pubkey }, schema)
    if (!check.ok) {
      console.log(`✗ ${row.title} — ${check.violations.map((v) => v.message).join('; ')}`)
      continue
    }
    const event = finalizeEvent(template, sk)
    const accepted = await publish(pool, event)
    if (accepted > 0) ok += 1
    console.log(
      `${accepted > 0 ? '✓' : '✗'} ${row.title} — ${accepted}/${RELAYS.length} relays ` +
        `(from ${short(row.event.pubkey)})`,
    )
  }

  console.log(`\nDone: ${ok}/${templates.length} curated.`)
  done(pool, ok === templates.length ? 0 : 1)
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
