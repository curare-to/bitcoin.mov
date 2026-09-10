import type { VideoType } from '@/lib/nostr/schema'

/** "1h 42m" / "48m" from a seconds count. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Relative time like "3 days ago" from unix seconds. */
export function timeAgo(unixSeconds: number, nowMs = Date.now()): string {
  const diffSec = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds)
  const units: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [30, 'day'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = diffSec
  let unit = 'second'
  for (const [size, name] of units) {
    if (value < size) {
      unit = name
      break
    }
    value = Math.floor(value / size)
    unit = name
  }
  if (unit === 'second' && value < 30) return 'just now'
  const rounded = Math.max(1, value)
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`
}

const TYPE_LABELS: Record<VideoType, string> = {
  movie: 'Movie',
  documentary: 'Documentary',
  short: 'Short',
  interview: 'Interview',
  series: 'Series',
  other: 'Video',
}

export function typeLabel(type: VideoType): string {
  return TYPE_LABELS[type] ?? 'Video'
}

/** Truncated npub-ish display of a pubkey (we avoid a bech32 dep for now). */
export function shortPubkey(pubkey: string): string {
  if (pubkey.length <= 12) return pubkey
  return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`
}

/**
 * Whether a thumbnail should render landscape (16:9) rather than portrait
 * (2:3). YouTube stills are landscape video frames; poster art is portrait.
 */
export function isLandscapeThumb(url: string | null): boolean {
  if (!url) return false
  return url.includes('youtube.com/vi/') || url.includes('ytimg.com')
}

/** Hostname of a URL for compact link labels, e.g. "youtube.com". */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
