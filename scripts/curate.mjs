/**
 * Curate script — the schema author's side of the list.
 *
 * Anyone may publish a kind 31888 *suggestion* in reply to the schema. Only the
 * pubkey that published the schema may turn one into a kind 31890 *curated
 * entry*: same fields, same schema rules, signed by the curator and pointing
 * back at the suggestion it came from.
 *
 *   # See what's been suggested and what's already curated (no key, read-only):
 *   npm run curate
 *
 *   # Preview the event that curating one would publish:
 *   npm run curate -- --id=<suggestion event id> --dry-run
 *
 *   # Curate one, or everything still pending:
 *   NOSTR_NSEC=nsec1... npm run curate -- --id=<suggestion event id>
 *   NOSTR_NSEC=nsec1... npm run curate -- --all
 *
 * Curating is editorial, not mechanical — `--all` is there for bootstrapping,
 * not as the normal path. Curated entries are addressable and keep the
 * suggestion's `d`, so re-curating revises an entry rather than duplicating it.
 */
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import {
  CURATION_KIND,
  DEFAULT_SCHEMA,
  SCHEMA_KIND,
  buildCurationTemplate,
  eventToValues,
  parseSchemaEvent,
  schemaAddress,
  schemaDisplayName,
  suggestionRef,
  verifyCuration,
  verifySuggestion,
} from '../lib/nostr/schemaEvent.ts'

const RELAYS = ['ws://localhost:10547']

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')
const ids = args
  .filter((a) => a.startsWith('--id='))
  .map((a) => a.slice('--id='.length))

function tag(event, name) {
  return event.tags.find((t) => t[0] === name && typeof t[1] === 'string')?.[1] ?? ''
}

function short(pubkey) {
  return pubkey ? `${pubkey.slice(0, 8)}…` : '?'
}

/** The published schema if the relay has one, else the bundled default. */
async function loadSchema(pool) {
  const events = await pool.querySync(RELAYS, { kinds: [SCHEMA_KIND], limit: 50 })
  const published = events
    .map(parseSchemaEvent)
    .filter((s) => s !== null && s.identifier === DEFAULT_SCHEMA.identifier)
    .sort((a, b) => (b.source?.createdAt ?? 0) - (a.source?.createdAt ?? 0))[0]
  return published ?? DEFAULT_SCHEMA
}

/**
 * Work out what's pending. Pure, so it can be tested without a relay.
 *
 * A suggestion counts as curated when a curation shares its `d`: that's the
 * coordinate both land on, so it's what "already handled" means — including
 * when the curator wrote the entry themselves and there is no source to match.
 */
export function planCuration(suggestions, curations, schema) {
  const curated = new Set(curations.map((c) => tag(c, 'd')).filter(Boolean))

  // Relays hand back superseded versions of addressable events, so keep only
  // the newest per author + `d`.
  const latest = new Map()
  for (const event of [...suggestions].sort((a, b) => b.created_at - a.created_at)) {
    const key = `${event.pubkey}:${tag(event, 'd')}`
    if (!latest.has(key)) latest.set(key, event)
  }

  return [...latest.values()].map((event) => ({
    event,
    d: tag(event, 'd'),
    title: tag(event, 'title') || '(untitled)',
    valid: verifySuggestion(event, schema),
    done: curated.has(tag(event, 'd')),
  }))
}

async function main() {
  const pool = new SimplePool()
  const schema = await loadSchema(pool)
  const address = schemaAddress(schema)

  if (!address) {
    console.error(
      'This schema has not been published, so there is no curator and nothing\n' +
        'to curate under. Publish it first:\n\n' +
        '  NOSTR_NSEC=nsec1... npm run schema\n\n' +
        'then set SCHEMA_NAMESPACE in lib/nostr/schemaEvent.ts to the pubkey it prints.',
    )
    process.exit(1)
  }

  console.log(`Curating for ${schemaDisplayName(schema)}  (${address})`)
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

  for (const row of rows) {
    const mark = row.done ? '✓ curated' : row.valid.ok ? '· pending' : '✗ invalid'
    console.log(
      `  ${mark}  ${row.title.slice(0, 44).padEnd(46)}${short(row.event.pubkey)}  ${row.event.id.slice(0, 12)}…`,
    )
    if (!row.valid.ok) {
      for (const v of row.valid.violations) console.log(`               ${v.field}: ${v.message}`)
    }
  }

  const pending = rows.filter((r) => !r.done && r.valid.ok)
  console.log(
    `\n${rows.filter((r) => r.done).length} curated, ${pending.length} pending` +
      `, ${rows.filter((r) => !r.valid.ok).length} invalid.`,
  )

  let picked
  if (all) {
    picked = pending
  } else if (ids.length > 0) {
    picked = []
    for (const id of ids) {
      const row = rows.find((r) => r.event.id === id || r.event.id.startsWith(id))
      if (!row) {
        console.error(`\nNo suggestion matching "${id}".`)
        process.exit(1)
      }
      if (!row.valid.ok) {
        console.error(`\n"${row.title}" does not satisfy the schema — not curating it.`)
        process.exit(1)
      }
      picked.push(row)
    }
  } else {
    console.log(
      '\nCurate one with:  npm run curate -- --id=<event id>\n' +
        'or everything pending with:  npm run curate -- --all',
    )
    pool.close(RELAYS)
    setTimeout(() => process.exit(0), 300)
    return
  }

  if (picked.length === 0) {
    console.log('\nNothing to curate.')
    pool.close(RELAYS)
    setTimeout(() => process.exit(0), 300)
    return
  }

  // Build first, so a dry run shows exactly what signing would publish.
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
    pool.close(RELAYS)
    setTimeout(() => process.exit(0), 300)
    return
  }

  const nsec = process.env.NOSTR_NSEC
  if (!nsec) {
    console.error(
      '\nMissing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... npm run curate -- --all\n' +
        'Or preview first with:  npm run curate -- --all --dry-run',
    )
    process.exit(1)
  }

  let sk
  try {
    const decoded = nip19.decode(nsec.trim())
    if (decoded.type !== 'nsec') throw new Error('not an nsec')
    sk = decoded.data
  } catch {
    console.error('NOSTR_NSEC is not a valid nsec1… key.')
    process.exit(1)
  }

  const pubkey = getPublicKey(sk)
  if (pubkey !== schema.namespace) {
    console.error(
      `\nThat key is ${short(pubkey)}, but this schema was published by ` +
        `${short(schema.namespace)}.\nOnly the pubkey that published the schema may curate.`,
    )
    process.exit(1)
  }

  console.log(`\nSigning as ${nip19.npubEncode(pubkey)}`)
  console.log(`Publishing ${templates.length} curated entries…\n`)

  let ok = 0
  for (const { row, template } of templates) {
    const check = verifyCuration({ ...template, pubkey }, schema)
    if (!check.ok) {
      console.log(`✗ ${row.title} — ${check.violations.map((v) => v.message).join('; ')}`)
      continue
    }
    const event = finalizeEvent(template, sk)
    const results = await Promise.allSettled(pool.publish([...RELAYS], event))
    const accepted = results.filter((r) => r.status === 'fulfilled').length
    if (accepted > 0) ok += 1
    console.log(
      `${accepted > 0 ? '✓' : '✗'} ${row.title} — ${accepted}/${RELAYS.length} relays`,
    )
  }

  console.log(`\nDone: ${ok}/${templates.length} curated.`)
  pool.close(RELAYS)
  setTimeout(() => process.exit(0), 500)
}

// Only run when invoked as a script, so planCuration stays importable.
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
