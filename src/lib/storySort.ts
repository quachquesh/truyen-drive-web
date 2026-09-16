import type { StorySummary } from './scanner'
import { naturalSort } from './naturalSort'

export type StorySortMode = 'name' | 'modified'

/**
 * Sort danh sách truyện:
 * - 'name': A→Z theo sort tự nhiên ("2" < "10")
 * - 'modified': sửa đổi mới nhất lên đầu; truyện thiếu modifiedTime (cache cũ) xuống cuối
 */
export function sortStories(stories: StorySummary[], mode: StorySortMode): StorySummary[] {
  if (mode === 'name') return naturalSort(stories, (story) => story.name)

  const timeOf = (story: StorySummary): number => {
    const time = story.modifiedTime ? new Date(story.modifiedTime).getTime() : Number.NaN
    return Number.isNaN(time) ? 0 : time
  }
  return [...stories].sort((a, b) => timeOf(b) - timeOf(a))
}
