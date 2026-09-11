import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] mt-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-sm text-[var(--color-muted)] flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
        <p className="max-w-xl">
          A crowd-sourced, censorship-resistant guide to Bitcoin on screen. No
          accounts, no database — every entry is a{' '}
          <span className="text-[var(--color-text)]">Nostr</span> event (kind
          31888).
        </p>
        <div className="flex items-center gap-4 font-condensed uppercase tracking-widest text-xs">
          <Link href="/about" className="hover:text-[var(--color-text)]">
            About
          </Link>
          <Link href="/submit" className="hover:text-[var(--color-text)]">
            Submit
          </Link>
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]">
        <p className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center font-condensed uppercase tracking-widest text-base text-[var(--color-muted)]">
          Powered by{' '}
          <a
            href="https://curare.to"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-btc)] font-semibold hover:underline underline-offset-4"
          >
            curare.to
          </a>
        </p>
      </div>
    </footer>
  )
}
