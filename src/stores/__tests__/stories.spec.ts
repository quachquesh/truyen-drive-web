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
      // Chapter mang ngày của truyện → cache sau khi quét là "fresh" so với lastModified
      const modifiedTime = story.lastModified ?? story.modifiedTime
      map.set(story.id, [
        { id: `${story.id}-c1`, name: '1', modifiedTime },
        { id: `${story.id}-c2`, name: '2', modifiedTime },
        { id: `${story.id}-c10`, name: '10', modifiedTime },
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

vi.mock('@/lib/scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scanner')>()
  return {
    ...actual,
    scanLibraryStories: (folderId: string) => scanLibraryStories(folderId),
    scanStories: (stories: StorySummary[]) => scanStories(stories),
    scanStory: (
      storyId: string,
      options?: { groupMarks?: Set<string>; onChapterFound?: (count: number) => void },
    ) => scanStory(storyId, options),
  }
})

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

  it('lastModified mới hơn chapter trong cache → quét lại chapter, cập nhật counts', async () => {
    setupLibrary()
    folderTypeStore.set('story-2', { folderId: 'story-2', type: 'story', markedAt: 1 })
    // Cache cũ: chapter mới nhất 14/09, nhưng owner vừa thêm chap → lastModified 16/09
    cacheStore.set('chapters:story-2', {
      key: 'chapters:story-2',
      data: [
        { id: 'story-2-c1', name: '1', modifiedTime: '2026-09-14T08:00:00.000Z' },
        { id: 'story-2-c2', name: '2', modifiedTime: '2026-09-14T08:00:00.000Z' },
      ],
      fetchedAt: 1,
    })

    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanStories).toHaveBeenCalledTimes(1)
    expect(storiesStore.counts['story-2']).toBe(3)
    expect(storiesStore.latest['story-2']).toBe('10')

    // Cache đã được ghi đè bằng kết quả quét mới → mở lại KHÔNG quét tiếp
    await storiesStore.openLibrary('uuid-noi-bo')
    expect(scanStories).toHaveBeenCalledTimes(1)
  })

  it('cache chapter đã mới bằng lastModified → KHÔNG quét lại', async () => {
    setupLibrary()
    folderTypeStore.set('story-2', { folderId: 'story-2', type: 'story', markedAt: 1 })
    cacheStore.set('chapters:story-2', {
      key: 'chapters:story-2',
      data: [
        { id: 'story-2-c1', name: '1', modifiedTime: '2026-09-16T08:00:00.000Z' },
        { id: 'story-2-c2', name: '2', modifiedTime: '2026-09-16T08:00:00.000Z' },
      ],
      fetchedAt: 1,
    })

    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')

    expect(scanStories).not.toHaveBeenCalled()
    expect(storiesStore.counts['story-2']).toBe(2)
    expect(storiesStore.latest['story-2']).toBe('2')
  })
})

describe('storiesStore.ensureChapters (nút Làm mới)', () => {
  it('force: true bypass cache hoàn chỉnh — vẫn quét lại từ Drive', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    cacheStore.set('chapters:story-1', {
      key: 'chapters:story-1',
      data: [{ id: 'story-1-c1', name: '1', modifiedTime: '2026-09-15T08:00:00.000Z' }],
      fetchedAt: 1,
    })

    const chapters = await storiesStore.ensureChapters('uuid-noi-bo', 'story-1', { force: true })

    expect(scanStory).toHaveBeenCalledWith('story-1', expect.anything())
    // Dữ liệu mới từ scanStory, không phải 1 chapter của cache cũ
    expect(chapters).toHaveLength(3)
  })
})

describe('storiesStore.refreshMarkedChapters (folder con đã đánh dấu — FolderPage)', () => {
  async function setupMarkedStory(): Promise<ReturnType<typeof useStoriesStore>> {
    const storiesStore = useStoriesStore()
    folderTypeStore.set('story-9', { folderId: 'story-9', type: 'story', markedAt: 1 })
    await storiesStore.loadMarks()
    return storiesStore
  }

  it('lastModified mới hơn cache → quét lại + cập nhật counts/latest', async () => {
    const storiesStore = await setupMarkedStory()
    cacheStore.set('chapters:story-9', {
      key: 'chapters:story-9',
      data: [{ id: 'story-9-c1', name: '1', modifiedTime: '2026-09-14T08:00:00.000Z' }],
      fetchedAt: 1,
    })

    // FolderPage truyền folder con kèm lastModified tươi (annotateLastModified vừa tính)
    await storiesStore.refreshMarkedChapters(
      [
        {
          id: 'story-9',
          name: 'Truyện 9',
          modifiedTime: '2026-09-14T08:00:00.000Z',
          lastModified: '2026-09-16T08:00:00.000Z',
        },
      ],
      storiesStore.gen,
    )

    expect(scanStories).toHaveBeenCalledTimes(1)
    expect(storiesStore.counts['story-9']).toBe(3)
    expect(storiesStore.latest['story-9']).toBe('10')
  })

  it('cache đã tươi → điền counts/latest từ cache, KHÔNG quét lại', async () => {
    const storiesStore = await setupMarkedStory()
    cacheStore.set('chapters:story-9', {
      key: 'chapters:story-9',
      data: [
        { id: 'story-9-c1', name: '1', modifiedTime: '2026-09-16T08:00:00.000Z' },
        { id: 'story-9-c2', name: '2', modifiedTime: '2026-09-16T08:00:00.000Z' },
      ],
      fetchedAt: 1,
    })

    await storiesStore.refreshMarkedChapters(
      [
        {
          id: 'story-9',
          name: 'Truyện 9',
          modifiedTime: '2026-09-14T08:00:00.000Z',
          lastModified: '2026-09-16T08:00:00.000Z',
        },
      ],
      storiesStore.gen,
    )

    expect(scanStories).not.toHaveBeenCalled()
    expect(storiesStore.counts['story-9']).toBe(2)
    expect(storiesStore.latest['story-9']).toBe('2')
  })

  it('folder chưa đánh dấu truyện → bỏ qua, không đọc cache', async () => {
    const storiesStore = await setupMarkedStory()

    await storiesStore.refreshMarkedChapters(
      [{ id: 'folder-thuong', name: 'Folder thường', modifiedTime: '2026-09-16T08:00:00.000Z' }],
      storiesStore.gen,
    )

    expect(scanStories).not.toHaveBeenCalled()
    expect(storiesStore.counts['folder-thuong']).toBeUndefined()
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

  it('markAsStory khi đã có cache cũ (đánh dấu lại sau khi bỏ) → quét TƯƠI ghi đè snapshot', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    await storiesStore.openLibrary('uuid-noi-bo')
    cacheStore.set('chapters:story-1', {
      key: 'chapters:story-1',
      data: [{ id: 'story-1-c1', name: '1', modifiedTime: '2026-09-15T08:00:00.000Z' }],
      fetchedAt: 1,
    })

    await storiesStore.markAsStory('story-1')

    // Không được đọc cache cũ — phải quét lại từ Drive
    await vi.waitFor(() => {
      expect(scanStory).toHaveBeenCalledWith('story-1', expect.anything())
    })
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

  it('đánh dấu nhóm GIỮA CHỪNG quét batch → kết quả quét cũ không ghi đè cache/counts', async () => {
    const storiesStore = useStoriesStore()
    folderTypeStore.set('story-2', { folderId: 'story-2', type: 'story', markedAt: 1 })
    await storiesStore.loadMarks()
    // Cache cũ: 2 chapter (chuẩn bị bị thay bằng list 3-chapter tính theo groupMarks cũ)
    cacheStore.set('chapters:story-2', {
      key: 'chapters:story-2',
      data: [
        { id: 'story-2-c1', name: '1', modifiedTime: '2026-09-14T08:00:00.000Z' },
        { id: 'story-2-c2', name: '2', modifiedTime: '2026-09-14T08:00:00.000Z' },
      ],
      fetchedAt: 1,
    })

    // Quét batch bắt đầu với groupMarks CHƯA có nhóm mới — treo kết quả lại
    let resolveScan!: (map: Map<string, ChapterRef[]>) => void
    scanStories.mockImplementationOnce(
      () => new Promise<Map<string, ChapterRef[]>>((resolve) => (resolveScan = resolve)),
    )
    const refresh = storiesStore.refreshMarkedChapters(
      [
        {
          id: 'story-2',
          name: 'Truyện 2',
          modifiedTime: '2026-09-14T08:00:00.000Z',
          lastModified: '2026-09-16T08:00:00.000Z',
        },
      ],
      storiesStore.gen,
    )
    await vi.waitFor(() => {
      expect(scanStories).toHaveBeenCalledTimes(1)
    })

    // User đánh dấu nhóm trong lúc quét cũ còn chạy → quét cũ bị vô hiệu hóa
    await storiesStore.markAsGroup('story-2-c1')

    resolveScan(
      new Map<string, ChapterRef[]>([
        [
          'story-2',
          [
            { id: 'story-2-c1', name: '1-10', modifiedTime: '2026-09-16T08:00:00.000Z' },
            { id: 'story-2-c2', name: '11', modifiedTime: '2026-09-16T08:00:00.000Z' },
            { id: 'story-2-c3', name: '12', modifiedTime: '2026-09-16T08:00:00.000Z' },
          ],
        ],
      ]),
    )
    await refresh

    // Danh sách 3-chapter tính theo groupMarks cũ bị vứt — cache/counts giữ nguyên
    const cached = cacheStore.get('chapters:story-2')?.data as ChapterRef[] | undefined
    expect(cached?.map((chapter) => chapter.name)).toEqual(['1', '2'])
    expect(storiesStore.counts['story-2']).toBeUndefined()
    expect(storiesStore.latest['story-2']).toBeUndefined()
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
