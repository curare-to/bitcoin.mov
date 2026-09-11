/**
 * Seed step 2 — publish the curated batch as kind 31888 *suggestions*, in reply
 * to the schema event, each signed by a different throwaway key.
 *
 * This is the crowd: the point of the list is that anyone can suggest a title,
 * so seeding everything with one key would misrepresent how it behaves. The
 * films in data/seed-films.json are spread across a cast of generated authors,
 * a few of them suggested twice by different people so the duplicate-collapsing
 * and "+N more suggestions" paths have something to chew on.
 *
 * The keys are derived from a salt rather than random, so re-running replaces
 * the same events instead of leaving another 37 behind — see seededAuthors.
 * They are throwaway dev identities: the secrets are never written anywhere,
 * which also means nobody can edit these suggestions afterwards.
 *
 *   npm run seed:suggestions -- --dry-run     # no network, nothing signed
 *   npm run seed:suggestions
 *   npm run seed:suggestions -- --authors=20 --duplicates=8 --salt=take-two
 *
 * Needs no NOSTR_NSEC of yours — it signs as other people.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import {
  buildCuratedSuggestionTemplate,
  curatedSchemaAddress,
  verifyCuratedSuggestion,
} from '../lib/nostr/curatedSchemaEvent.ts'
import {
  RELAYS,
  describeRelays,
  done,
  flag,
  has,
  intFlag,
  loadSchema,
  publish,
  seededAuthors,
  short,
} from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Assign films to authors, plus a few second opinions.
 *
 * Round-robin rather than random so the spread is even and stable; the
 * duplicates are offset by a stride that is coprime-ish with the cast size, so
 * they land on a different author than the original.
 */
export function planSuggestions(films, authors, duplicates) {
  const plan = films.map((film, i) => ({
    film,
    author: authors[i % authors.length],
    createdAt: null,
  }))

  for (let i = 0; i < duplicates && i < films.length; i += 1) {
    const filmIndex = (i * 7) % films.length
    const author = authors[(filmIndex + 1 + i) % authors.length]
    // Skip if it would just be the same person suggesting it twice.
    if (author.pubkey === plan[filmIndex].author.pubkey) continue
    plan.push({ film: films[filmIndex], author, createdAt: null })
  }

  // Stagger timestamps so list order is stable and the newest is first.
  const now = Math.floor(Date.now() / 1000)
  plan.forEach((row, i) => {
    row.createdAt = now - i
  })
  return plan
}

async function main() {
  const dryRun = has('dry-run')
  const salt = flag('salt') ?? 'bitcoin.mov seed'
  const authorCount = Math.max(1, intFlag('authors', 12))
  const duplicates = intFlag('duplicates', 5)

  const raw = await readFile(join(here, '..', 'data', 'seed-films.json'), 'utf8')
  const films = JSON.parse(raw)

  const pool = new SimplePool()
  const { schema, published } = await loadSchema(pool)

  if (!published) {
    const message =
      `No kind 31889 schema on the relay. Publish it first:\n\n` +
      `  NOSTR_NSEC=nsec1... npm run seed:schema\n`
    if (!dryRun) {
      console.error(message)
      done(pool, 1)
      return
    }
    console.log(
      `${message}\nPreviewing against the bundled schema instead — suggestions ` +
        `carry no reply\ntags until there is a schema to reply to.\n`,
    )
  } else {
    console.log(`Replying to ${curatedSchemaAddress(schema)}`)
    console.log(`  curator: ${short(schema.namespace)}\n`)
  }

  const authors = seededAuthors(salt, authorCount)
  const plan = planSuggestions(films, authors, duplicates)

  // Build and check everything before signing anything.
  const built = []
  const failures = []
  for (const row of plan) {
    const template = buildCuratedSuggestionTemplate(row.film, schema, {
      createdAt: row.createdAt,
    })
    const result = verifyCuratedSuggestion(template, schema, { pubkey: row.author.pubkey })
    if (result.ok) built.push({ ...row, template })
    else failures.push({ title: row.film.title ?? '(untitled)', result })
  }

  if (failures.length > 0) {
    console.error(`${failures.length} suggestions do not match the schema:\n`)
    for (const f of failures) {
      console.error(`  ✗ ${f.title}`)
      for (const v of f.result.violations) console.error(`      ${v.field}: ${v.message}`)
    }
    done(pool, 1)
    return
  }

  console.log(
    `✓ ${built.length} suggestions from ${authors.length} authors ` +
      `(${films.length} films + ${built.length - films.length} second opinions).`,
  )

  if (dryRun) {
    console.log(`\nDRY RUN — ${built.length} kind ${schema.kind} events:\n`)
    for (const row of built) {
      console.log(`${short(row.author.pubkey)}  ${JSON.stringify(row.template)}`)
    }
    console.log('\nNothing signed, nothing published.')
    done(pool)
    return
  }

  console.log(`\nPublishing to ${describeRelays()}…\n`)
  let ok = 0
  for (const row of built) {
    const event = finalizeEvent(row.template, row.author.sk)
    const accepted = await publish(pool, event)
    if (accepted > 0) ok += 1
    console.log(
      `${accepted > 0 ? '✓' : '✗'} ${short(row.author.pubkey)} ` +
        `${row.film.title} — ${accepted}/${RELAYS.length} relays`,
    )
  }

  console.log(`\nDone: ${ok}/${built.length} suggestions published.`)
  console.log('Next:  NOSTR_NSEC=nsec1... npm run seed:curated')
  done(pool, ok === built.length ? 0 : 1)
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
