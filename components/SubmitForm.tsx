'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { Event } from 'nostr-tools/pure'
import {
  buildTemplate,
  validateInput,
  videoToInput,
  parseEvent,
  VIDEO_TYPES,
  type SubmitInput,
  type VideoType,
} from '@/lib/nostr/schema'
import { signAndPublish, Nip07Error } from '@/lib/nostr/nip07'
import { videoStore, useVideos } from '@/lib/nostr/useVideos'
import { useNip07 } from '@/lib/nostr/useNip07'
import { pool } from '@/lib/nostr/pool'
import { READ_RELAYS, MOVIE_KIND } from '@/lib/nostr/relays'
import { typeLabel, shortPubkey } from '@/lib/util/format'

const EMPTY: SubmitInput = {
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

type Errors = Partial<Record<keyof SubmitInput, string>>

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

export function SubmitForm() {
  const { availability, pubkey, connect } = useNip07()
  const { videos } = useVideos()
  const editId = useSearchParams().get('edit')

  const [input, setInput] = useState<SubmitInput>(EMPTY)
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
      .get([...READ_RELAYS], { ids: [editId], kinds: [MOVIE_KIND] })
      .then((event: Event | null) => {
        if (cancelled || !event) return
        const v = parseEvent(event)
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

  function set<K extends keyof SubmitInput>(key: K, value: SubmitInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const result = validateInput(input)
    setErrors(result.errors)
    if (!result.ok) return

    setSubmitting(true)
    try {
      const signer = pubkey ?? (await connect())
      if (editTarget && signer && signer !== editTarget.pubkey) {
        throw new Nip07Error(
          'You can only edit entries published by your own key. Signing this will create a new entry instead.',
        )
      }
      const template = buildTemplate(input, editTarget?.d)
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
          Your submission reached {success.accepted} of {success.total} relays.
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
      <p className="text-[var(--color-muted)] mb-6">
        {editTarget
          ? 'Republishing replaces your existing entry — same address, new version.'
          : 'Add a Bitcoin movie, documentary or video. It’s published to Nostr as a kind 31888 event, signed by your own key.'}
      </p>

      <SignerBanner
        availability={availability}
        pubkey={pubkey}
        onConnect={connect}
      />

      <form
        onSubmit={handleSubmit}
        className={`flex flex-col gap-5 mt-6 ${noSigner ? 'opacity-60' : ''}`}
      >
        <Field label="Title" required error={errors.title}>
          <input
            className={inputCls}
            value={input.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="The Rise and Rise of Bitcoin"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Type">
            <select
              className={inputCls}
              value={input.type}
              onChange={(e) => set('type', e.target.value as VideoType)}
            >
              {VIDEO_TYPES.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Year" error={errors.year}>
            <input
              className={inputCls}
              value={input.year}
              onChange={(e) => set('year', e.target.value)}
              placeholder="2014"
              inputMode="numeric"
            />
          </Field>

          <Field label="Duration (min)" error={errors.durationSeconds}>
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
          </Field>
        </div>

        <Field label="Watch / reference URL" required error={errors.watchUrl}>
          <input
            className={inputCls}
            value={input.watchUrl}
            onChange={(e) => set('watchUrl', e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="IMDb URL" error={errors.imdbUrl}>
            <input
              className={inputCls}
              value={input.imdbUrl}
              onChange={(e) => set('imdbUrl', e.target.value)}
              placeholder="https://imdb.com/title/tt2821314"
            />
          </Field>

          <Field label="Director">
            <input
              className={inputCls}
              value={input.director}
              onChange={(e) => set('director', e.target.value)}
              placeholder="Nicholas Mross"
            />
          </Field>
        </div>

        <Field
          label="Poster image URL (https)"
          error={errors.image}
          hint="Optional — a link to a poster or thumbnail."
        >
          <input
            className={inputCls}
            value={input.image}
            onChange={(e) => set('image', e.target.value)}
            placeholder="https://…/poster.jpg"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="External ID"
            hint="Optional — helps dedupe, e.g. imdb:tt2821314"
          >
            <input
              className={inputCls}
              value={input.externalId}
              onChange={(e) => set('externalId', e.target.value)}
              placeholder="imdb:tt2821314"
            />
          </Field>

          <Field label="Language" hint="Optional — ISO code, e.g. en">
            <input
              className={inputCls}
              value={input.lang}
              onChange={(e) => set('lang', e.target.value)}
              placeholder="en"
            />
          </Field>
        </div>

        <Field label="Description / review" hint="Optional — plain text.">
          <textarea
            className={`${inputCls} min-h-28 resize-y`}
            value={input.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Why is this worth watching?"
          />
        </Field>

        {formError && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || noSigner}
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

/* ----------------------------- pieces ------------------------------ */

const inputCls =
  'w-full rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] px-4 py-2.5 text-sm outline-none focus:border-[var(--color-btc)] transition-colors placeholder:text-[var(--color-muted)]'

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-[var(--color-btc)]"> *</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="text-xs text-[var(--color-muted)]">{hint}</span>
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
