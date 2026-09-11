# Curated canonical events (kind 31890)

A curated canonical event is a suggestion the curator has signed off on — the
canonical version of a title, as far as this list is concerned. It is the
editorial layer: anyone may suggest, but only the pubkey that published the
schema may curate.

It carries the **same fields as a suggestion** and answers to the same schema.
It is an entry, not an annotation — see [why](#why-a-copy-and-not-a-pointer).

- **Addressable**, and it keeps the suggestion's `d`, so re-curating revises an
  entry rather than adding a second one.
- **Rooted at the schema**, exactly like a suggestion.
- **References the suggestion it came from** — optionally, because a curator may
  add an entry nobody suggested.

## A real one

The curator signing off on `eebb74ab…`'s suggestion of *The Rise and Rise of
Bitcoin*:

```json
{
  "kind": 31890,
  "content": "Follows programmer Daniel Mross and the early Bitcoin community from 2011 onward — the miners, entrepreneurs and evangelists of Bitcoin's formative years.",
  "tags": [
    ["d", "imdb:tt2821314"],
    ["title", "The Rise and Rise of Bitcoin"],
    ["year", "2014"],
    ["type", "documentary"],
    ["director", "Nicholas Mross"],
    ["r", "http://bitcoindoc.com/", "watch"],
    ["r", "https://www.imdb.com/title/tt2821314/", "imdb"],
    ["image", "https://upload.wikimedia.org/…/The_Rise_and_Rise_of_Bitcoin_Poster.jpg"],
    ["i", "imdb:tt2821314"],
    ["lang", "en"],
    ["t", "bitcoin"],
    ["t", "documentary"],

    ["a", "31889:7c965d8c…:bitcoin.mov", "", "root"],
    ["p", "7c965d8c…"],
    ["k", "31889"],

    ["a", "31888:eebb74ab…:imdb:tt2821314", "", "mention"],
    ["e", "a809ddc2ad9c7b99e739e872b1b9e99e96ca9a3a4cb28cdf220c74324277eee8", "", "mention"],
    ["p", "eebb74ab…"]
  ]
}
```

Three blocks: the film, the reply to the schema, the reference to the
suggestion. Compare it with the same film's [suggestion
event](curated-suggestion-events.md#a-real-one) — the first two blocks are identical.
Only the kind, the signer and the last block differ.

Note the two `a` tags. They're told apart by their marker and their kind
prefix: `31889:` marked `root` is the schema, `31888:` marked `mention` is the
suggestion. Likewise two `p` tags — the curator (from the reply) and the
suggester (credit).

## The source reference

| tag | | |
|---|---|---|
| `a` | `31888:<suggester>:<d>` | the suggestion's coordinate — follows the suggester's later edits |
| `e` | event id | the exact version the curator actually reviewed |
| `p` | suggester pubkey | credit |

Both `a` and `e`, deliberately: the coordinate keeps pointing at the entry as
its author revises it, while the id records what was in front of the curator at
the time. They answer different questions.

The reference is **optional**. A curator adding a title nobody suggested
publishes a curated event with no source block at all, and that is valid. When
a reference *is* present it must be well formed — a malformed one is worse than
none, because it credits the wrong person or points at an entry that was never
suggested.

> Coordinates are `kind:pubkey:d`, and a `d` may itself contain colons — ours
> do, `imdb:tt2821314`. Only the first two colons separate. `parseCoordinate()`
> handles this; splitting naively does not.

## Why a copy, and not a pointer

A curated event could have been a bare approval pointing at a suggestion. It
carries the full fields instead, for three reasons:

1. **Curating is editorial.** The curator can fix a year, swap a broken poster
   or tidy a description on the way through. A pointer can only say yes.
2. **The curated list stands on its own.** It doesn't stop working because a
   suggester deleted their entry or a relay dropped it.
3. **One set of rules.** Because a curated event has the same shape, it answers
   to the same schema and the same verifier. There is no second format to keep
   in sync.

The cost is duplication between the two events. That's the trade accepted.

## Who may curate

Only `schema.namespace` — the pubkey that published the schema.

```ts
canCurate(schema, pubkey)   // pubkey === schema.namespace
```

`visibility` has no bearing here. It governs who may **suggest**; a `public`
list still has exactly one curator. Curation is the one power the schema author
does not share.

There is no delegation. Adding co-curators would need its own tag on the schema
event, and there isn't one — the `p` tags on a schema are extra *suggesters* for
a closed or private list, not curators.

Curation is inert until the schema is published: with no `schema.namespace`
there is no curator, and `verifyCuratedCanonical` rejects everything.

## Verification

`verifyCuratedCanonical(event, schema, { pubkey })` is `verifyCuratedSuggestion` plus:

| check | example violation |
|---|---|
| kind is 31890 | `Expected kind 31890, got 31888.` |
| the schema has a published author | `This schema has no published author, so nothing can be curated under it.` |
| signed by that author | `Only the pubkey that published the schema may curate.` |
| any source reference is well formed | `"31888:nothex:x" is not a valid suggestion coordinate.` |

Everything from the [suggestion rules](curated-suggestion-events.md#verification) still
applies: required fields, types, `require-any`, the reply root.

## In the app

**The home page is the curated list.** A film appears there once the curator has
signed off on it, and not before — that's what makes it a curated screening
rather than a firehose. Everything anyone has suggested stays readable at
`/suggestions`, and the detail page for any of it still works.

```ts
// lib/util/dedup.ts
export function canonicalFilms(videos: Video[]): FilmGroup[] {
  return groupFilms(videos).filter((group) => group.primary.curated)
}
```

Grouping runs over *every* entry and only then drops the uncurated groups.
Filtering the videos first would work too, but each group would then know only
about its curated entry — losing the "+3 more suggestions" count on the card and
the sibling list on the detail page. The curated entry represents the film; what
was suggested behind it is still worth showing.

Within a group, the curated entry is the representative. However many people
suggested a title and however recently, the curator's version is the one on the
card:

```ts
const primary = entries.find((v) => v.curated) ?? entries[0]
```

The detail view marks it *Curated* and credits the original suggester. The other
suggestions stay visible under *Other suggestions for this title* — curating
promotes an entry, it doesn't hide the rest.

The store subscribes to curated events separately, scoped to the curator:

```js
{ kinds: [31890], authors: [curator], "#a": [curatedSchemaAddress] }
```

That filter only runs once `CURATED_SCHEMA_NAMESPACE` is set. Until it is, the app reads
no curated events at all — which now leaves the home page empty, since that is
all it lists. Setting it is part of publishing a schema, not an optional extra.

## Curating

The editorial workflow — list what's been suggested, pick one:

```bash
npm run curate                                    # what's pending, what's done
npm run curate -- --id=<event id> --dry-run       # preview the event
NOSTR_NSEC=nsec1... npm run curate -- --id=<event id>
NOSTR_NSEC=nsec1... npm run curate -- --all
```

It refuses to curate a suggestion that doesn't satisfy the schema, and refuses
to sign with a key that isn't the schema's author.

The bulk version, for seeding — every suggested film by default, one curated
entry per film rather than per suggestion:

```bash
NOSTR_NSEC=nsec1... npm run seed:curated
NOSTR_NSEC=nsec1... npm run seed:curated -- --count=12   # leave some pending
```

A suggestion counts as already curated when a curated event shares its `d` —
that's the coordinate both land on. Which means curating one person's suggestion
of a film marks the film curated, however many others also suggested it.
