/**
 * Seed script — publishes the curated batch in data/seed-films.json as
 * kind 31888 events, signed by YOUR key.
 *
 * The tag layout here mirrors buildTemplate() in lib/nostr/schema.ts — keep
 * them in sync. This script deliberately does NOT hardcode any key: it reads
 * your nsec from the NOSTR_NSEC environment variable so the secret never lives
 * in a file or in this repo.
 *
 *   # 1. See exactly what would be published (no key, no network):
 *   node scripts/seed.mjs --dry-run
 *
 *   # 2. Publish for real, signing with your own key:
 *   NOSTR_NSEC=nsec1... node scripts/seed.mjs
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

const MOVIE_KIND = 31888
const WRITE_RELAYS = ['ws://localhost:10547']

const here = dirname(fileURLToPath(import.meta.url))
const dryRun = process.argv.includes('--dry-run')

function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function coerceYear(value) {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : null
}

function deriveIdentifier(f) {
  const ext = (f.externalId || '').trim().toLowerCase()
  if (ext) return ext
  const y = coerceYear(f.year)
  return slug(y ? `${f.title}-${y}` : f.title) || 'untitled'
}

function buildTemplate(f, createdAt) {
  const identifier = deriveIdentifier(f)
  const tags = [
    ['d', identifier],
    ['title', f.title.trim()],
  ]
  const year = coerceYear(f.year)
  if (year) tags.push(['year', String(year)])
  tags.push(['type', f.type])
  if (f.director?.trim()) tags.push(['director', f.director.trim()])
  if (f.durationSeconds?.trim()) tags.push(['duration', f.durationSeconds.trim()])
  if (f.watchUrl?.trim()) tags.push(['r', f.watchUrl.trim(), 'watch'])
  if (f.imdbUrl?.trim()) tags.push(['r', f.imdbUrl.trim(), 'imdb'])
  if (f.image?.trim()) tags.push(['image', f.image.trim()])
  if (f.externalId?.trim()) tags.push(['i', f.externalId.trim()])
  if (f.lang?.trim()) tags.push(['lang', f.lang.trim()])
  tags.push(['t', 'bitcoin'])
  tags.push(['t', f.type])
  return {
    kind: MOVIE_KIND,
    created_at: createdAt,
    tags,
    content: f.description ?? '',
  }
}

async function main() {
  const raw = await readFile(join(here, '..', 'data', 'seed-films.json'), 'utf8')
  const films = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)

  // Stagger timestamps so the list order is preserved (first entry = newest).
  const templates = films.map((f, i) => buildTemplate(f, now - i))

  if (dryRun) {
    console.log(`DRY RUN — ${templates.length} kind ${MOVIE_KIND} events:\n`)
    for (const t of templates) {
      console.log(JSON.stringify(t))
    }
    console.log('\nNo key used, nothing published. Re-run without --dry-run to publish.')
    return
  }

  const nsec = process.env.NOSTR_NSEC
  if (!nsec) {
    console.error(
      'Missing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... node scripts/seed.mjs\n' +
        'Or preview first with:  node scripts/seed.mjs --dry-run',
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
  console.log(`Signing as ${nip19.npubEncode(pubkey)}`)
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
