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
| **31889** | **schema** — the fields a suggestion may carry, and the list's identity | the curator |
| **31888** | **suggestion** — a title someone proposes, in reply to the schema | anyone |
| **31890** | **curated entry** — a suggestion the curator signed off on | the curator only |

A pubkey publishes a schema. Anyone replies to it with suggestions that satisfy
it. The pubkey that published the schema goes through them and republishes the
ones it accepts as curated entries — same fields, signed by the curator,
pointing back at the suggestion they came from.

Suggesting stays open even on a list nobody else can curate: `visibility`
governs who may *suggest*, and has no bearing on curation. Curation is the one
power the schema author doesn't share.

## The kind 31888 suggestion event (the "spec")

The events users sign to submit a title are **suggestion events**, published as
**replies to the schema event** that describes them. The list is literally the
thread of replies to its own schema, and `#a` on the schema's coordinate is the
query that fetches it.

kind 31888 is a **custom, addressable application kind** this project defines —
it is *not* a standardized NIP. It sits in Nostr's addressable/parameterized-
replaceable range (30000–39999), so the coordinate `(kind, pubkey, d)` is unique
and republishing with the same `d` **replaces** the previous version. That's how
an author edits their entry.

The event's *shape* isn't hardcoded in this client: it's described by a
**kind 31889 schema event** (see below). This client defends against junk two
ways:

1. **Read scope:** entries are found by the schema coordinate they reply to
   (`#a`), and — for entries published before schemas existed — by the legacy
   `#t = bitcoin` hashtag, so unrelated traffic can't crowd real entries out of
   a relay's result window.
2. **Schema verification:** every incoming event is checked against the schema
   and **rejected** if it doesn't match — no `d`, no `title`, an unknown
   `type`, an out-of-range `year`, a non-`https` poster, an over-long field, all
   dropped rather than half-repaired. Run `npm run verify` to see what a relay
   holds and why anything is being rejected. All strings are rendered as text,
   never HTML.

### Shape

```jsonc
{
  "kind": 31888,
  "content": "Freeform review / description. Plain text.",
  "tags": [
    ["d", "imdb:tt2821314"],                      // REQUIRED — replaceable id
    ["title", "The Rise and Rise of Bitcoin"],    // REQUIRED
    ["a", "31889:<pubkey>:bitcoin.mov", "", "root"],  // REQUIRED — the schema replied to
    ["p", "<schema author pubkey>"],              // notifies the curator
    ["k", "31889"],                               // kind being replied to
    ["t", "bitcoin"],                             // optional discovery hashtag
    ["year", "2014"],
    ["type", "documentary"],   // movie | documentary | short | interview | series | other
    ["director", "Nicholas Mross"],
    ["duration", "5760"],      // seconds
    ["r", "https://youtube.com/watch?v=…", "watch"],  // watch link(s)
    ["r", "https://www.imdb.com/title/tt2821314/", "imdb"],
    ["image", "https://…/poster.jpg"],            // poster (https only)
    ["i", "imdb:tt2821314"],                      // external id — used to dedupe
    ["lang", "en"],
    ["t", "documentary"]                          // extra discovery hashtags
  ]
}
```

`d`, `title` and `type` are required, plus at least one `r` link and the `a`
root that makes it a reply; everything else is optional. There is **no required
namespace tag** — the namespace is the schema author's pubkey.

The root is the schema's `a` **coordinate**, not an `e` event id. Kind 31889 is
addressable, so revising the schema mints a new event id but keeps the
coordinate — pinning an id would orphan every suggestion the moment the schema
was edited. `p` and `k` follow the usual reply conventions but aren't
load-bearing; `a` is what's verified and queried.

**The `a` root is required only once the schema has a coordinate to reply to.**
While `SCHEMA_NAMESPACE` is empty the schema is unpublished, there's nothing to
point at, and suggestions carry no reply tags. Setting it turns the reply into a
requirement, so suggestions published beforehand stop verifying — re-run
`npm run seed` (kind 31888 is addressable, so entries are replaced by `d`, not
duplicated) and `npm run verify` will show any that still need it. The `d` identifier defaults to the external id, falling
back to a `title-year` slug. Duplicate suggestions of the same film *by
different authors* are still collapsed in the UI by external id (`i`), falling
back to normalized title + year.

[`lib/nostr/schema.ts`](lib/nostr/schema.ts) reads and builds these events;
what counts as valid lives in the schema event below.

## The kind 31889 schema event

A schema event says which tags an entry may carry, which are required, and what
to show the user while they fill the form in — so the submit form, the seed
script and the relay-side verifier all work from one definition instead of three
copies that drift. Because it lives on a relay, another client can render the
same form without shipping this repo's code.

```bash
npm run schema:dry   # print the schema and the event it produces
npm run schema       # NOSTR_NSEC=nsec1… — publish it
npm run verify       # check a relay's entries against it
```

Its author's pubkey **is** the namespace: `31889:<pubkey>:bitcoin.mov` names
this schema and no other, so nothing global is claimed and nothing can be
squatted. Kind 31889 is addressable too, so republishing revises it in place.

```jsonc
{
  "kind": 31889,
  "content": "Fields for a bitcoin.mov entry…",   // mirrors the description tag
  "tags": [
    ["d", "bitcoin.mov"],       // REQUIRED — schema id
    ["title", "bitcoin.mov suggestion"],  // REQUIRED — labels the event
    ["name", "bitcoin.mov"],    // REQUIRED — the list's identity
    ["description", "Fields for a bitcoin.mov entry…"],  // REQUIRED
    ["visibility", "public"],   // REQUIRED — public | private | closed
    ["picture", "https://…/logo.png"],   // optional — https only
    ["domain", "bitcoin.mov"],  // optional — REPLACES the name on screen
    ["k", "31888"],             // the kind this schema governs

    // ["field", name, type, required|optional, placeholder, label, config]
    ["field", "title", "text", "required", "The Rise and Rise of Bitcoin", "Title", "{\"max\":200}"],
    ["field", "year", "year", "optional", "2014", "Year", "{\"min\":1900,\"max\":2100}"],
    ["field", "watchUrl", "url", "optional", "https://youtube.com/watch?v=…", "Watch / reference URL", "{\"tag\":\"r\",\"marker\":\"watch\"}"],
    // …

    ["require-any", "watchUrl", "imdbUrl"],  // at least one of these
    ["p", "<pubkey>"]           // extra authors, for closed/private lists
  ]
}
```

### Identity

A schema event says who's publishing the list, not just what its fields are:

| tag | | |
|---|---|---|
| `name` | **required** | the list's identity — what people call it |
| `description` | **required** | what the list is for (≤ 500 chars) |
| `visibility` | **required** | never guessed; a schema that doesn't say is rejected |
| `picture` | optional | profile image, https only |
| `domain` | optional | **replaces the name** wherever the list is shown |

`title` and `name` are both required and usually differ: `title` labels the
event ("bitcoin.mov suggestion"), `name` is the publisher ("bitcoin.mov").
`schemaDisplayName()` returns `domain ?? name`.

A `domain` is a **claim, not proof** — anyone can put any domain in a tag. The
override exists because a domain is the one part of the identity that *can* be
checked against the outside world, so confirm it before you trust it:

```ts
await verifyDomain(schema)  // NIP-05 style: https://<domain>/.well-known/nostr.json?name=_
```

That's opt-in and network-bound; nothing calls it for you, and the submit form
presents the name as a label rather than a verified badge. Set one with
`npm run schema -- --domain=example.com` only if you control it.

`verifySchemaEvent(event)` checks all of the above and returns the violations,
so publishing tells you exactly which tag is wrong instead of failing blank.

**Field types:** `text`, `longtext`, `token`, `url`, `image`, `enum`, `year`,
`duration`, `number`. The `config` blob carries everything beyond the four
positional properties: which `tag` the field writes to (defaults to its name),
a tag `marker`, `max`/`min`, `enum` `options`, `https`, `repeat`, `pattern`, a
form `hint`, and `derived` for values the app fills in itself (`d`, `t`).

**Visibility** is enforced by the verifier and by the submit form:

| | who may submit | who may read |
|---|---|---|
| `public` | anyone | anyone |
| `closed` | the schema author + `p` authors | anyone |
| `private` | the schema author + `p` authors | clients only surface it to those authors |

Relays are open, so `private` is a client-side convention, not encryption —
never put secrets in one.

`d` and `title` are **always** required on both a suggestion and a schema
event: `normalizeSchema` puts them back if a schema event off a relay omits or
relaxes them, so no schema can opt out of them. On a schema event, `name`,
`description` and `visibility` are required too.

[`lib/nostr/schemaEvent.ts`](lib/nostr/schemaEvent.ts) is the single source of
truth for all of this — field definitions, the default schema, `buildSchemaTemplate`,
`parseSchemaEvent` and `verifySubmission`. It is deliberately dependency-free so
the Node scripts can import it directly and check against the exact same rules
the browser does.

## The kind 31890 curated entry

A curated entry carries the **same fields as a suggestion** and answers to the
same schema — it *is* an entry, not an annotation. That's deliberate: curating
is editorial, so the curator can fix a year or swap a poster on the way through,
and the curated list stands on its own rather than depending on every suggestion
still being on a relay.

```jsonc
{
  "kind": 31890,
  "tags": [
    ["d", "imdb:tt2821314"],       // same `d` as the suggestion — revises in place
    ["title", "The Rise and Rise of Bitcoin"],
    // …every other field, exactly as a suggestion carries them

    ["a", "31889:<curator>:bitcoin.mov", "", "root"],   // still a reply to the schema
    ["a", "31888:<suggester>:imdb:tt2821314", "", "mention"],  // the suggestion accepted
    ["e", "<suggestion event id>", "", "mention"],      // the exact version seen
    ["p", "<suggester pubkey>"]                         // credit
  ]
}
```

The source reference is **optional** — a curator may add an entry nobody
suggested. When present it's validated. The coordinate follows the suggester's
later edits; the `e` id pins what was actually reviewed.

`verifyCuration` adds two rules to `verifySuggestion`: kind 31890, and signed by
`schema.namespace`. Keeping the same `d` as the suggestion means re-curating
revises an entry instead of duplicating it.

```bash
npm run curate                                   # what's suggested, what's pending
npm run curate -- --id=<event id> --dry-run      # preview the event
NOSTR_NSEC=nsec1... npm run curate -- --id=<id>  # curate one
NOSTR_NSEC=nsec1... npm run curate -- --all      # everything pending
```

In the app, a curated entry outranks the newest suggestion as the representative
of its film group, and is marked *Curated* with credit to the original
suggester. Curation is inert until the schema is published — there's no curator
until a pubkey has signed a schema event.

> The 37 seeded films are currently published as **suggestions**, by the same
> key that would publish the schema. Publishing them as curated entries instead
> would be truer to the model; it's a re-seed, not a code change, and a call
> worth making deliberately.

## Notes

- **Editing:** open your own entry and click *Edit this entry* — it reopens the
  form pre-filled and republishes with the same `d`, replacing the old version.
  Relays keep only the latest, and the client merges versions by newest
  `created_at` across relays.
- Relays read/written are configured in
  [`lib/nostr/relays.ts`](lib/nostr/relays.ts).
- **Seeding:** see [SEEDING.md](SEEDING.md). `npm run seed:dry` verifies the
  whole batch against the schema before anything is signed.
- **Curating:** `npm run curate` lists what's been suggested and what's still
  pending. It refuses to curate a suggestion that doesn't satisfy the schema,
  and refuses to sign with a key that isn't the schema's author.
