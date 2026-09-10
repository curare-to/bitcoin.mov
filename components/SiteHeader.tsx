import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/85 backdrop-blur sticky top-0 z-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="grid place-items-center w-8 h-8 rounded-full bg-[var(--color-btc)] text-black font-display font-black text-lg leading-none">
            ₿
          </span>
          <span className="font-display font-bold tracking-tight text-xl">
            bitcoin<span className="text-[var(--color-muted)]">.mov</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 font-condensed uppercase tracking-widest text-xs">
          <Link
            href="/about"
            className="px-3 py-2 rounded-md text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
          >
            About
          </Link>
          <Link
            href="/submit"
            className="px-4 py-2 rounded-md font-semibold bg-[var(--color-btc)] text-black hover:bg-[var(--color-amber)] transition-colors"
          >
            Submit
          </Link>
        </nav>
      </div>
    </header>
  )
}
