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
 *   # See the schema and the event it produces (no key, no network):
 *   npm run schema:dry
 *
 *   # Publish it:
 *   NOSTR_NSEC=nsec1... npm run schema
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
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { SimplePool } from 'nostr-tools/pool'
import * as nip19 from 'nostr-tools/nip19'
import {
  DEFAULT_SCHEMA,
  SCHEMA_CAP,
  SCHEMA_KIND,
  VISIBILITIES,
  buildSchemaTemplate,
  fieldTag,
  isValidDomain,
  normalizeDomain,
  schemaDisplayName,
  verifySchemaEvent,
} from '../lib/nostr/schemaEvent.ts'

const WRITE_RELAYS = ['ws://localhost:10547']

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function flag(name) {
  const prefix = `--${name}=`
  return args.filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length))
}

/** Apply --visibility / --author overrides to the bundled schema. */
function resolveSchema() {
  const schema = { ...DEFAULT_SCHEMA, authors: [...DEFAULT_SCHEMA.authors] }

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
    if (name.trim().length === 0 || name.length > SCHEMA_CAP.name) {
      console.error(`--name must be 1-${SCHEMA_CAP.name} characters.`)
      process.exit(1)
    }
    schema.name = name.trim()
  }

  const [description] = flag('description')
  if (description) {
    if (description.length > SCHEMA_CAP.description) {
      console.error(`--description must be at most ${SCHEMA_CAP.description} characters.`)
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
  console.log(`Schema "${schema.identifier}" — ${schema.title}`)
  console.log(`  shown as:   ${schemaDisplayName(schema)}`)
  console.log(
    `  name:       ${schema.name}` +
      (schema.domain ? '  (overridden by the domain above)' : ''),
  )
  if (schema.domain) {
    console.log(`  domain:     ${schema.domain}  — unverified claim; see verifyDomain()`)
  }
  if (schema.profileImageUrl) console.log(`  picture:    ${schema.profileImageUrl}`)
  console.log(`  about:      ${schema.description}`)
  console.log(`  governs kind ${schema.kind}, visibility: ${schema.visibility}`)
  if (schema.authors.length > 0) {
    console.log(`  extra authors allowed: ${schema.authors.length}`)
  }
  console.log()
  console.log(
    `  ${'FIELD'.padEnd(18)}${'TAG'.padEnd(10)}${'TYPE'.padEnd(10)}${'REQUIRED'.padEnd(14)}PLACEHOLDER`,
  )
  for (const f of schema.fields) {
    const required = f.required ? 'yes' : 'no'
    const tag = fieldTag(f) + (f.config.marker ? `:${f.config.marker}` : '')
    const note = f.config.derived ? ' (derived)' : ''
    console.log(
      `  ${f.name.padEnd(18)}${tag.padEnd(10)}${f.type.padEnd(10)}${(required + note).padEnd(14)}${f.placeholder}`,
    )
  }
  for (const group of schema.requireAny) {
    console.log(`\n  at least one of: ${group.join(', ')}`)
  }
}

async function main() {
  const schema = resolveSchema()
  const template = buildSchemaTemplate(schema)

  printSchema(schema)

  if (dryRun) {
    console.log(`\nDRY RUN — kind ${SCHEMA_KIND} event:\n`)
    console.log(JSON.stringify(template, null, 2))
    console.log('\nNo key used, nothing published. Re-run without --dry-run to publish.')
    return
  }

  const nsec = process.env.NOSTR_NSEC
  if (!nsec) {
    console.error(
      '\nMissing NOSTR_NSEC. Run:\n  NOSTR_NSEC=nsec1... npm run schema\n' +
        'Or preview first with:  npm run schema:dry',
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
  const event = finalizeEvent(template, sk)

  // Round-trip check: what a client reads back must be what we meant to say.
  const readBack = verifySchemaEvent(event)
  if (!readBack.ok) {
    console.error('\nThe schema event is not valid. Aborting:\n')
    for (const v of readBack.violations) console.error(`  ${v.field}: ${v.message}`)
    process.exit(1)
  }

  console.log(`\nSigning as ${nip19.npubEncode(pubkey)}`)
  console.log(`Publishing schema to ${WRITE_RELAYS.length} relays…\n`)

  const pool = new SimplePool()
  const results = await Promise.allSettled(pool.publish([...WRITE_RELAYS], event))
  const accepted = results.filter((r) => r.status === 'fulfilled').length
  console.log(
    `${accepted > 0 ? '✓' : '✗'} ${schema.identifier} — ${accepted}/${WRITE_RELAYS.length} relays`,
  )

  if (accepted > 0) {
    console.log(
      `\nCoordinate: ${SCHEMA_KIND}:${pubkey}:${schema.identifier}\n\n` +
        'Next:\n' +
        '  1. Set SCHEMA_NAMESPACE in lib/nostr/schemaEvent.ts to:\n' +
        `       '${pubkey}'\n` +
        '  2. Re-run `npm run seed`.\n\n' +
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
