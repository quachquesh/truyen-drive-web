import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import type { ChapterRef, StorySummary } from '@/lib/scanner'
import { useLibraryStore } from '../library'
import { useStoriesStore } from '../stories'

// Mock Drive scan
const scanLibraryStories = vi.fn<(folderId: string) => Promise<StorySummary[]>>(async () => [
  {
    id: 'story-1',
    name: 'Truyện 1',
    modifiedTime: '2026-09-15T08:00:00.000Z',
    lastModified: '2026-09-15T08:00:00.000Z',
  },
  {
    id: 'story-2',
    name: 'Truyện 2',
    modifiedTime: '2026-09-14T08:00:00.000Z',
    lastModified: '2026-09-16T08:00:00.000Z',
  },
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

// Mock IndexedDB — cache mirror bằng Map, folderTypes mirror bằng Map
const folderTypeStore = new Map<
  string,
  { folderId: string; type: 'story' | 'group' | 'list'; markedAt: number }
>()
const cacheStore = new Map<string, { key: string; data: unknown; fetchedAt: number }>()
const tombstoneStore = new Map<string, { key: string; deletedAt: number }>()
const clearChaptersCache = vi.fn<() => Promise<void>>(async () => undefined)
vi.mock('@/lib/db', () => ({
  getCache: vi.fn<
    (key: string) => Promise<{ key: string; data: unknown; fetchedAt: number } | undefined>
  >(async (key) => cacheStore.get(key)),
  setCache: vi.fn<(key: string, data: unknown) => Promise<void>>(async (key, data) => {
    cacheStore.set(key, { key, data, fetchedAt: Date.now() })
  }),
  clearChaptersCache: () => clearChaptersCache(),
  getFolderTypes: vi.fn<
    () => Promise<Array<{ folderId: string; type: 'story' | 'group' | 'list'; markedAt: number }>>
  >(async () => [...folderTypeStore.values()]),
  putFolderType: vi.fn<
    (
      record: { folderId: string; type: 'story' | 'group' | 'list'; markedAt: number },
    ) => Promise<void>
  >(async (record) => {
    folderTypeStore.set(record.folderId, record)
  }),
  deleteFolderType: vi.fn<(folderId: string) => Promise<void>>(async (folderId) => {
    folderTypeStore.delete(folderId)
  }),
  putTombstone: vi.fn<(key: string, deletedAt: number) => Promise<void>>(async (key, deletedAt) => {
    tombstoneStore.set(key, { key, deletedAt })
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  folderTypeStore.clear()
  cacheStore.clear()
  tombstoneStore.clear()
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
    expect(scanStories).toHaveBeenCalledWith([
      {
        id: 'story-2',
        name: 'Truyện 2',
        modifiedTime: '2026-09-14T08:00:00.000Z',
        lastModified: '2026-09-16T08:00:00.000Z',
      },
    ])
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

  it('cache cũ thiếu lastModified (viết trước bản có) → tự lấy lại danh sách (self-heal)', async () => {
    setupLibrary()
    // Cache thực tế của bản cũ: có modifiedTime nhưng chưa có lastModified
    cacheStore.set('stories:uuid-noi-bo', {
      key: 'stories:uuid-noi-bo',
      data: [{ id: 'story-1', name: 'Truyện 1', modifiedTime: '2026-09-15T08:00:00.000Z' }],
      fetchedAt: 1,
    })
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanLibraryStories).toHaveBeenCalledTimes(1)
    expect(storiesStore.stories.every((story) => story.lastModified !== undefined)).toBe(true)
  })

  it('cache đã đủ modifiedTime/lastModified → KHÔNG gọi lại Drive', async () => {
    setupLibrary()
    cacheStore.set('stories:uuid-noi-bo', {
      key: 'stories:uuid-noi-bo',
      data: [
        {
          id: 'story-1',
          name: 'Truyện 1',
          modifiedTime: '2026-09-15T08:00:00.000Z',
          lastModified: '2026-09-15T08:00:00.000Z',
        },
      ],
      fetchedAt: Date.now(),
    })
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanLibraryStories).not.toHaveBeenCalled()
    expect(storiesStore.stories).toHaveLength(1)
  })
})

describe('storiesStore.markAsStory / unmarkStory / markAsGroup / markAsList', () => {
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

  it('markAsList lưu type list, KHÔNG xóa cache chapter (không ảnh hưởng quét)', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsList('drop-truyen')
    expect(folderTypeStore.get('drop-truyen')?.type).toBe('list')
    expect(storiesStore.lists['drop-truyen']).toBe(true)
    expect(storiesStore.groups['drop-truyen']).toBeUndefined()
    expect(clearChaptersCache).not.toHaveBeenCalled()

    // quét truyện KHÔNG truyền folder đánh dấu list vào groupMarks
    await storiesStore.markAsStory('story-1')
    await vi.waitFor(() => {
      expect(scanStory).toHaveBeenCalled()
    })
    const calls = vi.mocked(scanStory).mock.calls
    const options = calls[calls.length - 1]?.[1]
    expect(options?.groupMarks?.has('drop-truyen')).toBe(false)
  })

  it('unmarkList xóa đánh dấu list + ghi tombstone', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsList('drop-truyen')
    await storiesStore.unmarkList('drop-truyen')

    expect(folderTypeStore.has('drop-truyen')).toBe(false)
    expect(storiesStore.lists['drop-truyen']).toBeUndefined()
    expect([...tombstoneStore.keys()]).toContain('mark:drop-truyen')
  })

  it('markAsStory ghi đè đánh dấu cũ → dọn groups/lists stale trong memory', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    await storiesStore.markAsGroup('story-1')
    await storiesStore.markAsStory('story-1')
    expect(folderTypeStore.get('story-1')?.type).toBe('story')
    expect(storiesStore.marks['story-1']).toBe('story')
    expect(storiesStore.groups['story-1']).toBeUndefined()
  })

  it('loadMarks tách đúng 3 loại story / group / list', async () => {
    setupLibrary()
    folderTypeStore.set('story-1', { folderId: 'story-1', type: 'story', markedAt: 1 })
    folderTypeStore.set('story-1-c1', { folderId: 'story-1-c1', type: 'group', markedAt: 2 })
    folderTypeStore.set('drop-truyen', { folderId: 'drop-truyen', type: 'list', markedAt: 3 })

    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(storiesStore.marks['story-1']).toBe('story')
    expect(storiesStore.groups['story-1-c1']).toBe(true)
    expect(storiesStore.lists['drop-truyen']).toBe(true)
  })
})
