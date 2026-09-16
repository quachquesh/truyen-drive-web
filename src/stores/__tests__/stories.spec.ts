import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { ChapterRef, StorySummary } from '@/lib/scanner'
import { useLibraryStore } from '../library'
import { useStoriesStore } from '../stories'

// Mock Drive scan
const scanLibraryStories = vi.fn<(folderId: string) => Promise<StorySummary[]>>(async () => [
  { id: 'story-1', name: 'Truyện 1' },
  { id: 'story-2', name: 'Truyện 2' },
])
const scanStories = vi.fn<(stories: StorySummary[]) => Promise<Map<string, ChapterRef[]>>>(
  async (stories) => {
    const map = new Map<string, ChapterRef[]>()
    for (const story of stories) {
      map.set(story.id, [
        { id: `${story.id}-c1`, name: '1' },
        { id: `${story.id}-c2`, name: '2' },
        { id: `${story.id}-c10`, name: '10' },
      ])
    }
    return map
  },
)
const scanStory = vi.fn<
  (
    storyId: string,
    options?: { groupMarks?: Set<string>; onChapterFound?: (count: number) => void },
  ) => Promise<ChapterRef[]>
>(async (storyId) => {
  const results = await scanStories([{ id: storyId, name: '' }])
  return results.get(storyId) ?? []
})

vi.mock('@/lib/scanner', () => ({
  scanLibraryStories: (folderId: string) => scanLibraryStories(folderId),
  scanStories: (stories: StorySummary[]) => scanStories(stories),
  scanStory: (
    storyId: string,
    options?: { groupMarks?: Set<string>; onChapterFound?: (count: number) => void },
  ) => scanStory(storyId, options),
}))

// Mock IndexedDB — chapter cache luôn miss, folderTypes mirror bằng Map
const folderTypeStore = new Map<
  string,
  { folderId: string; type: 'story' | 'group'; markedAt: number }
>()
const clearChaptersCache = vi.fn<() => Promise<void>>(async () => undefined)
vi.mock('@/lib/db', () => ({
  getCache: vi.fn<() => Promise<undefined>>(async () => undefined),
  setCache: vi.fn<() => Promise<void>>(async () => undefined),
  clearChaptersCache: () => clearChaptersCache(),
  getFolderTypes: vi.fn<
    () => Promise<Array<{ folderId: string; type: 'story' | 'group'; markedAt: number }>>
  >(async () => [...folderTypeStore.values()]),
  putFolderType: vi.fn<
    (record: { folderId: string; type: 'story' | 'group'; markedAt: number }) => Promise<void>
  >(async (record) => {
    folderTypeStore.set(record.folderId, record)
  }),
  deleteFolderType: vi.fn<(folderId: string) => Promise<void>>(async (folderId) => {
    folderTypeStore.delete(folderId)
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  folderTypeStore.clear()
  setActivePinia(createPinia())
})

function setupLibrary() {
  const libraryStore = useLibraryStore()
  libraryStore.libraries = [
    { id: 'uuid-noi-bo', name: 'Kho chính', folderId: 'driveFolderId123', createdAt: 1 },
  ]
  return libraryStore
}

describe('storiesStore.openLibrary (không auto-detect)', () => {
  it('KHÔNG quét chapter folder nào khi chưa có đánh dấu', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanLibraryStories).toHaveBeenCalledWith('driveFolderId123')
    expect(scanStories).not.toHaveBeenCalled()
    expect(storiesStore.stories).toHaveLength(2)
    expect(storiesStore.marks['story-1']).toBeUndefined()
  })

  it('chỉ quét đúng các folder đã được user đánh dấu là truyện', async () => {
    setupLibrary()
    folderTypeStore.set('story-2', { folderId: 'story-2', type: 'story', markedAt: 1 })

    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanStories).toHaveBeenCalledTimes(1)
    expect(scanStories).toHaveBeenCalledWith([{ id: 'story-2', name: 'Truyện 2' }])
    expect(storiesStore.counts['story-2']).toBe(3)
    expect(storiesStore.latest['story-2']).toBe('10')
    expect(storiesStore.counts['story-1']).toBeUndefined()
  })

  it('dùng Drive folderId của kho, KHÔNG dùng UUID nội bộ (regression)', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanLibraryStories).toHaveBeenCalledWith('driveFolderId123')
    expect(scanLibraryStories).not.toHaveBeenCalledWith('uuid-noi-bo')
  })

  it('kho không tồn tại → báo lỗi, không gọi Drive', async () => {
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('id-khong-co')

    expect(scanLibraryStories).not.toHaveBeenCalled()
    expect(storiesStore.listError).toContain('Không tìm thấy kho')
    expect(storiesStore.listLoading).toBe(false)
  })
})

describe('storiesStore.markAsStory / unmarkStory / markAsGroup', () => {
  it('markAsStory lưu đánh dấu + trigger quét chapter', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsStory('story-1')
    expect(folderTypeStore.has('story-1')).toBe(true)
    expect(storiesStore.marks['story-1']).toBe('story')

    // ensureChapters → runScan → scanStory được gọi cho story-1
    await vi.waitFor(() => {
      expect(scanStory).toHaveBeenCalledWith('story-1', expect.anything())
    })
    await vi.waitFor(() => {
      expect(storiesStore.counts['story-1']).toBe(3)
    })
  })

  it('unmarkStory xóa đánh dấu, giữ lại để đánh dấu lại sau', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsStory('story-1')
    await storiesStore.unmarkStory('story-1')

    expect(folderTypeStore.has('story-1')).toBe(false)
    expect(storiesStore.marks['story-1']).toBeUndefined()
  })

  it('markAsGroup lưu type group + xóa cache chapter để quét lại', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsGroup('story-1-c1')
    expect(folderTypeStore.get('story-1-c1')?.type).toBe('group')
    expect(storiesStore.groups['story-1-c1']).toBe(true)
    expect(clearChaptersCache).toHaveBeenCalled()

    // quét lần sau truyền groupMarks
    await storiesStore.markAsStory('story-1')
    await vi.waitFor(() => {
      expect(scanStory).toHaveBeenCalled()
    })
    const calls = vi.mocked(scanStory).mock.calls
    const options = calls[calls.length - 1]?.[1]
    expect(options?.groupMarks).toBeInstanceOf(Set)
    expect(options?.groupMarks?.has('story-1-c1')).toBe(true)
  })
})
