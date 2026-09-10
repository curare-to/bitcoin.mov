import Link from 'next/link'
import { Poster } from './ui/Poster'
import { formatDuration, typeLabel, isLandscapeThumb } from '@/lib/util/format'
import type { FilmGroup } from '@/lib/util/dedup'

export function VideoCard({ group }: { group: FilmGroup }) {
  const v = group.primary
  const duration = formatDuration(v.durationSeconds)
  const extraSubmissions = group.submissions.length - 1
  const landscape = isLandscapeThumb(v.image)

  return (
    <Link
      href={`/video?id=${encodeURIComponent(v.id)}`}
      className="group flex flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden hover:border-[var(--color-btc)]/70 hover:-translate-y-1 hover:shadow-[0_10px_30px_-10px_#000] transition-all duration-200"
    >
      <div className="relative">
        <Poster
          src={v.image}
          alt={v.title}
          className={landscape ? 'aspect-[16/9]' : 'aspect-[2/3]'}
          imgClassName="poster-img"
        />
        <div className="absolute top-2 left-2 font-condensed uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded-[2px] bg-black/75 text-[var(--color-amber)]">
          {typeLabel(v.type)}
        </div>
        {v.year && (
          <div className="absolute top-2 right-2 font-condensed text-[10px] px-1.5 py-0.5 rounded-[2px] bg-black/75 text-[var(--color-text)]">
            {v.year}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-3.5 flex-1">
        <h3 className="font-condensed uppercase tracking-wide text-[15px] leading-tight line-clamp-2 group-hover:text-[var(--color-btc)] transition-colors">
          {v.title}
        </h3>

        <div className="flex items-center gap-2 font-condensed text-[11px] text-[var(--color-muted)]">
          {v.director && <span className="line-clamp-1">{v.director}</span>}
          {duration && <span className="shrink-0">· {duration}</span>}
        </div>

        {v.description && (
          <p className="text-sm text-[var(--color-muted)] line-clamp-3 mt-auto pt-1">
            {v.description}
          </p>
        )}

        {extraSubmissions > 0 && (
          <p className="font-condensed text-[11px] text-[var(--color-btc-dim)] mt-1">
            +{extraSubmissions} more submission
            {extraSubmissions === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </Link>
  )
}
