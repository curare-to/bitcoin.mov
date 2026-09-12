/**
 * Schema script — publishes the bitcoin.mov suggestion schema as a
 * kind 31889 event, signed by YOUR key.
 *
 * Suggestions (kind 31888) are published as replies to this event, so its
 * coordinate is what scopes the whole list.
 *
 * The schema event is what tells any client — this app or someone else's —
 * which tags a kind 31888 entry may carry, which are required, and what to
 * show while a user fills the form in. Its author's pubkey is the namespace:
 * the coordinate `31889:<pubkey>:bitcoin.mov` identifies this schema and no
 * other. Nothing global is claimed, so nothing can be squatted.
 *
 * Publishing also writes the signed event — just the event — to
 * public/.well-known/curare.to/nostr.json, which the static export copies into
 * the build, so the schema is fetchable over HTTPS from the site itself, not
 * only from a relay. Commit that file: it is what the deployed site serves.
 *
 *   # See the schema and the event it produces (no key, no network):
 *   npm run schema:dry
 *
 *   # Publish it (also runs as step 1 of `npm run seed`):
 *   NOSTR_NSEC=nsec1... npm run schema
 *
 *   # Or keep the key elsewhere: give only the npub and the unsigned event is
 *   # printed to stdout for you to sign and publish yourself.
 *   NOSTR_NPUB=npub1... npm run --silent schema > schema.json
 *
 *   # Restrict who may submit (default is public):
 *   NOSTR_NSEC=nsec1... npm run schema -- --visibility=closed --author=<hex pubkey>
 *
 *   # Give the list an identity. A domain REPLACES the name wherever the list
 *   # is shown, so only claim one you control — see verifyDomain().
 *   npm run schema:dry -- --name="Bitcoin on screen" --domain=bitcoin.mov \
 *     --picture=https://bitcoin.mov/logo.png
 *
 * Kind 31889 is addressable, so re-running replaces your previous version
 * (same author + d) rather than adding a second schema.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { finalizeEvent } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import { RELAYS, describeRelays, emitUnsigned, publish, readSigner, say } from './lib.mjs'
import {
  DEFAULT_CURATED_SCHEMA,
  CURATED_SCHEMA_CAP,
  CURATED_SCHEMA_KIND,
  VISIBILITIES,
  buildCuratedSchemaTemplate,
  fieldTag,
  isValidDomain,
  normalizeDomain,
  curatedSchemaDisplayName,
  verifyCuratedSchemaEvent,
} from '../lib/nostr/curatedSchemaEvent.ts'

// Shared with every other script, so `--relay=ws://…` aims a run somewhere else.
const WRITE_RELAYS = RELAYS

/**
 * Where the signed schema is served over plain HTTPS, as well as pushed to
 * relays: `public/` is copied verbatim into the static export, so this lands at
 * `/.well-known/curare.to/nostr.json` on the deployed site.
 *
 * A relay can be down, rate-limited, or simply not one a reader happens to use.
 * The schema is the one document everything else is checked against, so it is
 * worth being fetchable from the site itself with no Nostr client at all.
 */
const WELL_KNOWN = ['public', '.well-known', 'curare.to', 'nostr.json']

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function flag(name) {
  const prefix = `--${name}=`
  return args.filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length))
}

/** Apply --visibility / --author overrides to the bundled schema. */
function resolveSchema() {
  const schema = {
    ...DEFAULT_CURATED_SCHEMA,
    authors: [...DEFAULT_CURATED_SCHEMA.authors],
    // Sign the relays we're about to publish to into the event itself, so a
    // client that finds the schema anywhere knows where replies go — and can't
    // be pointed elsewhere by an unsigned file.
    relays: [...WRITE_RELAYS],
  }

  const [visibility] = flag('visibility')
  if (visibility) {
    if (!VISIBILITIES.includes(visibility)) {
      console.error(
        `--visibility must be one of: ${VISIBILITIES.join(', ')} (got "${visibility}").`,
      )
      process.exit(1)
    }
    schema.visibility = visibility
  }

  const authors = flag('author')
  for (const author of authors) {
    if (!/^[0-9a-f]{64}$/i.test(author)) {
      console.error(`--author must be a 64-char hex pubkey (got "${author}").`)
      process.exit(1)
    }
    if (!schema.authors.includes(author.toLowerCase())) {
      schema.authors.push(author.toLowerCase())
    }
  }

  // Identity. `name` and `description` are mandatory, so these only ever
  // replace a value that's already there.
  const [name] = flag('name')
  if (name) {
    if (name.trim().length === 0 || name.length > CURATED_SCHEMA_CAP.name) {
      console.error(`--name must be 1-${CURATED_SCHEMA_CAP.name} characters.`)
      process.exit(1)
    }
    schema.name = name.trim()
  }

  const [description] = flag('description')
  if (description) {
    if (description.length > CURATED_SCHEMA_CAP.description) {
      console.error(`--description must be at most ${CURATED_SCHEMA_CAP.description} characters.`)
      process.exit(1)
    }
    schema.description = description.trim()
  }

  const [picture] = flag('picture')
  if (picture) {
    if (!picture.startsWith('https://')) {
      console.error(`--picture must be an https URL (got "${picture}").`)
      process.exit(1)
    }
    schema.profileImageUrl = picture.trim()
  }

  const [domain] = flag('domain')
  if (domain) {
    if (!isValidDomain(domain)) {
      console.error(`--domain must be a domain name (got "${domain}").`)
      process.exit(1)
    }
    schema.domain = normalizeDomain(domain)
  }

  return schema
}

/** Human-readable summary of what the schema asks users for. */
function printSchema(schema) {
  say(`Schema "${schema.identifier}" — ${schema.title}`)
  say(`  shown as:   ${curatedSchemaDisplayName(schema)}`)
  say(
    `  name:       ${schema.name}` +
      (schema.domain ? '  (overridden by the domain above)' : ''),
  )
  if (schema.domain) {
    say(`  domain:     ${schema.domain}  — unverified claim; see verifyDomain()`)
  }
  if (schema.profileImageUrl) say(`  picture:    ${schema.profileImageUrl}`)
  say(`  about:      ${schema.description}`)
  say(`  governs kind ${schema.kind}, visibility: ${schema.visibility}`)
  say(`  relays:     ${schema.relays.join(', ') || '(none — clients will use their own)'}`)
  if (schema.authors.length > 0) {
    say(`  extra authors allowed: ${schema.authors.length}`)
  }
  say()
  say(
    `  ${'FIELD'.padEnd(18)}${'TAG'.padEnd(10)}${'TYPE'.padEnd(10)}${'REQUIRED'.padEnd(14)}PLACEHOLDER`,
  )
  for (const f of schema.fields) {
    const required = f.required ? 'yes' : 'no'
    const tag = fieldTag(f) + (f.config.marker ? `:${f.config.marker}` : '')
    const note = f.config.derived ? ' (derived)' : ''
    say(
      `  ${f.name.padEnd(18)}${tag.padEnd(10)}${f.type.padEnd(10)}${(required + note).padEnd(14)}${f.placeholder}`,
    )
  }
  for (const group of schema.requireAny) {
    say(`\n  at least one of: ${group.join(', ')}`)
  }
}

/**
 * Write the signed schema to the well-known path — the event and nothing else.
 *
 * Everything a reader could want is in the event: the curator is `pubkey`,
 * the coordinate is `31889:<pubkey>:<d>`, the relays are the `relay` tags.
 * An earlier version wrapped it in `{ coordinate, names, relays, schema }`;
 * those fields were unsigned, and unsigned fields beside a signed event are an
 * invitation to trust the wrong thing. Now every byte in the file is under
 * the signature.
 *
 * This is *not* the NIP-05 path — that is `/.well-known/nostr.json` at the
 * domain root, and `verifyDomain()` is what checks it. This file says "here
 * is the schema"; NIP-05 says "here is who I am".
 */
async function writeWellKnown(event) {
  const path = join(repoRoot, ...WELL_KNOWN)
  // Next resolves `public/` once at startup: a dev server that began before the
  // directory existed will 404 everything in it until restarted. The repo keeps
  // a public/.gitkeep so this normally can't happen, but say so if it does.
  const fresh = !existsSync(join(repoRoot, 'public'))

  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(event, null, 2)}\n`)
  return { path, fresh }
}

async function main() {
  const schema = resolveSchema()
  const template = buildCuratedSchemaTemplate(schema)

  printSchema(schema)

  if (dryRun) {
    say(`\nDRY RUN — kind ${CURATED_SCHEMA_KIND} event:\n`)
    console.log(JSON.stringify(template, null, 2))
    say('\nNo key used, nothing published. Re-run without --dry-run to publish.')
    return
  }

  const { pubkey, sk, canSign } = readSigner('npm run schema')

  if (!canSign) {
    // Unsigned mode: the event, with the curator's pubkey set, for signing
    // elsewhere. The well-known file needs the *signed* event, so once it is
    // signed, the signed event itself is what goes there — nothing else.
    say(`\nUnsigned kind ${CURATED_SCHEMA_KIND} event for ${nip19.npubEncode(pubkey)} → stdout`)
    emitUnsigned(template, pubkey)
    say(
      '\nSign it, publish it to the relays it names, and save the signed event as\n' +
        `  ${WELL_KNOWN.join('/')}\n` +
        'Nothing was published.',
    )
    return
  }

  const event = finalizeEvent(template, sk)

  // Round-trip check: what a client reads back must be what we meant to say.
  const readBack = verifyCuratedSchemaEvent(event)
  if (!readBack.ok) {
    console.error('\nThe schema event is not valid. Aborting:\n')
    for (const v of readBack.violations) console.error(`  ${v.field}: ${v.message}`)
    process.exit(1)
  }

  say(`\nSigning as ${nip19.npubEncode(pubkey)}`)

  // Before publishing: whether relays accept it has no bearing on the site
  // being able to serve it.
  const { path: written, fresh } = await writeWellKnown(event)
  say(`Wrote ${relative(repoRoot, written)}`)
  say('  → /.well-known/curare.to/nostr.json once deployed')
  if (fresh) {
    say('  ! public/ did not exist — restart `npm run dev` to serve it')
  }
  say()

  say(`Publishing schema to ${describeRelays()}…\n`)

  const pool = new SimplePool()
  const accepted = await publish(pool, event, WRITE_RELAYS)
  say(
    `${accepted > 0 ? '✓' : '✗'} ${schema.identifier} — ${accepted}/${WRITE_RELAYS.length} relays`,
  )

  if (accepted > 0) {
    say(
      `\nCoordinate: ${CURATED_SCHEMA_KIND}:${pubkey}:${schema.identifier}\n\n` +
        'Next:\n' +
        '  1. Commit public/.well-known/curare.to/nostr.json — the app reads the\n' +
        '     curator, the schema coordinate and the relays from it. Nothing is\n' +
        '     hardcoded; a site without it has no list.\n' +
        '  2. Re-run `npm run seed` if suggestions or canonical entries predate\n' +
        '     this schema, or its relays changed.\n\n' +
        'Suggestions are replies to this schema, so they must carry its `a`\n' +
        'coordinate. Entries published before it existed will not verify until\n' +
        'they are re-seeded — kind 31888 is addressable, so re-seeding replaces\n' +
        'them by `d` rather than duplicating them. `npm run verify` will show\n' +
        'any that still need it.',
    )
  }

  pool.close([...WRITE_RELAYS])
  setTimeout(() => process.exit(accepted > 0 ? 0 : 1), 500)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
