# bitcoin.mov

A crowd-sourced, censorship-resistant list of Bitcoin movies, documentaries and
videos. There's no server and no database — every entry is a
[Nostr](https://nostr.com) event of **kind 31888**, read from public relays.
Anyone with a Nostr signer can add one — and edit their own entries later.

- **Stack:** Next.js (App Router) + React 19 + TypeScript + Tailwind v4
- **Data:** `nostr-tools` v2 (`SimplePool`), read from public relays
- **Submissions:** signed in the browser via a NIP-07 extension (Alby, nos2x) —
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

## The kind 31888 event (the "spec")

kind 31888 is a **custom, addressable application kind** this project defines —
it is *not* a standardized NIP. It sits in Nostr's addressable/parameterized-
replaceable range (30000–39999), so the coordinate `(kind, pubkey, d)` is unique
and republishing with the same `d` **replaces** the previous version. That's how
an author edits their entry. This client also defends against junk two ways:

1. **Read scope:** the subscription filters `kind 31888` **and** `#t = bitcoin`,
   so unrelated traffic can't crowd real entries out of a relay's result window.
2. **Parse guard:** an event is only shown if it has a non-empty `title` tag.
   All strings are rendered as text (never HTML), and only `http(s)` URLs are
   used for links/images (posters must be `https`).

### Shape

```jsonc
{
  "kind": 31888,
  "content": "Freeform review / description. Plain text.",
  "tags": [
    ["d", "imdb:tt2821314"],                      // REQUIRED — replaceable id
    ["title", "The Rise and Rise of Bitcoin"],    // REQUIRED
    ["t", "bitcoin"],                             // REQUIRED (namespace)
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

`d`, `title` and a `t=bitcoin` tag are required; everything else is optional and
parsed defensively. The `d` identifier defaults to the external id, falling back
to a `title-year` slug. Duplicate submissions of the same film *by different
authors* are still collapsed in the UI by external id (`i`), falling back to
normalized title + year.

The single source of truth for reading and building these events is
[`lib/nostr/schema.ts`](lib/nostr/schema.ts).

## Notes

- **Editing:** open your own entry and click *Edit this entry* — it reopens the
  form pre-filled and republishes with the same `d`, replacing the old version.
  Relays keep only the latest, and the client merges versions by newest
  `created_at` across relays.
- Relays read/written are configured in
  [`lib/nostr/relays.ts`](lib/nostr/relays.ts).
