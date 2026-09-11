import type { Metadata } from 'next'
import Link from 'next/link'
import { SuggestionList } from '@/components/SuggestionList'

export const metadata: Metadata = {
  title: 'Suggestions',
  description:
    'Every title suggested to bitcoin.mov, newest first — who suggested it, and whether the curator has taken it up.',
}

export default function SuggestionsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="font-display font-black text-4xl tracking-tight">
          Suggestions
        </h1>
        <Link
          href="/submit"
          className="shrink-0 mt-1 px-4 py-2 rounded-xl bg-[var(--color-btc)] text-black text-sm font-medium hover:bg-[var(--color-btc-dark)] transition-colors"
        >
          Suggest a title
        </Link>
      </div>
      <p className="text-[var(--color-muted)] mb-6">
        Every title anyone has suggested, newest first — one row per event,
        rather than the home page’s one row per film. Worth a look before you
        add something: if it’s already there, you can still publish your own
        take on it.
      </p>

      <SuggestionList />
    </div>
  )
}
