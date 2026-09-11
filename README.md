# bitcoin.mov

A crowd-sourced, censorship-resistant list of Bitcoin movies, documentaries and
videos. There's no server and no database — every entry is a
[Nostr](https://nostr.com) event of **kind 31888**, read from public relays.
Anyone with a Nostr signer can add one — and edit their own entries later.

- **Stack:** Next.js (App Router) + React 19 + TypeScript + Tailwind v4
- **Data:** `nostr-tools` v2 (`SimplePool`), read from public relays
- **Suggestions:** signed in the browser via a NIP-07 extension (Alby, nos2x) —
  the app never touches your private key
- **Hosting:** static export (`output: 'export'`) → deploy the `out/` folder to
  GitHub Pages, Netlify, Vercel, Cloudflare Pages, or IPFS

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build & deploy

```bash
npm run build    # emits a static site to ./out
npm run serve    # preview the static build locally
```

For a GitHub Pages sub-path deploy, uncomment `basePath`/`assetPrefix` in
[`next.config.mjs`](next.config.mjs).

## Three events

| kind | | who signs it |
|---|---|---|
| **31889** | **curated schema** — the fields a suggestion may carry, and the list's identity | the curator |
| **31888** | **curated suggestion** — a title someone proposes, in reply to the schema | anyone |
| **31890** | **curated canonical** — a suggestion the curator signed off on | the curator only |

A pubkey publishes a schema. Anyone replies to it with suggestions that satisfy
it. The pubkey that published the schema goes through them and republishes the
ones it accepts as curated entries — same fields, signed by the curator,
pointing back at the suggestion they came from.

The **home page lists curated entries only**; everything suggested is at
`/suggestions`. Publishing a suggestion puts it in the queue, not on the front
page — but it stays readable on the relays either way.

Suggesting stays open even on a list nobody else can curate: `visibility`
governs who may *suggest*, and has no bearing on curation. Curation is the one
power the schema author doesn't share.

## The events in detail

Full reference in **[docs/](docs/)** — every tag, the verification rules, and
worked examples straight out of the seeded library:

- **[docs/README.md](docs/README.md)** — how the three fit together, a
  walkthrough with real events, and the relay queries that fetch each one
- **[docs/curated-schema-events.md](docs/curated-schema-events.md)** — kind 31889: field
  definitions, types and config, identity, visibility
- **[docs/curated-suggestion-events.md](docs/curated-suggestion-events.md)** — kind 31888: the
  reply root, what's required, derived tags, duplicates
- **[docs/curated-canonical-events.md](docs/curated-canonical-events.md)** — kind 31890: the curator
  gate, the source reference, why it's a copy rather than a pointer

## Commands

```bash
npm run seed:dry     # preview all three seed steps, nothing signed
npm run seed         # NOSTR_NSEC=nsec1… — schema, suggestions, curated entries
npm run schema       # publish just the schema  (= npm run seed:schema)
npm run curate       # what's been suggested, what's still pending
npm run verify       # check every entry on a relay against the schema
```

See [SEEDING.md](SEEDING.md) for the seeding flow in full.

## Notes

- **Editing:** open your own entry and click *Edit this entry* — it reopens the
  form pre-filled and republishes with the same `d`, replacing the old version.
  Relays keep only the latest, and the client merges versions by newest
  `created_at` across relays.
- Relays read/written are configured in
  [`lib/nostr/relays.ts`](lib/nostr/relays.ts).
- **Seeding:** see [SEEDING.md](SEEDING.md). `npm run seed:dry` previews all
  three steps — schema, suggestions, curated entries — without signing
  anything, and every step verifies against the schema before it publishes.
- **Curating:** `npm run curate` lists what's been suggested and what's still
  pending. It refuses to curate a suggestion that doesn't satisfy the schema,
  and refuses to sign with a key that isn't the schema's author.
