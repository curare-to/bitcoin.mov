'use client'

import { useEffect, useRef, useState } from 'react'

/** On-chain address that unlocks subscriptions. */
const SUBSCRIPTION_ADDRESS = 'bc1qdlr878ddmy0fh5d4q2uscs5wy8sp8h527zn337'

/**
 * The "Unlock subscriptions" panel at the foot of the home page: the
 * subscription address, one-click copy, and a bitcoin: link for wallets.
 */
export function UnlockSubscriptions() {
  const [copied, setCopied] = useState(false)
  const addressRef = useRef<HTMLElement>(null)

  // Drop the "Copied" confirmation after a moment.
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SUBSCRIPTION_ADDRESS)
      setCopied(true)
      return
    } catch {
      // Clipboard access can be refused (insecure context, permissions
      // policy); fall through to the legacy path.
    }
    // Select the address and try the old copy command. Even if that fails
    // too, the selection leaves the user one keystroke from copying.
    const el = addressRef.current
    if (!el) return
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    try {
      if (document.execCommand('copy')) setCopied(true)
    } catch {
      // Nothing more to do — the address stays selected.
    }
  }

  return (
    <section
      id="unlock-subscriptions"
      aria-labelledby="unlock-subscriptions-title"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"
    >
      <p className="font-condensed uppercase tracking-[0.35em] text-xs text-[var(--color-btc)] mb-3">
        Pay with Bitcoin
      </p>
      <h2
        id="unlock-subscriptions-title"
        className="font-display font-black text-3xl sm:text-4xl tracking-tight"
      >
        Unlock subscriptions
      </h2>
      <p className="mt-3 text-[var(--color-muted)] max-w-2xl">
        Send Bitcoin to the address below to unlock subscriptions.
      </p>

      <div className="mt-6 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-3 rounded-xl border border-[var(--color-border-2)] bg-[var(--color-bg-2)] px-4 py-3">
          <span
            aria-hidden
            className="grid place-items-center shrink-0 w-8 h-8 rounded-full bg-[var(--color-btc)] text-black font-display font-black text-lg leading-none"
          >
            ₿
          </span>
          <code
            ref={addressRef}
            className="font-mono text-sm sm:text-base break-all select-all text-[var(--color-text)]"
          >
            {SUBSCRIPTION_ADDRESS}
          </code>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={copy}
            className="font-condensed uppercase tracking-widest text-sm px-5 py-3 rounded-md font-semibold whitespace-nowrap bg-[var(--color-btc)] text-black hover:bg-[var(--color-amber)] transition-colors cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <a
            href={`bitcoin:${SUBSCRIPTION_ADDRESS}`}
            className="font-condensed uppercase tracking-widest text-sm px-5 py-3 rounded-md font-medium whitespace-nowrap border border-[var(--color-border-2)] text-[var(--color-text)] hover:border-[var(--color-muted)] transition-colors"
          >
            Open in wallet
          </a>
        </div>
      </div>

      <span role="status" className="sr-only">
        {copied ? 'Address copied to clipboard' : ''}
      </span>
    </section>
  )
}
