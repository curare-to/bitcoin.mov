# Seeding the initial batch

A curated batch of 37 Bitcoin films — documentaries, feature films, shorts and
series (2011–2024) — lives in
[`data/seed-films.json`](data/seed-films.json). The publish script signs each
one as a kind 31888 event **with your own key** and pushes it to the write
relays. Nothing is published until you run it — and the script never stores or
sees your key beyond the environment variable you pass it.

## 1. Preview (no key, no network)

```bash
npm run seed:dry
```

This prints the exact 37 events that would be published. Review titles, links
and tags before going live.

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

## Notes

- The event shape here mirrors `buildTemplate()` in
  [`lib/nostr/schema.ts`](lib/nostr/schema.ts) — the app's source of truth. If
  you change the schema, update `scripts/seed.mjs` to match.
- Metadata (titles, years, directors, IMDb ids, watch links) was drawn from
  IMDb and Jameson Lopp's Bitcoin documentaries list. Double-check anything you
  intend to present as authoritative.
