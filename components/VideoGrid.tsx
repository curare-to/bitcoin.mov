import { VideoCard } from './VideoCard'
import type { FilmGroup } from '@/lib/util/dedup'

export function VideoGrid({ groups }: { groups: FilmGroup[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {groups.map((group) => (
        <VideoCard key={group.key} group={group} />
      ))}
    </div>
  )
}
