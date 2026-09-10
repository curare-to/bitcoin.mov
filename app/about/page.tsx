import type { Metadata } from 'next'
import Link from 'next/link'
import { READ_RELAYS } from '@/lib/nostr/relays'

export const metadata: Metadata = {
  title: 'About',
  description:
    'How bitcoin.mov works: a crowd-sourced list of Bitcoin on screen, built on Nostr kind 31888 events.',
}

export default function AboutPage() {
  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 leading-relaxed">
      <h1 className="font-display font-black text-4xl tracking-tight">
        How it works
      </h1>

      <p className="text-[var(--color-muted)]">
        <strong className="text-[var(--color-text)]">bitcoin.mov</strong> is a
        crowd-sourced directory of Bitcoin movies, documentaries and videos.
        There is no server and no database. Every entry is a message published to{' '}
        <a
          href="https://nostr.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-btc)] hover:underline"
        >
          Nostr
        </a>
        , a simple open protocol for censorship-resistant content.
      </p>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Kind 31888 events</h2>
        <p className="text-[var(--color-muted)]">
          Each submission is a Nostr event of{' '}
          <code className="text-[var(--color-text)]">kind 31888</code> — a custom
          <em> addressable</em> application kind this project defines. The event
          carries the title, year, type, links and a description in its
          tags and content. Because it's addressable, you can edit your own entry
          later: republishing with the same identifier replaces the old version.
          This site simply reads every kind 31888 event from a set of public
          relays and displays them. Nothing is centrally curated: the list you
          see is the network's.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Submitting</h2>
        <p className="text-[var(--color-muted)]">
          To add a title you need a Nostr signer — a browser extension such as{' '}
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-btc)] hover:underline"
          >
            Alby
          </a>{' '}
          or{' '}
          <a
            href="https://github.com/fiatjaf/nos2x"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-btc)] hover:underline"
          >
            nos2x
          </a>
          . The extension holds your keys and signs the event; this site never
          sees your private key. Browsing the list needs nothing at all.
        </p>
        <p>
          <Link
            href="/submit"
            className="text-[var(--color-btc)] hover:underline font-medium"
          >
            Submit a title →
          </Link>
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Relays we read</h2>
        <ul className="text-sm text-[var(--color-muted)] font-mono flex flex-col gap-1">
          {READ_RELAYS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </article>
  )
}
