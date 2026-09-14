'use client'

import Script from 'next/script'
import { useCallback, useEffect, useRef } from 'react'

const SCRIPT_SRC =
  'https://blinkbitcoin.github.io/blink-paywall/v1/blink-paywall.js'

/** The part of the `BlinkPaywall` global (defined by the script) we use. */
interface BlinkPaywallApi {
  mount(el: Element): { destroy(): void } | null
}

declare global {
  interface Window {
    BlinkPaywall?: BlinkPaywallApi
  }
}

/**
 * The Blink paywall card at the foot of the home page: pay in sats to book a
 * call. The script draws the card (in a shadow root), handles the invoice,
 * and redirects to Calendly once it settles.
 * https://github.com/blinkbitcoin/blink-paywall
 */
export function BlinkPaywall() {
  const hostRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<{ destroy(): void } | null>(null)

  // The script scans the document for [data-blink-paywall] once, when it
  // first runs. That covers the initial page load but not a client-side
  // navigation back here (the script is already loaded and won't run
  // again), so mount the card ourselves too. mount() is idempotent per
  // element, so on first load this just picks up the instance the scan made.
  const mount = useCallback(() => {
    const el = hostRef.current
    if (!el || !window.BlinkPaywall || instanceRef.current) return
    instanceRef.current = window.BlinkPaywall.mount(el)
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
    <>
      <div
        ref={hostRef}
        data-blink-paywall=""
        data-username="catalyst"
        data-amount="121256"
        data-currency="sats"
        data-id="what-s-next"
        data-title="What's Next?"
        data-description="Let's get on a call to talk about what is coming next."
        data-theme="dark"
        data-redirect="https://calendly.com/kgothatso-machankura/60min"
      />
      {/* Loads after hydration, so the card the script injects never races
          React's hydration of the div above. */}
      <Script src={SCRIPT_SRC} onReady={mount} />
    </>
  )
}
