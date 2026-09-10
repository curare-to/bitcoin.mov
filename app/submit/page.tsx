import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SubmitForm } from '@/components/SubmitForm'

export const metadata: Metadata = {
  title: 'Submit a title',
  description:
    'Add a Bitcoin movie, documentary or video to bitcoin.mov. Published to Nostr as a kind 31888 event.',
}

export default function SubmitPage() {
  return (
    <div className="px-4 sm:px-6 py-8">
      <Suspense
        fallback={
          <p className="text-[var(--color-muted)] py-16 text-center">Loading…</p>
        }
      >
        <SubmitForm />
      </Suspense>
    </div>
  )
}
