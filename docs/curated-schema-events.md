# Curated schema events (kind 31889)

A curated schema event is the definition of a list: which tags a suggestion may carry,
which are required, what to show someone while they fill the form in, and whose
list it is.

It exists so the form isn't hardcoded. Because it lives on a relay, another
client can render the same submission form without shipping this repo's code,
and the curator can change the fields by republishing rather than by shipping a
release.

- **Addressable**, so revising it replaces the old version in place.
- **The author's pubkey is the namespace.** `31889:<pubkey>:<d>` identifies one
  schema and no other. Nothing global is claimed, so nothing can be squatted,
  and there is no namespace tag a suggestion has to carry.
- **The author is the curator.** Only that pubkey may publish curated events
  under it.

```bash
npm run schema:dry    # print the schema and the event it produces
npm run schema        # NOSTR_NSEC=nsec1… — publish it  (= npm run seed:schema)
```

## Tags

| tag | | |
|---|---|---|
| `d` | **required** | the schema's identifier — `bitcoin.mov` |
| `title` | **required** | labels the event |
| `name` | **required** | the list's identity — what people call it |
| `description` | **required** | what the list is for (≤ 500 chars) |
| `visibility` | **required** | `public` \| `private` \| `closed` |
| `picture` | optional | profile image, https only |
| `domain` | optional | **replaces the name** wherever the list is shown |
| `k` | | the kind this schema governs (31888) |
| `field` | repeated | one per field — see below |
| `require-any` | repeated | field names, at least one of which must be present |
| `p` | repeated | extra pubkeys allowed to suggest on a closed/private list |
| `relay` | repeated | where the list lives — the relays replies are published to and read from |

`content` mirrors the `description` tag, so generic Nostr clients that read
content rather than our tags still show something. The tag is authoritative.

### bitcoin.mov's, as published

```json
["d","bitcoin.mov"]
["title","bitcoin.mov suggestion"]
["name","bitcoin.mov"]
["description","Fields for a bitcoin.mov entry: a Bitcoin movie, documentary, short, interview or series, with at least one link to watch or look it up."]
["k","31888"]
["visibility","public"]
["require-any","watchUrl","imdbUrl"]
```

Plus thirteen `field` tags.

## Field tags

```
["field", name, type, "required"|"optional", placeholder, label, config]
```

The four things a form needs are positional; everything else is a JSON blob in
position 6.

```json
["field","title","text","required","The Rise and Rise of Bitcoin","Title","{\"max\":200}"]
["field","year","year","optional","2014","Year","{\"min\":1900,\"max\":2100}"]
["field","watchUrl","url","optional","https://youtube.com/watch?v=…","Watch / reference URL","{\"tag\":\"r\",\"marker\":\"watch\",\"max\":500,\"repeat\":true}"]
["field","description","longtext","optional","Why is this worth watching?","Description / review","{\"tag\":\"content\",\"max\":4000,\"hint\":\"Optional — plain text.\"}"]
```

A malformed config blob costs the field its constraints, not its life — the
field is still read, just without them.

### Types

| type | rule |
|---|---|
| `text` | single-line string, length-capped |
| `longtext` | multi-line string |
| `token` | short single-word value, no whitespace — `imdb:tt2821314` |
| `url` | http(s) URL; `https: true` narrows it |
| `image` | URL that must be https — mixed content is blocked in browsers |
| `enum` | one of `options` |
| `year` | integer year, bounded by `min`/`max` |
| `duration` | positive integer seconds, bounded by `min`/`max` |
| `number` | integer, bounded by `min`/`max` |

### Config keys

| key | |
|---|---|
| `tag` | the tag this field writes to. Defaults to the field name. `content` means the event body |
| `marker` | tag marker, the third element — `["r", url, "watch"]` |
| `max` | maximum **characters** for text-ish types; maximum **value** for numeric ones |
| `min` | minimum value (numeric types only) |
| `options` | allowed values for an `enum` |
| `https` | require https on a `url` |
| `repeat` | the tag may appear more than once |
| `pattern` | regex source the trimmed value must match end-to-end |
| `derived` | the app fills this in — never prompt for it |
| `hint` | helper text under the input |

`max` doing double duty is safe because a field is either text-ish or numeric,
never both.

### bitcoin.mov's fields

| name | tag | type | required | notes |
|---|---|---|---|---|
| `identifier` | `d` | token | **yes** | derived from the external id, else a title-year slug |
| `title` | `title` | text | **yes** | ≤ 200 chars |
| `year` | `year` | year | no | 1900–2100 |
| `type` | `type` | enum | **yes** | movie, documentary, short, interview, series, other |
| `director` | `director` | text | no | ≤ 120 chars |
| `durationSeconds` | `duration` | duration | no | seconds; the form asks for minutes and converts |
| `watchUrl` | `r` + `watch` | url | no\* | |
| `imdbUrl` | `r` + `imdb` | url | no\* | |
| `image` | `image` | image | no | https only |
| `externalId` | `i` | token | no | dedupe key — `imdb:tt2821314` |
| `lang` | `lang` | token | no | ISO-ish |
| `hashtags` | `t` | token | no | derived: `bitcoin` plus the type |
| `description` | *content* | longtext | no | ≤ 4000 chars |

\* Neither link is required on its own, but `["require-any","watchUrl","imdbUrl"]`
means at least one must be there. That rule exists because of a real entry:
*The Good Wife: Bitcoin for Dummies* has an IMDb page and nowhere to watch it.
Making `watchUrl` required would have excluded it; dropping the requirement
entirely would have let linkless entries in.

## Relays

`["relay", "wss://…"]`, repeated. Where suggestions and canonical events are
published to and read from. Signed into the event, so a client that finds the
schema anywhere knows where a reply belongs — and can't be sent elsewhere by an
unsigned config file. The publish script signs the relays it is publishing to,
and the `relays` map in the well-known document is copied from these tags, not
from configuration, so the two can't disagree.

The submit form publishes to these and shows them under the list's name. A
malformed one (`https://`, no host) fails the whole schema: a client that
accepted it could silently fail to publish.

## Identity

`title` and `name` are both required and usually differ. `title` labels the
event — "bitcoin.mov suggestion". `name` is the publisher — "bitcoin.mov".

`curatedSchemaDisplayName()` returns `domain ?? name`: a domain replaces the name
wherever the list is shown.

> **A domain is a claim, not proof.** Anyone can put any domain in a tag. The
> override exists because a domain is the one part of the identity that *can* be
> checked against the outside world:
>
> ```ts
> await verifyDomain(schema)   // https://<domain>/.well-known/nostr.json?name=_
> ```
>
> That's NIP-05 style, opt-in and network-bound. Nothing calls it for you, and
> the submit form presents the name as a label rather than a verified badge.
> Only set `--domain=` for a domain you control.

## Visibility

| | who may suggest | who may read |
|---|---|---|
| `public` | anyone | anyone |
| `closed` | the curator + `p` authors | anyone |
| `private` | the curator + `p` authors | clients should only surface it to those authors |

Relays are open, so `private` is a client-side convention, not encryption.
Never put secrets in a "private" list.

Visibility governs **suggesting only**. Curation is never delegated — see
[curated-canonical-events.md](curated-canonical-events.md).

## Rules that can't be opted out of

`normalizeCuratedSchema()` runs on every schema, whether bundled or read off a relay.
It forces a `d` field and a `title` field to exist and to be required, putting
them back if a schema event omits or relaxes them. A schema fetched from a
hostile relay therefore cannot talk this client into accepting untitled entries.

`verifyCuratedSchemaEvent(event)` returns the reasons a schema event is unusable:

- not kind 31889
- missing or over-long `d`, `title`, `name` or `description`
- missing or unrecognised `visibility` — it is never guessed
- a `picture` that isn't https, or a `domain` that isn't a domain
- no `field` tags at all

`parseCuratedSchemaEvent(event)` is the same check, returning the schema or `null`.

## Publishing

```bash
npm run schema:dry -- --name="Bitcoin on screen" \
  --picture=https://example.com/logo.png --domain=example.com
NOSTR_NSEC=nsec1... npm run schema
```

It prints the coordinate and the next steps. To make the app read curated
events, set `CURATED_SCHEMA_NAMESPACE` in
[`lib/nostr/curatedSchemaEvent.ts`](../lib/nostr/curatedSchemaEvent.ts) to the pubkey it
prints.

### Served over HTTPS too

Publishing writes the signed event to
`public/.well-known/curare.to/nostr.json`. `public/` is copied verbatim into the
static export, so the schema is fetchable from the site itself at
`/.well-known/curare.to/nostr.json` — no relay, no Nostr client. Commit the file;
it's what the deployed site serves.

```jsonc
{
  "coordinate": "31889:<pubkey>:bitcoin.mov",
  "names":  { "_": "<pubkey>" },
  "relays": { "<pubkey>": ["ws://…"] },
  "schema": { /* the signed kind 31889 event */ }
}
```

`names` and `relays` follow the NIP-05 shape so a reader can pick out the
curator's pubkey and relay hints without parsing the event. This is **not** the
NIP-05 path, though: that's `/.well-known/nostr.json` at the domain root, and
it's what `verifyDomain()` checks. This file says *here is the schema*; NIP-05
says *here is who I am*.

The write happens before publishing, so an unreachable relay doesn't cost you
the HTTPS copy.

**The submit form gates on this file.** It fetches it on load; if it's missing,
isn't JSON, holds no event, holds one whose signature doesn't verify, or holds
one that isn't a usable schema, the page says *Not accepting submissions* and
shows which of those it was. When it's there, the form is driven by *that*
schema — the one the site actually published — rather than the bundled default.
So a site with no published schema offers no form, rather than a form that
would build events against a schema nobody signed.

> Setting `CURATED_SCHEMA_NAMESPACE` also makes the reply root **mandatory** on
> suggestions, so entries published before the schema existed stop verifying.
> Re-run `npm run seed` — everything is addressable, so entries are replaced by
> `d` rather than duplicated. `npm run verify` names any that still need it.
