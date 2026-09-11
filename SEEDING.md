# Seeding

The list is three kinds of event signed by three kinds of author, so seeding it
convincingly takes three steps:

| step | kind | signed by |
|---|---|---|
| `npm run seed:schema` | 31889 schema | **your** key |
| `npm run seed:suggestions` | 31888 suggestions | a cast of generated throwaway keys |
| `npm run seed:curated` | 31890 curated entries | **your** key |

`npm run seed` runs all three in order and stops at the first failure. Steps 1
and 3 need `NOSTR_NSEC`; step 2 signs as other people and needs no key of yours.

The films come from [`data/seed-films.json`](data/seed-films.json) — a curated
batch of 37 Bitcoin documentaries, features, shorts and series (2011–2024).

## Preview first

```bash
npm run seed:dry
```

No key, no network, nothing signed. It prints the schema, then every suggestion
with the pubkey that would sign it. Step 3 needs suggestions on a relay to
preview against, so on an empty relay it says so and stops there rather than
failing.

## Run it

You need a Nostr secret key in `nsec1…` form. Use a **dedicated key** for the
curator identity if you don't want the list attributed to your personal one —
any Nostr client (Alby, nos2x, Amethyst…) can generate one.

```bash
NOSTR_NSEC=nsec1yourkeyhere npm run seed
```

Pass the key inline so it isn't written to disk or shell history. The scripts
never store it or see it beyond the environment variable.

Aim a run at a scratch relay with `--relay=`:

```bash
npm run seed:suggestions -- --relay=ws://localhost:7777
```

## The steps

### 1. Schema — `npm run seed:schema`

Publishes the kind 31889 schema. **Your pubkey becomes the curator**: the
coordinate `31889:<your pubkey>:bitcoin.mov` is what everything else replies to,
and only that key may curate.

It also writes the signed event to
`public/.well-known/curare.to/nostr.json`, which the static export copies into
the build — so the schema is fetchable from the site itself at
**`/.well-known/curare.to/nostr.json`**, with no relay and no Nostr client
involved. **Commit that file**: it's what the deployed site serves.

```jsonc
{
  "coordinate": "31889:<pubkey>:bitcoin.mov",
  "names":  { "_": "<pubkey>" },            // NIP-05 shape, so the curator's
  "relays": { "<pubkey>": ["ws://…"] },     // key and relays are easy to find
  "schema": { /* the signed kind 31889 event */ }
}
```

The file is written *before* publishing, so a relay being down doesn't cost you
the HTTPS copy. The submit form checks for it on load and says *Not accepting
submissions* until it's there — so until you've run this step, the site can be
browsed but not added to. It is not the NIP-05 path — that's `/.well-known/nostr.json` at
the domain root, and it answers a different question ("who am I", rather than
"here's the schema").

Same script as `npm run schema`, which also takes the identity flags
(`--name=`, `--domain=`, `--picture=`) — see the README.

### 2. Suggestions — `npm run seed:suggestions`

Publishes the 37 films as kind 31888 suggestions in reply to the schema, spread
across a cast of generated authors, with a few films suggested twice by
different people so the duplicate-collapsing and *+N more suggestions* paths
have something to show.

```bash
npm run seed:suggestions -- --authors=20 --duplicates=8 --salt=take-two
```

The keys are derived from `--salt` rather than random, so re-running replaces
the same events instead of leaving another 37 behind. They're throwaway dev
identities and the secrets are never written anywhere — which also means nobody
can edit these suggestions afterwards. A different `--salt` gives a different
cast.

This step reads the schema off the relay, so run step 1 first.

### 3. Curated — `npm run seed:curated`

Signs off on those suggestions as kind 31890 curated entries, using your key.
It curates **every suggested film** by default, so a freshly seeded relay gives
you a full home page — that page lists curated entries only, and an empty one
shows nothing of how the app behaves.

One entry per *film*, not per suggestion. Several people may have suggested the
same title and they share a `d`, so curating each in turn would land them all on
one coordinate; the newest suggestion of each film is the one signed off on. The
37 films seeded from 42 suggestions therefore become 37 curated entries.

To leave some pending — to see the curated/pending split in `npm run curate` or
on `/suggestions`:

```bash
NOSTR_NSEC=nsec1... npm run seed:curated -- --count=12
```

Limited picks are stable (sorted by `d`), and curated entries keep the
suggestion's `d`, so re-running revises them rather than piling up duplicates.
The script refuses to sign with a key that isn't the schema's author.

## Verify

```bash
npm run verify
```

Read-only. Checks every suggestion *and* every curated entry on the relay
against the published schema, and says why anything is being rejected. Then open
the app (`npm run dev`) — curated entries are marked, and represent their film
wherever a title was suggested more than once.

## Before going live

The site is a static export that talks to relays from the browser, so
deploying it is mostly a matter of pointing it somewhere real. In order:

1. **Relays.** Edit [`lib/nostr/relayList.ts`](lib/nostr/relayList.ts) — the
   one list both the app and the scripts use. They must be `wss://`: GitHub
   Pages is https, and a browser refuses an insecure `ws://` socket from an
   https page, so the site would connect to nothing and show nothing.
2. **Re-seed onto them.** Nothing exists on the new relays yet:
   `NOSTR_NSEC=nsec1… npm run seed`. Because the relay list is shared, no
   `--relay=` flag is needed.
3. **Commit the schema file.** `seed:schema` writes
   `public/.well-known/curare.to/nostr.json`, and the submit page refuses
   submissions without it. It is currently in `.gitignore`; the deploy builds
   from the repo, so an ignored file is a missing file. It holds only public
   data — the signed event and your pubkey — so committing it is safe.
   (Generating it in CI instead would mean putting your signing key in CI.
   Don't.)
4. **`SCHEMA_NAMESPACE`** in `lib/nostr/schemaEvent.ts` must be the key you
   seeded with. It already is if you haven't changed keys.
5. **Enable Pages.** Settings → Pages → Source: *GitHub Actions*. The workflow
   in `.github/workflows/pages.yml` deploys on push to `main`.
6. **Sub-path or domain?** Under `user.github.io/repo` set
   `NEXT_PUBLIC_BASE_PATH=/repo` in the workflow's build step; under a custom
   domain leave it unset and add the domain in Settings → Pages.

`public/.nojekyll` is already there: without it GitHub's Jekyll pass silently
drops every `_`- and `.`-prefixed path — which is `_next/` (all the JS) and
`.well-known/` (the schema).

## Curating for real

`npm run seed:curated` is the bulk version. The actual editorial workflow is:

```bash
npm run curate                                   # what's suggested, what's pending
NOSTR_NSEC=nsec1... npm run curate -- --id=<event id>
```

## Notes

- Every step is idempotent. All three kinds are addressable, and the generated
  authors are derived from a fixed salt, so re-running replaces rather than
  duplicates. That also means you can edit `data/seed-films.json` and re-run.
- The scripts import
  [`lib/nostr/schemaEvent.ts`](lib/nostr/schemaEvent.ts) directly (Node 22
  strips the types), so they build and verify events with the *same* code the
  browser runs. There is no second copy to keep in sync.
- Curation only lights up in the app once `SCHEMA_NAMESPACE` in
  `lib/nostr/schemaEvent.ts` is set to the curator's pubkey — step 1 prints it.
  Until then the app reads suggestions but not curated entries.
- Each entry ships with a verified poster `"image"` (https): portrait posters
  from Wikipedia/TMDB where available, otherwise the film's YouTube thumbnail.
  If a URL breaks, the card falls back to the ₿ placeholder automatically.
- Metadata (titles, years, directors, IMDb ids, watch links) was drawn from IMDb
  and Jameson Lopp's Bitcoin documentaries list. Double-check anything you
  intend to present as authoritative.
