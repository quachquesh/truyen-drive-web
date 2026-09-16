import { describe, expect, it } from 'vitest'

import type { StorySummary } from '../scanner'
import { sortStories } from '../storySort'

const stories: StorySummary[] = [
  { id: 'a', name: 'Truyện 10', modifiedTime: '2026-09-10T00:00:00.000Z' },
  { id: 'b', name: 'Truyện 2', modifiedTime: '2026-09-15T00:00:00.000Z' },
  { id: 'c', name: 'Truyện 1' }, // cache cũ — thiếu modifiedTime
  { id: 'd', name: 'Truyện 9', modifiedTime: '2026-09-12T00:00:00.000Z' },
]

describe('sortStories', () => {
  it("'name': sort tự nhiên (2 < 9 < 10)", () => {
    expect(sortStories(stories, 'name').map((story) => story.name)).toEqual([
      'Truyện 1',
      'Truyện 2',
      'Truyện 9',
      'Truyện 10',
    ])
  })

  it("'modified': mới nhất lên đầu", () => {
    expect(sortStories(stories, 'modified').map((story) => story.id)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('thiếu modifiedTime → xuống cuối (kể cả khi là mục đầu mảng gốc)', () => {
    const missing = [
      { id: 'x', name: 'X' },
      { id: 'y', name: 'Y', modifiedTime: '2020-01-01T00:00:00.000Z' },
    ]
    expect(sortStories(missing, 'modified').map((story) => story.id)).toEqual(['y', 'x'])
  })

  it("'modified': ưu tiên lastModified (ngày tính cả chap mới) hơn modifiedTime", () => {
    const list: StorySummary[] = [
      // Folder cũ 01/01 nhưng chap mới 16/09 → đứng trước
      { id: 'a', name: 'A', modifiedTime: '2026-01-01T00:00:00.000Z', lastModified: '2026-09-16T00:00:00.000Z' },
      { id: 'b', name: 'B', modifiedTime: '2026-09-10T00:00:00.000Z', lastModified: '2026-09-12T00:00:00.000Z' },
    ]
    expect(sortStories(list, 'modified').map((story) => story.id)).toEqual(['a', 'b'])
  })

  it('không đổi mảng gốc', () => {
    const original = [...stories]
    sortStories(stories, 'modified')
    expect(stories).toEqual(original)
  })
})
