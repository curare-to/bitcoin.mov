/**
 * Seed script — publishes the curated batch in data/seed-films.json as
 * kind 31888 events, signed by YOUR key.
 *
 * Events are built and checked with the SAME module the app uses
 * (lib/nostr/schemaEvent.ts, imported directly — Node 22 strips the types), so
 * the seed batch cannot drift away from the published schema. Every film is
 * verified against the schema before anything is signed; a single violation
 * aborts the run.
 *
 * This script deliberately does NOT hardcode any key: it reads your nsec from
 * the NOSTR_NSEC environment variable so the secret never lives in a file or
 * in this repo.
 *
 *   # 1. Verify + see exactly what would be published (no key, no network):
 *   npm run seed:dry
 *
 *   # 2. Publish for real, signing with your own key:
 *   NOSTR_NSEC=nsec1... npm run seed
 *
 * Because kind 31888 is addressable, re-running replaces your own prior
 * versions (same author + d) instead of creating duplicates — safe to re-run.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import {
  DEFAULT_SCHEMA,
  buildSuggestionTemplate,
  verifySuggestion,
} from '../lib/nostr/schemaEvent.ts'

const WRITE_RELAYS = ['ws://localhost:10547']

const here = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

/** Build every film, and report any that don't match the schema. */
function buildAll(films, now, pubkey) {
  const templates = []
  const failures = []

  films.forEach((film, i) => {
    // Stagger timestamps so the list order is preserved (first entry = newest).
    const template = buildSuggestionTemplate(film, DEFAULT_SCHEMA, {
      createdAt: now - i,
    })
    const { ok, violations } = verifySuggestion(template, DEFAULT_SCHEMA, {
      pubkey,
    })
    if (ok) templates.push(template)
    else failures.push({ index: i, title: film.title ?? '(untitled)', violations })
  })

  return { templates, failures }
}

async function main() {
  const raw = await readFile(join(here, '..', 'data', 'seed-films.json'), 'utf8')
  const films = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)

  const nsec = process.env.NOSTR_NSEC
  let sk = null
  let pubkey

  if (!dryRun) {
    if (!nsec) {
      console.error(
        'Missing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... npm run seed\n' +
          'Or preview first with:  npm run seed:dry',
      )
      process.exit(1)
    }
    try {
      const decoded = nip19.decode(nsec.trim())
      if (decoded.type !== 'nsec') throw new Error('not an nsec')
      sk = decoded.data
    } catch {
      console.error('NOSTR_NSEC is not a valid nsec1… key.')
      process.exit(1)
    }
    pubkey = getPublicKey(sk)
  }

  const { templates, failures } = buildAll(films, now, pubkey)

  if (failures.length > 0) {
    console.error(
      `${failures.length}/${films.length} films do not match schema ` +
        `"${DEFAULT_SCHEMA.identifier}":\n`,
    )
    for (const f of failures) {
      console.error(`  ✗ [${f.index}] ${f.title}`)
      for (const v of f.violations) console.error(`      ${v.field}: ${v.message}`)
    }
    console.error('\nFix data/seed-films.json (or the schema) and re-run.')
    process.exit(1)
  }

  console.log(
    `✓ ${templates.length}/${films.length} films match schema ` +
      `"${DEFAULT_SCHEMA.identifier}" (${DEFAULT_SCHEMA.visibility}).`,
  )

  if (dryRun) {
    console.log(`\nDRY RUN — ${templates.length} kind ${DEFAULT_SCHEMA.kind} events:\n`)
    for (const t of templates) console.log(JSON.stringify(t))
    console.log('\nNo key used, nothing published. Re-run without --dry-run to publish.')
    return
  }

  console.log(`\nSigning as ${nip19.npubEncode(pubkey)}`)
  console.log(`Publishing ${templates.length} films to ${WRITE_RELAYS.length} relays…\n`)

  const pool = new SimplePool()
  let ok = 0
  for (const template of templates) {
    const event = finalizeEvent(template, sk)
    const results = await Promise.allSettled(pool.publish([...WRITE_RELAYS], event))
    const accepted = results.filter((r) => r.status === 'fulfilled').length
    const title = template.tags.find((t) => t[0] === 'title')?.[1] ?? '(untitled)'
    if (accepted > 0) ok += 1
    console.log(
      `${accepted > 0 ? '✓' : '✗'} ${title} — ${accepted}/${WRITE_RELAYS.length} relays`,
    )
  }

  console.log(`\nDone: ${ok}/${templates.length} films published.`)
  pool.close([...WRITE_RELAYS])
  // Sockets can keep the event loop alive; exit explicitly.
  setTimeout(() => process.exit(0), 500)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
