import type { Metadata } from 'next'
import { Playfair_Display, Oswald } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['700', '900'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-oswald',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://bitcoin.mov'),
  title: {
    default: 'bitcoin.mov — a crowd-sourced guide to Bitcoin on screen',
    template: '%s · bitcoin.mov',
  },
  description:
    'A crowd-sourced, censorship-resistant directory of Bitcoin movies, documentaries and videos. Built on Nostr — anyone can submit.',
  openGraph: {
    title: 'bitcoin.mov',
    description:
      'A crowd-sourced directory of Bitcoin movies and documentaries, powered by Nostr.',
    url: 'https://bitcoin.mov',
    siteName: 'bitcoin.mov',
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: 'bitcoin.mov' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${oswald.variable}`}
    >
      <body className="min-h-dvh flex flex-col">
        <SiteHeader />
        <main className="flex-1 w-full">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
