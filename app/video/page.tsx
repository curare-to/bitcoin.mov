import { Suspense } from 'react'
import { VideoDetail } from '@/components/VideoDetail'

// useSearchParams() requires a Suspense boundary under static export.
export default function VideoPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Suspense
        fallback={
          <p className="text-[var(--color-muted)] py-16 text-center">Loading…</p>
        }
      >
        <VideoDetail />
      </Suspense>
    </div>
  )
}
