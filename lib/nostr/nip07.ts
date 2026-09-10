import type { Event, EventTemplate } from 'nostr-tools/pure'
import { verifyEvent } from 'nostr-tools/pure'
import type { Nip07Provider } from '@/types/nostr'
import { pool } from './pool'
import { WRITE_RELAYS } from './relays'

/* ------------------------------------------------------------------ *
 * The no-nsec boundary.
 *
 * Signing happens ENTIRELY inside the user's NIP-07 extension. There is no
 * code path in this app that reads, requests, imports, or stores a private
 * key — we only ever call getPublicKey() and signEvent() on window.nostr.
 * ------------------------------------------------------------------ */

/** Returns the injected NIP-07 provider, or null (SSR-safe). */
export function getNip07(): Nip07Provider | null {
  if (typeof window === 'undefined') return null
  return window.nostr ?? null
}

export interface PublishResult {
  signed: Event
  /** Number of relays that accepted the event. */
  accepted: number
  /** Total relays we attempted to publish to. */
  total: number
}

export class Nip07Error extends Error {}

/**
 * Sign an unsigned template via the extension and publish it, best-effort,
 * to the write relays. Throws Nip07Error with a friendly message on failure.
 */
export async function signAndPublish(
  template: EventTemplate,
): Promise<PublishResult> {
  const provider = getNip07()
  if (!provider) {
    throw new Nip07Error(
      'No Nostr signer found. Install a NIP-07 extension (Alby or nos2x) to submit.',
    )
  }

  let signed: Event
  try {
    signed = await provider.signEvent(template)
  } catch (err) {
    throw new Nip07Error(
      err instanceof Error && err.message
        ? `Signing was cancelled or failed: ${err.message}`
        : 'Signing was cancelled or failed.',
    )
  }

  // Sanity check the extension actually returned a valid, signed event.
  if (!signed?.sig || !verifyEvent(signed)) {
    throw new Nip07Error('The signer returned an invalid event.')
  }

  const relays = [...WRITE_RELAYS]
  const results = await Promise.allSettled(pool.publish(relays, signed))
  const accepted = results.filter((r) => r.status === 'fulfilled').length

  if (accepted === 0) {
    throw new Nip07Error(
      'The event was signed but no relay accepted it. Try again in a moment.',
    )
  }

  return { signed, accepted, total: relays.length }
}
