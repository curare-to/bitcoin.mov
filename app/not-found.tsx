import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="text-center px-4 py-24 flex flex-col gap-3">
      <div className="text-5xl">🎞️</div>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-[var(--color-muted)]">
        That screen doesn’t exist.
      </p>
      <Link href="/" className="text-[var(--color-btc)] hover:underline">
        ← Back to all titles
      </Link>
    </div>
  )
}
