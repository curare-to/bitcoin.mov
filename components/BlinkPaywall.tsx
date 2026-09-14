'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef, useState } from 'react'

const SCRIPT_SRC =
  'https://blinkbitcoin.github.io/blink-paywall/v1/blink-paywall.js'

/** Where paying gets you: the booking page. */
const NEXT_URL = 'https://calendly.com/kgothatso-machankura/60min'

/** What we use of the `BlinkPaywall` global (defined by the script). */
interface BlinkPaywallApi {
  mount(
    el: Element,
    overrides?: { onUnlock?(receipt: BlinkReceipt): void },
  ): BlinkInstance | null
}
interface BlinkReceipt {
  /** When the invoice settled, ms since the epoch. */
  paidAt?: number
}
interface BlinkInstance {
  destroy(): void
}

declare global {
  interface Window {
    BlinkPaywall?: BlinkPaywallApi
  }
}

/**
 * The Blink paywall card at the foot of the home page: pay in sats to book a
 * call. The script draws the card (in a shadow root) and handles the invoice;
 * once it settles we send the visitor on to the booking page.
 *
 * The script remembers payments in localStorage, so on a later visit the card
 * unlocks by itself as soon as it mounts. We don't redirect then — someone
 * who has paid shouldn't be bounced off the page every time they come back —
 * but offer a button to the booking page instead. That's why the redirect
 * lives here rather than in a data-redirect attribute, and why the div has no
 * data-blink-paywall marker: the script's own scan would mount it without our
 * onUnlock, and mount() is first-come per element.
 * https://github.com/blinkbitcoin/blink-paywall
 */
export function BlinkPaywall() {
  const hostRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<BlinkInstance | null>(null)
  const [unlocked, setUnlocked] = useState(false)

  // Mount the card: once the script has loaded on the first page load, and
  // on every later mount of this component (client-side navigation back
  // here, when the script is already loaded).
  const mount = useCallback(() => {
    const el = hostRef.current
    if (!el || !window.BlinkPaywall || instanceRef.current) return
    const mountedAt = Date.now()
    instanceRef.current = window.BlinkPaywall.mount(el, {
      onUnlock(receipt) {
        setUnlocked(true)
        // A receipt older than this mount was restored from storage: they
        // paid on an earlier visit, so leave them the button. Anything newer
        // settled just now — while they watched, or found paid on return
        // from a wallet app — and goes straight through.
        if (receipt.paidAt !== undefined && receipt.paidAt >= mountedAt) {
          window.location.assign(NEXT_URL)
        }
      },
    })
  }, [])

  useEffect(() => {
    mount()
    return () => {
      // Leaving the page: stop the invoice countdown and payment polling.
      instanceRef.current?.destroy()
      instanceRef.current = null
    }
  }, [mount])

  return (
    <div>
      <div
        ref={hostRef}
        data-username="catalyst"
        data-amount="121256"
        data-currency="sats"
        data-id="what-s-next"
        data-title="What's Next?"
        data-description="Let's get on a call to talk about what is coming next."
        data-theme="dark"
      />
      {unlocked && (
        <p className="mt-4 text-center">
          <a
            href={NEXT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block font-condensed uppercase tracking-widest text-sm px-6 py-3 rounded-md font-semibold bg-[var(--color-btc)] text-black hover:bg-[var(--color-amber)] transition-colors"
          >
            Learn what&rsquo;s next
          </a>
        </p>
      )}
      {/* Loads after hydration, so the card the script injects never races
          React's hydration of the div above. */}
      <Script src={SCRIPT_SRC} onReady={mount} />
    </div>
  )
}
