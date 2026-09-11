NIP-XX
======

Curated Lists
-------------

`draft` `optional`

This NIP defines a way for one pubkey to publish a **curated list** that anyone
can suggest entries to: the curator publishes a *schema* describing what an
entry may contain, anyone replies to it with *suggestions* that satisfy the
schema, and the curator republishes the suggestions it accepts as *canonical*
entries. The list is the set of canonical entries; the suggestions are its
queue.

All three are addressable events ([NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)), so the coordinate
`kind:pubkey:d` identifies one entry and republishing with the same `d`
replaces it. The curator's pubkey is the namespace: a schema is fully
identified by `31889:<pubkey>:<d>`, and nothing global is claimed.

| kind    | name                     | published by      |
|---------|--------------------------|-------------------|
| `31889` | curated schema event     | the curator       |
| `31888` | curated suggestion event | anyone            |
| `31890` | curated canonical event  | the curator only  |

"Curated" is the family name for the three; *schema*, *suggestion* and
*canonical* tell them apart.

## Curated schema event (`kind:31889`)

A schema event declares what an entry in the list may contain, who may suggest,
and whose list it is. It is the one document the other two kinds are checked
against.

### Tags

| tag           | required | value                                                          |
|---------------|----------|----------------------------------------------------------------|
| `d`           | MUST     | the schema's identifier                                        |
| `title`       | MUST     | a label for the event                                          |
| `name`        | MUST     | the list's identity — what people call it (≤ 100 chars)        |
| `description` | MUST     | what the list is for (≤ 500 chars)                             |
| `visibility`  | MUST     | `public`, `closed` or `private` (see [Visibility](#visibility)) |
| `k`           | SHOULD   | the kind suggestions are published under (`31888`)             |
| `picture`     | MAY      | an `https:` image URL for the list                             |
| `domain`      | MAY      | a hostname the list publishes under (see [Domain](#domain))    |
| `field`       | MAY, repeated | one entry field — see [Field tags](#field-tags)           |
| `require-any` | MAY, repeated | field names of which at least one MUST be present         |
| `p`           | MAY, repeated | additional pubkeys allowed to suggest on a `closed` or `private` list |

`.content` SHOULD mirror the `description` tag so that clients which read
content rather than tags still show something. The tag is authoritative; a
client MAY fall back to `.content` when the tag is absent.

`title` and `name` are both required and usually differ: `title` labels the
event ("bitcoin.mov suggestion"); `name` is the publisher ("bitcoin.mov").

A schema event that is missing `d`, `title`, `name`, `description` or
`visibility`, whose `visibility` is not one of the three values, or that has no
`field` tags, is not a usable schema and clients MUST reject it. `visibility`
is never defaulted: a list that does not say who may suggest to it is not one
a client should act on.

### Field tags

```
["field", <name>, <type>, "required" | "optional", <placeholder>, <label>, <config>]
```

| position | |
|---|---|
| `name`        | stable field name; the key a form collects the value under |
| `type`        | one of the [field types](#field-types) |
| optionality   | the literal string `required` or `optional` |
| `placeholder` | example value shown in an empty input (MAY be empty) |
| `label`       | human label for the input; defaults to `name` if empty |
| `config`      | a JSON object of [config keys](#config-keys); `{}` if none |

A malformed `config` blob MUST NOT invalidate the field: the field is read
without its constraints.

#### Field types

| type       | rule |
|------------|------|
| `text`     | single-line string, length-capped by `max` |
| `longtext` | multi-line string, length-capped by `max` |
| `token`    | single word — no whitespace — e.g. `imdb:tt2821314` |
| `url`      | an `http:` or `https:` URL; `https: true` narrows it to `https:` only |
| `image`    | an `https:` URL (browsers block insecure images on secure pages) |
| `enum`     | one of `options` |
| `year`     | an integer year, bounded by `min` / `max` |
| `duration` | a positive integer number of seconds, bounded by `min` / `max` |
| `number`   | an integer, bounded by `min` / `max` |

#### Config keys

| key       | |
|-----------|---|
| `tag`     | the tag the field writes to; defaults to the field `name`. The literal `content` means the event's `.content` rather than a tag |
| `marker`  | a marker written as the tag's third element, e.g. `["r", <url>, "watch"]`, and used to tell fields that share a tag apart |
| `max`     | for text-ish types, the maximum characters after trimming; for numeric types, the maximum value |
| `min`     | the minimum value (numeric types only) |
| `options` | the allowed values of an `enum` |
| `https`   | require `https:` on a `url` |
| `repeat`  | the tag MAY appear more than once |
| `pattern` | a regular expression source the trimmed value MUST match end to end |
| `derived` | the client fills the value in itself and MUST NOT prompt for it |
| `hint`    | helper text shown under the input |

`max` doing double duty is safe because a field is either text-ish or numeric,
never both.

#### Mandatory fields

Every list has a field writing to `d` and a field writing to `title`, and both
are required. A client reading a schema event that omits or relaxes either
MUST put them back — a schema fetched from a hostile relay cannot talk a client
into accepting untitled or unaddressable entries.

### Visibility

`visibility` governs who may **suggest**. It has no bearing on curation: a
`public` list still has exactly one curator.

| value     | who may suggest                        | who may read |
|-----------|----------------------------------------|--------------|
| `public`  | anyone                                 | anyone |
| `closed`  | the curator and any `p`-tagged pubkeys | anyone |
| `private` | the curator and any `p`-tagged pubkeys | clients SHOULD only surface entries to those pubkeys |

Relays are open, so `private` is a client-side convention, not encryption.
Nothing secret belongs in a `private` list.

### Domain

`domain` is a bare hostname (no scheme, port or path; at least two labels).
Clients MUST normalise it to lowercase and MUST reject a schema whose `domain`
is not a valid hostname.

When present it SHOULD be displayed **in place of** `name`. It is a claim, not
proof — anyone can put any domain in a tag. A client that wants to present it
as verified SHOULD confirm it [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) style: `https://<domain>/.well-known/nostr.json?name=_`
MUST name the schema's `pubkey`.

### Example

The bitcoin.mov schema, as published (field tags abbreviated):

```jsonc
{
  "kind": 31889,
  "pubkey": "7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25",
  "created_at": 1735689600,
  "tags": [
    ["d", "bitcoin.mov"],
    ["title", "bitcoin.mov suggestion"],
    ["name", "bitcoin.mov"],
    ["description", "Fields for a bitcoin.mov entry: a Bitcoin movie, documentary, short, interview or series, with at least one link to watch or look it up."],
    ["k", "31888"],
    ["visibility", "public"],
    ["picture", "https://bitcoin.mov/icon.svg"],
    ["domain", "bitcoin.mov"],

    ["field", "identifier", "token", "required", "the-rise-and-rise-of-bitcoin-2014", "Identifier", "{\"tag\":\"d\",\"max\":80,\"derived\":true}"],
    ["field", "title", "text", "required", "The Rise and Rise of Bitcoin", "Title", "{\"max\":200}"],
    ["field", "year", "year", "optional", "2014", "Year", "{\"min\":1900,\"max\":2100}"],
    ["field", "type", "enum", "required", "documentary", "Type", "{\"options\":[\"movie\",\"documentary\",\"short\",\"interview\",\"series\",\"other\"]}"],
    ["field", "watchUrl", "url", "optional", "https://youtube.com/watch?v=…", "Watch / reference URL", "{\"tag\":\"r\",\"marker\":\"watch\",\"max\":500,\"repeat\":true}"],
    ["field", "imdbUrl", "url", "optional", "https://imdb.com/title/tt2821314", "IMDb URL", "{\"tag\":\"r\",\"marker\":\"imdb\",\"max\":500}"],
    ["field", "image", "image", "optional", "https://…/poster.jpg", "Poster image URL (https)", "{\"max\":500}"],
    ["field", "hashtags", "token", "optional", "bitcoin", "Hashtags", "{\"tag\":\"t\",\"max\":60,\"repeat\":true,\"derived\":true}"],
    ["field", "description", "longtext", "optional", "Why is this worth watching?", "Description / review", "{\"tag\":\"content\",\"max\":4000}"],

    ["require-any", "watchUrl", "imdbUrl"]
  ],
  "content": "Fields for a bitcoin.mov entry: …"
}
```

`require-any` here says an entry needs a watch link *or* an IMDb link without
making either one required — a real entry in that list has an IMDb page and
nowhere to watch it.

## Curated suggestion event (`kind:31888`)

A suggestion is an entry someone proposes for the list. Anyone MAY publish one
(subject to the schema's `visibility`). It is published as a **reply to the
schema event**, so the list is the thread of replies to its own schema.

### Tags

| tag | required | value |
|-----|----------|-------|
| `d` | MUST | the entry's identifier |
| `title` | MUST | the entry's title |
| *per schema* | as the schema says | one tag per field, at the field's `tag`, with its `marker` as the third element when it has one |
| `a` | MUST | `["a", "31889:<curator>:<schema d>", "<relay url>", "root"]` — the schema replied to |
| `p` | SHOULD | the curator's pubkey |
| `k` | SHOULD | `31889` |

`.content` carries the value of the field whose `tag` is `content`, if the
schema has one.

The root is the schema's **`a` coordinate**, not an `e` event id. Kind 31889 is
addressable: revising the schema mints a new event id but keeps the coordinate,
and pinning an id would orphan every suggestion the moment the schema was
edited. The marker convention follows [NIP-10](https://github.com/nostr-protocol/nips/blob/master/10.md). `p` and `k` are the
usual reply courtesies and are not load-bearing; `a` is what is verified and
what relays are queried on.

Tags the schema does not define MAY be present and MUST be ignored — other
clients legitimately add their own.

### Derived fields

A field marked `derived` is filled in by the publishing client rather than
collected from the user. The reference implementation derives:

- `d` — the entry's external id when it has one (so the same subject stays one
  editable entry), else a slug of its title and year;
- `t` — a discovery hashtag plus the entry's type.

A derived field is still verified like any other; `derived` only says who
supplies it.

### Example

*The Rise and Rise of Bitcoin*, suggested by `eebb74ab…`:

```jsonc
{
  "kind": 31888,
  "pubkey": "eebb74ab6bfb8485722ab1d4acee856eee96f17a9e1721f9c7cc63376c40b860",
  "created_at": 1735689660,
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

    ["a", "31889:7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25:bitcoin.mov", "", "root"],
    ["p", "7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25"],
    ["k", "31889"]
  ],
  "content": "Follows programmer Daniel Mross and the early Bitcoin community from 2011 onward — the miners, entrepreneurs and evangelists of Bitcoin's formative years."
}
```

## Curated canonical event (`kind:31890`)

A canonical event is a suggestion the curator has signed off on: the version of
an entry the list stands behind. It carries the **same fields as a suggestion**
and answers to the same schema — it is an entry, not an annotation.

### Tags

Everything a suggestion carries, including the `a` root to the schema, plus an
optional reference to the suggestion it came from:

| tag | required | value |
|-----|----------|-------|
| `a` | MAY | `["a", "31888:<suggester>:<d>", "<relay url>", "mention"]` — the suggestion's coordinate, which follows the suggester's later edits |
| `e` | MAY | `["e", "<suggestion event id>", "<relay url>", "mention"]` — the exact version the curator reviewed |
| `p` | MAY | the suggester's pubkey |

The two `a` tags are told apart by their kind prefix and marker: `31889:…`
marked `root` is the schema; `31888:…` marked `mention` is the source.

### Rules

- The event's `pubkey` MUST be the schema event's `pubkey`. Curation is not
  delegated; the `p` tags on a schema name additional *suggesters*, not
  curators.
- The source reference is OPTIONAL — a curator MAY add an entry nobody
  suggested — but when an `a` tag with a `31888:` prefix is present it MUST be
  a well-formed coordinate.
- The canonical event SHOULD keep the suggestion's `d`, so that re-curating
  revises the entry in place rather than duplicating it.
- Because it is the same shape as a suggestion, the curator MAY correct the
  entry on the way through — fix a year, replace a poster. Curation is
  editorial, and a pointer could only say yes.

A canonical event MUST carry the full fields rather than only a reference:
the list must stand on its own if the suggester deletes their entry or a relay
drops it, and one verifier must serve both kinds.

### Example

The curator signing off on the suggestion above:

```jsonc
{
  "kind": 31890,
  "pubkey": "7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25",
  "created_at": 1735689720,
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

    ["a", "31889:7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25:bitcoin.mov", "", "root"],
    ["p", "7c965d8c2acdfd635562da3bcb82596b595be28b008d8b54ec702ed4c67d9d25"],
    ["k", "31889"],

    ["a", "31888:eebb74ab6bfb8485722ab1d4acee856eee96f17a9e1721f9c7cc63376c40b860:imdb:tt2821314", "", "mention"],
    ["e", "a809ddc2ad9c7b99e739e872b1b9e99e96ca9a3a4cb28cdf220c74324277eee8", "", "mention"],
    ["p", "eebb74ab6bfb8485722ab1d4acee856eee96f17a9e1721f9c7cc63376c40b860"]
  ],
  "content": "Follows programmer Daniel Mross and the early Bitcoin community from 2011 onward — the miners, entrepreneurs and evangelists of Bitcoin's formative years."
}
```

Compare it with the suggestion: the first two blocks are identical. Only the
kind, the signer and the last block differ.

## Coordinates

A coordinate is `<kind>:<pubkey>:<d>`. A `d` identifier MAY itself contain
colons — `imdb:tt2821314` does — so implementations MUST split on the first two
colons only. Splitting on every colon mangles the identifier and miscounts the
parts.

## Verification

Clients MUST verify a suggestion or canonical event against its schema and
MUST reject one that does not satisfy it, rather than displaying it with the
offending parts removed. Relays carry malformed, partial and hostile events
from other applications; a half-parsed entry is worse than a missing one.

A **suggestion** satisfies a schema when:

1. its kind is the schema's `k` (`31888`);
2. every `required` field is present and non-empty;
3. no field without `repeat` appears more than once;
4. every present value matches its field's type and config;
5. every `require-any` group has at least one field present;
6. its `a` root names the schema's coordinate — required whenever the schema
   has a coordinate to reply to;
7. its `pubkey` is permitted by the schema's `visibility`.

A **canonical** event satisfies a schema when it satisfies all of the above
for `kind:31890` and, additionally:

8. its `pubkey` equals the schema event's `pubkey`;
9. any `31888:`-prefixed `a` tag is a well-formed coordinate.

Note the ordering of 6 and the schema's existence: a suggestion published
before its schema had been published cannot have replied to it, and a client
MAY treat such an event as valid until the schema exists. Once it does, the
reply is mandatory and older entries MUST be republished to carry it — they
are addressable, so republishing replaces them.

## Querying

| you want | filter |
|---|---|
| a list's schema | `{"kinds":[31889],"authors":[<curator>],"#d":[<d>]}` |
| everything suggested to it | `{"kinds":[31888],"#a":["31889:<curator>:<d>"]}` |
| the curated list itself | `{"kinds":[31890],"authors":[<curator>],"#a":["31889:<curator>:<d>"]}` |

Scoping canonical events by `authors` is redundant with rule 8 above and is
done to spare the relay the work.

## Serving the schema over HTTPS

A site built around a list SHOULD also serve its signed schema event at

```
/.well-known/curare.to/nostr.json
```

as a JSON document:

```jsonc
{
  "coordinate": "31889:<curator>:<d>",
  "names":  { "_": "<curator>" },
  "relays": { "<curator>": ["wss://…"] },
  "schema": { /* the signed kind 31889 event */ }
}
```

`names` and `relays` follow the [NIP-05](https://github.com/nostr-protocol/nips/blob/master/05.md) shape so a reader can pick out
the curator and relay hints without parsing tags. This is **not** the NIP-05
path — that is `/.well-known/nostr.json` at the domain root, and it answers
"who am I" rather than "here is the schema". The path segment `curare.to`
names this protocol.

A client presenting a suggestion form SHOULD fetch this document, MUST verify
the signature of the event inside it, MUST reject it if the event is not a
usable schema, and SHOULD treat its absence as *this site is not accepting
suggestions*. The site serving the file proves nothing about who wrote it;
the signature does. When present, the form SHOULD be driven by the schema
it contains.

## Client behaviour

- A client displaying **the list** SHOULD show canonical events only. A client
  displaying **the queue** SHOULD show suggestions, and MAY mark a suggestion
  as accepted when a canonical event shares its `d`.
- Where several entries share a subject (by external id, else by normalised
  title and year), the canonical event SHOULD represent the group. The
  suggestions behind it remain valid, readable, and their authors' own to edit.
- Values that reach `href` or `src` — every `r` tag, every `image` — MUST be
  filtered for safe URL schemes at the point of rendering, regardless of what
  the schema verified. The schema checks the fields it names; an entry may
  carry `r` tags with markers the schema does not know, and those reach the
  page too.
- A client MUST NOT render entry strings as HTML.

## Relay behaviour

No relay support beyond [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md) addressable-event handling and
`#a` / `#d` tag queries is required.

## Security considerations

- **`domain` is a claim.** Display it as a label unless verified as described
  under [Domain](#domain).
- **`private` is not encryption.** Everything is on open relays; `private`
  asks clients not to surface it, and nothing more.
- **Signatures, not hosting, establish authorship.** A schema fetched over HTTPS
  from the list's own site MUST still have its signature checked; a relay MUST
  NOT be trusted to have done so.
- **A schema from a relay is untrusted input.** The mandatory-field rule exists
  so that no schema, wherever it came from, can relax `d` or `title`.

## Reference implementation

[bitcoin.mov](https://github.com/curare-to/bitcoin.mov) — a list of Bitcoin on
screen. The three
kinds are defined, built, parsed and verified in one dependency-free module
that both the browser bundle and the publishing scripts load, so the two cannot
drift. The seeding scripts publish a schema, then suggestions from a cast of
generated keys, then canonical events from the curator's key.
