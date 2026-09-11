/**
 * Seed step 3 — sign off on some of the seeded suggestions as kind 31890
 * *curated entries*, in reply to the schema, using YOUR key.
 *
 * Only the pubkey that published the schema may curate, so this is the one seed
 * step that needs your nsec. It curates every suggested film, so a freshly
 * seeded relay gives you a full home page — that page lists curated entries
 * only, and an empty one shows nothing of how the app behaves.
 *
 *   npm run seed:curated -- --dry-run     # no key needed, nothing signed
 *   NOSTR_NSEC=nsec1... npm run seed:curated
 *   NOSTR_NSEC=nsec1... npm run seed:curated -- --count=12   # leave some pending
 *
 * One curated entry per *film*, not per suggestion: several people may have
 * suggested the same title, and they share a `d`, so curating each in turn
 * would just overwrite the same coordinate. The newest suggestion of each film
 * is the one signed off on.
 *
 * Curated entries keep the suggestion's `d`, so re-running revises them rather
 * than piling up duplicates.
 */
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import {
  CURATED_CANONICAL_KIND,
  buildCuratedCanonicalTemplate,
  eventToValues,
  curatedSchemaAddress,
  curatedSuggestionRef,
  verifyCuratedCanonical,
} from '../lib/nostr/curatedSchemaEvent.ts'
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
  // Everything, unless asked for less. `--count=N` is there for demoing the
  // pending state; the default is a fully curated list.
  const limit = intFlag('count', 0)

  const pool = new SimplePool()
  const { schema, published } = await loadSchema(pool)
  const address = curatedSchemaAddress(schema)

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
      kinds: [CURATED_CANONICAL_KIND],
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

  // One entry per film. Suggestions of the same title share a `d`, so curating
  // each in turn would land them all on one coordinate, leaving whichever came
  // last. Sign off on the newest suggestion of each instead.
  const byFilm = new Map()
  for (const row of eligible) {
    const held = byFilm.get(row.d)
    if (!held || row.event.created_at > held.event.created_at) byFilm.set(row.d, row)
  }

  // Sorted by `d`, so a limited run picks the same entries every time and
  // revises them rather than curating a different arbitrary subset.
  const ordered = [...byFilm.values()].sort((a, b) => a.d.localeCompare(b.d))
  const picked = limit > 0 ? ordered.slice(0, limit) : ordered

  console.log(
    `${rows.length} suggestions of ${byFilm.size} films ` +
      `(${invalid} invalid, ${rows.filter((r) => r.done).length} already curated).\n` +
      `Curating ${picked.length}${limit > 0 ? ` of ${byFilm.size}` : ' (all)'}.`,
  )

  const templates = picked.map((row) => ({
    row,
    template: buildCuratedCanonicalTemplate(
      eventToValues(row.event, schema),
      schema,
      curatedSuggestionRef(row.event, schema),
      { identifier: row.d },
    ),
  }))

  if (dryRun) {
    console.log(`\nDRY RUN — ${templates.length} kind ${CURATED_CANONICAL_KIND} events:\n`)
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
    const check = verifyCuratedCanonical({ ...template, pubkey }, schema)
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
