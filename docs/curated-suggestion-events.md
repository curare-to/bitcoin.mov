# Curated suggestion events (kind 31888)

A curated suggestion event is a title someone proposes for the list. It is what a user signs
when they fill in the submit form, and **anyone can publish one** — that is the
point of the list.

A suggestion is published as a **reply to the schema event** that describes it.
The list is the thread of replies to its own schema.

- **Addressable**, so an author can edit their own entry by republishing with
  the same `d`. Relays keep only the latest.
- **Rooted at the schema**, via an `a` tag carrying its coordinate.
- **Verified, not repaired.** An event that doesn't satisfy the schema is
  dropped, not shown with the bad parts blanked out.

## A real one

*The Rise and Rise of Bitcoin*, as `npm run seed:suggestions` publishes it,
signed by generated author `eebb74ab…`:

```json
{
  "kind": 31888,
  "content": "Follows programmer Daniel Mross and the early Bitcoin community from 2011 onward — the miners, entrepreneurs and evangelists of Bitcoin's formative years.",
  "tags": [
    ["d", "imdb:tt2821314"],
    ["title", "The Rise and Rise of Bitcoin"],
    ["year", "2014"],
    ["type", "documentary"],
    ["director", "Nicholas Mross"],
    ["r", "http://bitcoindoc.com/", "watch"],
    ["r", "https://www.imdb.com/title/tt2821314/", "imdb"],
    ["image", "https://upload.wikimedia.org/wikipedia/en/9/96/The_Rise_and_Rise_of_Bitcoin_%282014%29_Film_Poster.jpg"],
    ["i", "imdb:tt2821314"],
    ["lang", "en"],
    ["t", "bitcoin"],
    ["t", "documentary"],

    ["a", "31889:7c965d8c…:bitcoin.mov", "", "root"],
    ["p", "7c965d8c…"],
    ["k", "31889"]
  ]
}
```

The first block is the film. The last three make it a reply.

## The minimum

Most of those tags are optional. This is a complete, valid suggestion —
*Bitcoin: The End of Money as We Know It*, with nothing but what the schema
insists on:

```json
["d", "bitcoin-the-end-of-money-as-we-know-it"]
["title", "Bitcoin: The End of Money as We Know It"]
["type", "documentary"]
["r", "https://www.imdb.com/title/tt4654844/", "imdb"]
["t", "bitcoin"]
["t", "documentary"]
["a", "31889:7c965d8c…:bitcoin.mov", "", "root"]
["p", "7c965d8c…"]
["k", "31889"]
```

Note there is no `watch` link — only an IMDb one. That satisfies
`require-any: watchUrl, imdbUrl`. Note also that `d`, the `t` hashtags and the
reply tags were all filled in by the app; the person only typed a title, a type
and a URL.

## What's required

| | |
|---|---|
| `d` | always. Addressable events need one, and it's what makes an entry editable |
| `title` | always |
| `type` | one of the schema's enum options |
| one `r` link | `watchUrl` or `imdbUrl` — the `require-any` rule |
| `a` root | once the schema is published (see below) |

Everything else the schema defines is optional, and tags the schema doesn't
define are permitted and ignored — other clients legitimately add their own.

## Derived tags

Two fields are marked `derived` in the schema: the app fills them in rather
than prompting.

**`d`** — the external id when there is one, so the same film stays one editable
entry; otherwise a `title-year` slug.

```
externalId "imdb:tt2821314"  →  d "imdb:tt2821314"
no external id               →  d "magic-money-the-bitcoin-revolution-2018"
```

**`t`** — `bitcoin`, plus the entry's type. A legacy discovery hashtag, kept
because entries published before schemas existed are still found by it. It is
**not** the namespace and is not required.

## The reply

```json
["a", "31889:<curator>:bitcoin.mov", "", "root"]
["p", "<curator>"]
["k", "31889"]
```

The root is the schema's **`a` coordinate, not an `e` event id**. Kind 31889 is
addressable, so revising the schema mints a new event id but keeps the
coordinate — pinning an id would orphan every suggestion the moment the schema
was edited.

`p` notifies the curator and `k` names the kind being replied to, per the usual
reply conventions. Neither is load-bearing: `a` is what's verified and what
relays are queried on.

> **The `a` root is required only once the schema has a coordinate to reply to.**
> While `CURATED_SCHEMA_NAMESPACE` is empty the schema is unpublished, there is nothing
> to point at, and suggestions carry no reply tags. Setting it makes the reply
> mandatory — so suggestions published beforehand stop verifying until they are
> re-seeded. `npm run verify` says so explicitly when that's what's happening.

## Verification

`verifyCuratedSuggestion(event, schema, { pubkey })` returns `{ ok, violations[] }`.

| check | example violation |
|---|---|
| kind matches the schema's | `Expected kind 31888, got 1.` |
| required fields present | `Title is required.` |
| non-repeatable fields appear once | `Title may only appear once.` |
| each value matches its type and constraints | `Year must be at least 1900.` |
| `require-any` groups satisfied | `Provide at least one of: Watch / reference URL, IMDb URL.` |
| the reply root is present and correct | `A suggestion must reply to its schema (31889:…).` |
| the author may suggest at all | `This list is closed — that key may not submit to it.` |

Pass `pubkey` when checking an unsigned template, so a non-public schema can
still tell who is about to sign it.

Some things that get rejected, and why they matter:

- an unknown `type` — keeps the filter bar honest
- a `year` outside 1900–2100 — usually a typo or a scraped page number
- a non-https `image` — browsers block it as mixed content anyway
- a `javascript:` URL — these end up in `href`
- a title over 200 characters — a description pasted into the wrong box, or spam

`parseEntry()` runs this on the way in from a relay and returns `null` on
failure, so the app never renders an entry that didn't pass.

### One guard that isn't the schema's job

The schema checks the `r` tags it names — the ones marked `watch` and `imdb`.
An entry may carry `r` tags with other markers, which no field covers, and those
URLs still reach `href`. So `parseEntry` filters every link through `isSafeUrl`
regardless of what the schema said. Verification is not a substitute for
escaping at the boundary.

## Duplicates

Two people suggesting the same film publish two events. Both are real, both stay
on the relay, and both are the author's own to edit. The app collapses them into
one card, keyed by external id where present, else normalized title + year:

```
imdb:tt2821314 suggested by eebb74ab…  ┐
imdb:tt2821314 suggested by 839c6398…  ┴─→ one film card, "+1 more suggestion"
```

The representative is the curated entry if there is one, otherwise the newest.
`npm run seed:suggestions --duplicates=8` seeds extra second opinions so this
path has something to show.

## Seeing them

The home page lists only what the curator has signed off on. Suggestions live at
`/suggestions`: the raw feed, one row per event, newest first, with whoever
signed it and a marker when the curator has taken the title up.

So publishing a suggestion doesn't put it on the front page — it puts it in the
queue. It stays readable on the relays regardless, and its detail page works
like any other entry. Use the feed to check whether a title has already been
suggested before adding it; the submit form links to it.

## Publishing one

In the app: the submit form, signed by a NIP-07 extension. The app never sees a
private key.

From the seed script, signed by generated throwaway keys:

```bash
npm run seed:suggestions -- --dry-run
npm run seed:suggestions -- --authors=20 --duplicates=8
```

Those keys are derived from a salt, not random, so re-running replaces the same
events instead of leaving another batch behind. Their secrets are never written
anywhere — which does mean nobody can edit seeded suggestions afterwards.
