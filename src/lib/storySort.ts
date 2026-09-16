import type { StorySummary } from './scanner'
import { naturalSort } from './naturalSort'

export type StorySortMode = 'name' | 'modified'

/**
 * Sort danh sách truyện:
 * - 'name': A→Z theo sort tự nhiên ("2" < "10")
 * - 'modified': cập nhật mới nhất lên đầu (ưu tiên lastModified — ngày tính cả
 *   chap mới); truyện thiếu ngày (cache cũ) xuống cuối
 */
export function sortStories(stories: StorySummary[], mode: StorySortMode): StorySummary[] {
  if (mode === 'name') return naturalSort(stories, (story) => story.name)

  const timeOf = (story: StorySummary): number => {
    const iso = story.lastModified ?? story.modifiedTime
    const time = iso ? new Date(iso).getTime() : Number.NaN
    return Number.isNaN(time) ? 0 : time
  }
  return [...stories].sort((a, b) => timeOf(b) - timeOf(a))
}
