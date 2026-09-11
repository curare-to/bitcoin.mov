'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Event } from 'nostr-tools/pure'
import {
  buildCuratedSuggestion,
  validateInput,
  videoToInput,
  parseEntry,
  VIDEO_TYPES,
  type CuratedSuggestionInput,
  type VideoType,
} from '@/lib/nostr/schema'
import {
  canSuggest,
  fieldProps,
  findField,
  curatedSchemaDisplayName,
  type CuratedSchema,
} from '@/lib/nostr/curatedSchemaEvent'
import { Poster } from '@/components/ui/Poster'
import { useSiteSchema, SITE_SCHEMA_PATH } from '@/lib/nostr/useSiteSchema'
import { signAndPublish, Nip07Error } from '@/lib/nostr/nip07'
import { videoStore, useVideos } from '@/lib/nostr/useVideos'
import { useNip07 } from '@/lib/nostr/useNip07'
import { pool } from '@/lib/nostr/pool'
import { READ_RELAYS, CURATED_SUGGESTION_KIND } from '@/lib/nostr/relays'
import { typeLabel, shortPubkey } from '@/lib/util/format'

const EMPTY: CuratedSuggestionInput = {
  title: '',
  year: '',
  type: 'documentary',
  director: '',
  durationSeconds: '',
  watchUrl: '',
  imdbUrl: '',
  image: '',
  externalId: '',
  lang: '',
  description: '',
}

type Errors = Partial<Record<keyof CuratedSuggestionInput | 'visibility', string>>

interface Success {
  id: string
  accepted: number
  total: number
}

interface EditTarget {
  /** The `d` to reuse so the new event replaces the old one. */
  d: string
  /** Owner pubkey — only they may replace it. */
  pubkey: string
}

/**
 * The form itself. `schema` is the site's *published* schema — fetched from
 * /.well-known/curare.to/nostr.json by SubmitGate — and it decides which inputs
 * exist, what they're called, what they suggest, and which are required.
 */
export function SubmitForm({ schema }: { schema: CuratedSchema }) {
  const { availability, pubkey, connect } = useNip07()
  const { videos } = useVideos()
  const editId = useSearchParams().get('edit')

  const typeOptions = (findField(schema, 'type')?.config.options ??
    VIDEO_TYPES) as readonly VideoType[]
  const blocked = !canSuggest(schema, pubkey)

  const [input, setInput] = useState<CuratedSuggestionInput>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [success, setSuccess] = useState<Success | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  // Load the entry being edited (from the store, or fetched by id) once.
  useEffect(() => {
    if (!editId || prefilled) return
    const fromStore = videos.find((v) => v.id === editId)
    if (fromStore) {
      setInput(videoToInput(fromStore))
      setEditTarget({ d: fromStore.identifier, pubkey: fromStore.pubkey })
      setPrefilled(true)
      return
    }
    let cancelled = false
    pool
      .get([...READ_RELAYS], { ids: [editId], kinds: [CURATED_SUGGESTION_KIND] })
      .then((event: Event | null) => {
        if (cancelled || !event) return
        const v = parseEntry(event)
        if (!v) return
        setInput(videoToInput(v))
        setEditTarget({ d: v.identifier, pubkey: v.pubkey })
        setPrefilled(true)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [editId, prefilled, videos])

  function set<K extends keyof CuratedSuggestionInput>(key: K, value: CuratedSuggestionInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const result = validateInput(input, schema, { pubkey: pubkey ?? undefined })
    setErrors(result.errors)
    if (!result.ok) {
      if (result.errors.visibility) setFormError(result.errors.visibility)
      return
    }

    setSubmitting(true)
    try {
      const signer = pubkey ?? (await connect())
      if (editTarget && signer && signer !== editTarget.pubkey) {
        throw new Nip07Error(
          'You can only edit entries published by your own key. Signing this will create a new entry instead.',
        )
      }
      const template = buildCuratedSuggestion(input, editTarget?.d, schema)
      const { signed, accepted, total } = await signAndPublish(template)
      videoStore.pushEvent(signed) // show it immediately
      setSuccess({ id: signed.id, accepted, total })
      setInput(EMPTY)
    } catch (err) {
      setFormError(
        err instanceof Nip07Error
          ? err.message
          : 'Something went wrong while submitting. Please try again.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="max-w-xl mx-auto text-center py-12 flex flex-col gap-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold">Published!</h1>
        <p className="text-[var(--color-muted)]">
          Your suggestion reached {success.accepted} of {success.total} relays.
          It may take a moment to propagate across the network.
        </p>
        <div className="flex items-center justify-center gap-3 mt-2">
          <Link
            href={`/video?id=${encodeURIComponent(success.id)}`}
            className="px-4 py-2 rounded-xl bg-[var(--color-btc)] text-black font-medium hover:bg-[var(--color-btc-dark)] transition-colors"
          >
            View entry
          </Link>
          <button
            type="button"
            onClick={() => {
              setSuccess(null)
              setEditTarget(null)
            }}
            className="px-4 py-2 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-muted)] transition-colors"
          >
            Submit another
          </button>
        </div>
      </div>
    )
  }

  const noSigner = availability === 'unavailable'

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="font-display font-black text-4xl tracking-tight mb-2">
        {editTarget ? 'Edit your entry' : 'Submit a title'}
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-[var(--color-muted)]">
          {editTarget
            ? 'Republishing replaces your existing entry — same address, new version.'
            : `Published to Nostr as a kind ${schema.kind} event, signed by your own key.`}
        </p>
        <Link
          href="/suggestions"
          className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-muted)] transition-colors"
        >
          View other suggestions →
        </Link>
      </div>

      <CuratedSchemaIdentity schema={schema} />

      <SignerBanner
        availability={availability}
        pubkey={pubkey}
        onConnect={connect}
      />

      {blocked && (
        <div className="mt-3 rounded-xl border border-yellow-900/50 bg-yellow-950/30 px-4 py-3 text-sm">
          <p className="font-medium text-yellow-200">
            This list is {schema.visibility}
          </p>
          <p className="text-[var(--color-muted)] mt-1">
            {pubkey
              ? 'Your key isn’t on the list of authors allowed to submit to it.'
              : 'Connect an authorised key to submit an entry.'}
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-5 mt-6 ${noSigner || blocked ? 'opacity-60' : ''}`}
      >
        <Field schema={schema} name="title" error={errors.title}>
          {(f) => (
            <input
              className={inputCls}
              value={input.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder={f.placeholder}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field schema={schema} name="type" error={errors.type}>
            {() => (
              <select
                className={inputCls}
                value={input.type}
                onChange={(e) => set('type', e.target.value as VideoType)}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {typeLabel(t)}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field schema={schema} name="year" error={errors.year}>
            {(f) => (
              <input
                className={inputCls}
                value={input.year}
                onChange={(e) => set('year', e.target.value)}
                placeholder={f.placeholder}
                inputMode="numeric"
              />
            )}
          </Field>

          {/* The tag stores seconds; this input asks for minutes and converts,
              so it overrides the schema's label, placeholder and hint. */}
          <Field
            schema={schema}
            name="durationSeconds"
            label="Duration (min)"
            hint="Optional — in minutes."
            error={errors.durationSeconds}
          >
            {() => (
              <input
                className={inputCls}
                value={
                  input.durationSeconds
                    ? String(Math.round(Number(input.durationSeconds) / 60) || '')
                    : ''
                }
                onChange={(e) => {
                  const mins = Number(e.target.value)
                  set(
                    'durationSeconds',
                    Number.isFinite(mins) && mins > 0 ? String(mins * 60) : '',
                  )
                }}
                placeholder="96"
                inputMode="numeric"
              />
            )}
          </Field>
        </div>

        <Field schema={schema} name="watchUrl" error={errors.watchUrl}>
          {(f) => (
            <input
              className={inputCls}
              value={input.watchUrl}
              onChange={(e) => set('watchUrl', e.target.value)}
              placeholder={f.placeholder}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field schema={schema} name="imdbUrl" error={errors.imdbUrl}>
            {(f) => (
              <input
                className={inputCls}
                value={input.imdbUrl}
                onChange={(e) => set('imdbUrl', e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </Field>

          <Field schema={schema} name="director" error={errors.director}>
            {(f) => (
              <input
                className={inputCls}
                value={input.director}
                onChange={(e) => set('director', e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </Field>
        </div>

        <Field schema={schema} name="image" error={errors.image}>
          {(f) => (
            <input
              className={inputCls}
              value={input.image}
              onChange={(e) => set('image', e.target.value)}
              placeholder={f.placeholder}
            />
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field schema={schema} name="externalId" error={errors.externalId}>
            {(f) => (
              <input
                className={inputCls}
                value={input.externalId}
                onChange={(e) => set('externalId', e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </Field>

          <Field schema={schema} name="lang" error={errors.lang}>
            {(f) => (
              <input
                className={inputCls}
                value={input.lang}
                onChange={(e) => set('lang', e.target.value)}
                placeholder={f.placeholder}
              />
            )}
          </Field>
        </div>

        <Field schema={schema} name="description" error={errors.description}>
          {(f) => (
            <textarea
              className={`${inputCls} min-h-28 resize-y`}
              value={input.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={f.placeholder}
            />
          )}
        </Field>

        {formError && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || noSigner || blocked}
          className="self-start px-6 py-2.5 rounded-xl font-medium bg-[var(--color-btc)] text-black hover:bg-[var(--color-btc-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? 'Signing…'
            : editTarget
              ? 'Update entry'
              : 'Sign & publish'}
        </button>
      </form>
    </div>
  )
}

/* ------------------------------ gate ------------------------------- */

/**
 * Whether this site is accepting suggestions at all.
 *
 * It is if — and only if — it serves a signed schema at
 * /.well-known/curare.to/nostr.json. No file means no published schema, so
 * there is nothing to submit to, and the page says so rather than offering a
 * form that would build events against a schema the site never published.
 */
export function SubmitGate() {
  const site = useSiteSchema()

  if (site.status === 'loading') {
    return (
      <div className="max-w-2xl mx-auto">
        <PageTitle />
        <p className="text-[var(--color-muted)] py-16 text-center">
          Checking whether this site is accepting suggestions…
        </p>
      </div>
    )
  }

  if (site.status === 'unavailable') {
    return (
      <div className="max-w-2xl mx-auto">
        <PageTitle />
        <div className="rounded-xl border border-dashed border-[var(--color-border)] text-center py-16 px-6">
          <div className="text-4xl mb-3">🎬</div>
          <h2 className="font-semibold text-lg mb-1">Not accepting submissions</h2>
          <p className="text-[var(--color-muted)] max-w-md mx-auto">
            This site hasn’t published a suggestion schema, so there’s nothing to
            submit to yet.
          </p>
          <p className="text-xs text-[var(--color-muted)] mt-4 font-mono">
            {SITE_SCHEMA_PATH} {site.reason}
          </p>
          <Link
            href="/"
            className="inline-block mt-6 text-sm text-[var(--color-btc)] hover:underline"
          >
            ← Back to the list
          </Link>
        </div>
      </div>
    )
  }

  return <SubmitForm schema={site.schema} />
}

function PageTitle() {
  return (
    <h1 className="font-display font-black text-4xl tracking-tight mb-2">
      Submit a title
    </h1>
  )
}

/* ----------------------------- pieces ------------------------------ */

/**
 * Whose list this is. The schema event carries a name, a description and an
 * optional picture and domain — and when there's a domain it stands in for the
 * name, since it's the one part of the identity that can be checked against
 * the outside world. Nothing here has been verified, so it's presented as a
 * label, not a badge.
 */
function CuratedSchemaIdentity({ schema }: { schema: CuratedSchema }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 mb-3">
      {schema.profileImageUrl && (
        <Poster
          src={schema.profileImageUrl}
          alt=""
          className="w-9 h-9 rounded-lg shrink-0"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{curatedSchemaDisplayName(schema)}</p>
        <p className="text-xs text-[var(--color-muted)] mt-0.5">
          {schema.description}
        </p>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-btc)] transition-colors placeholder:text-[var(--color-muted)]'

/**
 * One input, described by the schema. A schema that doesn't define `name`
 * renders nothing — that's how a republished schema adds or drops a field.
 * `label` / `hint` are overridable only for inputs that convert units.
 */
function Field({
  schema,
  name,
  label,
  hint,
  error,
  children,
}: {
  schema: CuratedSchema
  name: string
  label?: string
  hint?: string
  error?: string
  children: (props: { placeholder: string }) => React.ReactNode
}) {
  if (!findField(schema, name)) return null
  const field = fieldProps(schema, name)
  const helper = hint ?? field.hint

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label ?? field.label}
        {field.required && <span className="text-[var(--color-btc)]"> *</span>}
      </span>
      {children({ placeholder: field.placeholder })}
      {helper && !error && (
        <span className="text-xs text-[var(--color-muted)]">{helper}</span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </label>
  )
}

function SignerBanner({
  availability,
  pubkey,
  onConnect,
}: {
  availability: 'checking' | 'available' | 'unavailable'
  pubkey: string | null
  onConnect: () => void
}) {
  if (availability === 'checking') {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-muted)]">
        Looking for a Nostr signer…
      </div>
    )
  }

  if (availability === 'unavailable') {
    return (
      <div className="rounded-xl border border-yellow-900/50 bg-yellow-950/30 px-4 py-3 text-sm">
        <p className="font-medium text-yellow-200">No Nostr signer detected</p>
        <p className="text-[var(--color-muted)] mt-1">
          Install a NIP-07 browser extension —{' '}
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-btc)] hover:underline"
          >
            Alby
          </a>{' '}
          or{' '}
          <a
            href="https://github.com/fiatjaf/nos2x"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-btc)] hover:underline"
          >
            nos2x
          </a>{' '}
          — then reload. You can still browse without one.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm flex items-center justify-between gap-3">
      {pubkey ? (
        <span className="text-[var(--color-muted)]">
          Signing as{' '}
          <span className="text-[var(--color-text)] font-mono">
            {shortPubkey(pubkey)}
          </span>
        </span>
      ) : (
        <span className="text-[var(--color-muted)]">
          Nostr signer detected.
        </span>
      )}
      {!pubkey && (
        <button
          type="button"
          onClick={onConnect}
          className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-muted)] transition-colors text-[var(--color-text)]"
        >
          Connect
        </button>
      )}
    </div>
  )
}
