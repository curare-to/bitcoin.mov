# Seeding the initial batch

A curated batch of 37 Bitcoin films — documentaries, feature films, shorts and
series (2011–2024) — lives in
[`data/seed-films.json`](data/seed-films.json). The publish script signs each
one as a kind 31888 event **with your own key** and pushes it to the write
relays. Nothing is published until you run it — and the script never stores or
sees your key beyond the environment variable you pass it.

Every film is checked against the kind 31889 schema before anything is signed,
and a single violation aborts the run — so the batch can't drift away from what
the app will accept.

## 1. Preview (no key, no network)

```bash
npm run seed:dry
```

This verifies all 37 films against the schema, then prints the exact events that
would be published:

```
✓ 37/37 films match schema "bitcoin.mov" (public).
```

Review titles, links and tags before going live. If a film doesn't match, you
get the field and the reason:

```
  ✗ [21] The Good Wife: Bitcoin for Dummies
      watchUrl: Provide at least one of: Watch / reference URL, IMDb URL.
```

## 2. Publish for real

You need a Nostr secret key in `nsec1…` form. Use a **dedicated key** for the
curator identity if you don't want these attributed to your personal one — any
Nostr client (Alby, nos2x, Amethyst…) can generate one, or your existing key
works fine.

```bash
NOSTR_NSEC=nsec1yourkeyhere npm run seed
```

You'll see the signing `npub` and a per-film relay result:

```
Signing as npub1…
✓ The Rise and Rise of Bitcoin — 4/4 relays
✓ Banking on Bitcoin — 3/4 relays
…
```

Pass the key inline (as above) so it isn't written to disk or shell history —
or `export NOSTR_NSEC=…` in a subshell you then close.

## 3. Verify

Open the app (`npm run dev`) — the 37 films appear in the reel and grid within a
few seconds. Because kind 31888 is **addressable**, the script is safe to
re-run: republishing replaces your own prior versions (same author + `d` tag)
rather than creating duplicates. That also means you can edit
`data/seed-films.json` and re-run to update entries.

## Posters

Each entry ships with a verified poster/thumbnail `"image"` (https): portrait
posters from Wikipedia/TMDB where available, otherwise the film's YouTube
thumbnail. Every URL was checked to load a real image. To swap one, edit the
entry's `"image"` in `data/seed-films.json` and re-run — or edit in-app via
*Edit this entry*. If a URL ever breaks, the card falls back to the ₿
placeholder automatically.

## Publish the schema too

The entries describe films; the **schema event** describes the entries. Publish
it once so other clients can render the same submission form:

```bash
npm run schema:dry                       # preview the schema and its event
NOSTR_NSEC=nsec1yourkeyhere npm run schema
```

The schema carries the list's identity — a required `name`, `description` and
`visibility`, plus an optional picture and domain:

```bash
npm run schema:dry -- --name="Bitcoin on screen" \
  --picture=https://example.com/logo.png --domain=example.com
```

A **domain replaces the name** wherever the list is shown, and nothing verifies
it for you, so only pass `--domain` for one you control and can serve
`/.well-known/nostr.json` from.

Then check what a relay actually holds:

```bash
npm run verify
```

## Notes

- The seed script imports
  [`lib/nostr/schemaEvent.ts`](lib/nostr/schemaEvent.ts) directly (Node 22
  strips the types), so it builds and verifies events with the *same* code the
  browser runs. There is no second copy to keep in sync — change the schema and
  `npm run seed:dry` tells you immediately if the batch no longer matches.
- Metadata (titles, years, directors, IMDb ids, watch links) was drawn from
  IMDb and Jameson Lopp's Bitcoin documentaries list. Double-check anything you
  intend to present as authoritative.
