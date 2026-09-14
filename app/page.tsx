import Link from 'next/link'
import { VideoBrowser } from '@/components/VideoBrowser'
import { FilmReel } from '@/components/FilmReel'
import { BlinkPaywall } from '@/components/BlinkPaywall'

export default function HomePage() {
  return (
    <>
      <FilmReel />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
      <section className="relative text-center py-8 sm:py-14 overflow-hidden">
        {/* venetian-blind light streaks */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, transparent 0 22px, #fff 22px 24px)',
            maskImage:
              'radial-gradient(60% 80% at 50% 0%, #000, transparent 75%)',
            WebkitMaskImage:
              'radial-gradient(60% 80% at 50% 0%, #000, transparent 75%)',
          }}
        />
        <p className="font-condensed uppercase tracking-[0.35em] text-xs text-[var(--color-btc)] mb-4">
          A curated screening
        </p>
        <h1 className="font-display font-black text-5xl sm:text-7xl leading-[0.95] tracking-tight">
          Bitcoin, <span className="italic text-[var(--color-btc)]">on screen</span>.
        </h1>
        <p className="mt-5 text-[var(--color-muted)] max-w-2xl mx-auto text-base sm:text-lg">
          <span className="text-[var(--color-text)] font-medium">bitcoin.mov</span>{' '}
          is a curated experience of Bitcoin on screen — the movies,
          documentaries, series and videos worth your time, brought together and
          arranged in order. Explore what{' '}
          <span className="text-[var(--color-text)] font-medium">bitcoin.mov</span>{' '}
          has collected so far, and add anything it’s still missing.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Link
            href="/submit"
            className="font-condensed uppercase tracking-widest text-sm px-6 py-3 rounded-md font-semibold bg-[var(--color-btc)] text-black hover:bg-[var(--color-amber)] transition-colors"
          >
            Submit a title
          </Link>
          <Link
            href="/about"
            className="font-condensed uppercase tracking-widest text-sm px-6 py-3 rounded-md font-medium border border-[var(--color-border-2)] text-[var(--color-text)] hover:border-[var(--color-muted)] transition-colors"
          >
            How it works
          </Link>
        </div>
      </section>

        <VideoBrowser />

        <BlinkPaywall />
      </div>
    </>
  )
}
