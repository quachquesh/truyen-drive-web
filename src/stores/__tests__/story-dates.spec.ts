import { beforeEach, describe, expect, it, vi } from 'vitest'
import { watchEffect } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import type { DriveItem } from '@/lib/driveApi'
import type { StorySummary } from '@/lib/scanner'
import { useLibraryStore } from '../library'
import { useStoriesStore } from '../stories'

/**
 * Integration test: scanner THẬT + store THẬT, chỉ mock Drive + IndexedDB.
 * Bắt regression "Ngày cập nhật sai sau khi đánh dấu nhóm":
 * lastModified phải được tính lại từ danh sách chapter hiện có mỗi khi
 * chapter list được (re)quét/merge — không chỉ từ walk cold.
 *
 * Ngữ nghĩa ngày (theo thiết kế): lastModified = max(modifiedTime CÁC
 * CHAPTER hiện có) — BỎ modifiedTime folder truyện (đổi tên/đổi quyền chỉ
 * là nhiễu metadata của folder, không phải cập nhật nội dung).
 */

// Mock Drive: map folderId → con (folder + file)
const folders: Record<string, DriveItem[]> = {
  // Kho: 1 truyện "Truyện A"
  'driveFolderId123': [folder('S', 'Truyện A', '2026-09-01T00:00:00.000Z')],
  // Truyện A: nhóm "0-80" (chưa đánh dấu) + chapter trực tiếp "Chap 81"
  S: [
    folder('G', '0-80', '2026-09-10T00:00:00.000Z'),
    folder('C81', 'Chap 81', '2026-09-12T00:00:00.000Z'),
  ],
  // Trong nhóm: chap cũ + Chap 80 up 20/09 (mới nhất — Drive KHÔNG bump folder "0-80")
  G: [
    folder('C1', 'Chap 1', '2026-08-01T00:00:00.000Z'),
    folder('C80', 'Chap 80', '2026-09-20T00:00:00.000Z'),
  ],
  C1: [file('1.jpg', 'image/jpeg')],
  C80: [file('80.jpg', 'image/jpeg')],
  C81: [file('81.jpg', 'image/jpeg')],
}

function folder(id: string, name: string, modifiedTime?: string): DriveItem {
  return {
    id,
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(modifiedTime ? { modifiedTime } : {}),
  }
}

function file(name: string, mimeType: string): DriveItem {
  return { id: `file-${name}`, name, mimeType }
}

const isFolderItem = (item: DriveItem): boolean =>
  item.mimeType === 'application/vnd.google-apps.folder'

vi.mock('@/lib/driveApi', () => ({
  DRIVE_CONCURRENCY: 3,
  // Không có token trong test → schedulePush trả về ngay, không tạo timer
  apiHasToken: () => false,
  downloadSyncFile: () => Promise.reject(new Error('không dùng trong test')),
  findSyncFile: () => Promise.reject(new Error('không dùng trong test')),
  uploadSyncFile: () => Promise.reject(new Error('không dùng trong test')),
  toErrorMessage: (e: unknown) => String(e),
  getFileMeta: () => Promise.reject(new Error('không dùng trong test')),
  listChildren: vi.fn<(folderId: string) => Promise<DriveItem[]>>(
    async (folderId) => structuredClone(folders[folderId] ?? []),
  ),
  listChildrenGrouped: vi.fn<
    (parentIds: string[], options?: { foldersOnly?: boolean }) => Promise<Map<string, DriveItem[]>>
  >(async (parentIds, options) => {
    const map = new Map<string, DriveItem[]>()
    for (const id of parentIds) {
      const children = structuredClone(folders[id] ?? [])
      map.set(id, options?.foldersOnly ? children.filter(isFolderItem) : children)
    }
    return map
  }),
  listNewChildren: vi.fn<
    (
      parentIds: string[],
      sinceIso: string,
      options?: { foldersOnly?: boolean },
    ) => Promise<Map<string, DriveItem[]>>
  >(async (parentIds, sinceIso, options) => {
    const map = new Map<string, DriveItem[]>()
    const since = new Date(sinceIso).getTime()
    for (const id of parentIds) {
      const children = (folders[id] ?? [])
        .filter((item) => (options?.foldersOnly ? isFolderItem(item) : true))
        .filter((item) => item.modifiedTime && new Date(item.modifiedTime).getTime() > since)
      if (children.length > 0) map.set(id, structuredClone(children))
    }
    return map
  }),
}))

// Mock IndexedDB — mirror shape thật {key, data, fetchedAt}
const cacheStore = new Map<string, { key: string; data: unknown; fetchedAt: number }>()
const folderTypeStore = new Map<
  string,
  { folderId: string; type: 'story' | 'group' | 'list'; markedAt: number }
>()
const tombstoneStore = new Map<string, { key: string; deletedAt: number }>()

/** Mirror logic thật: cache nhắc tới folder trong chapters/groups → owner là truyện đó. */
vi.mock('@/lib/db', () => ({
  getCache: async (key: string) => cacheStore.get(key),
  setCache: async (key: string, data: unknown) => {
    // structured clone như IndexedDB thật — bắt regression ghi reactive proxy
    cacheStore.set(key, { key, data: structuredClone(data), fetchedAt: Date.now() })
  },
  getFolderTypes: async () => [...folderTypeStore.values()],
  putFolderType: async (record: { folderId: string }) => {
    folderTypeStore.set(record.folderId, record as never)
  },
  deleteFolderType: async (folderId: string) => {
    folderTypeStore.delete(folderId)
  },
  putTombstone: async (key: string, deletedAt: number) => {
    tombstoneStore.set(key, { key, deletedAt })
  },
  findChaptersCacheOwners: async (folderIds: string[]) => {
    const wanted = new Set(folderIds)
    const owners = new Set<string>()
    for (const [key, record] of cacheStore) {
      if (!key.startsWith('chapters:')) continue
      const parsed = record.data as {
        chapters?: Array<{ id: string }>
        groups?: Array<{ id: string }>
      }
      const chapters = Array.isArray(parsed?.chapters) ? parsed.chapters : []
      const groups = Array.isArray(parsed?.groups) ? parsed.groups : []
      if (chapters.some((c) => wanted.has(c.id)) || groups.some((g) => wanted.has(g.id))) {
        owners.add(key.slice('chapters:'.length))
      }
    }
    return owners
  },
  deleteChaptersCaches: async (storyIds: string[]) => {
    for (const storyId of storyIds) cacheStore.delete(`chapters:${storyId}`)
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  cacheStore.clear()
  folderTypeStore.clear()
  tombstoneStore.clear()
  // Reset fixture về trạng thái gốc (test trước có thể thêm Chap 90 / đổi tên)
  folders.G = [
    folder('C1', 'Chap 1', '2026-08-01T00:00:00.000Z'),
    folder('C80', 'Chap 80', '2026-09-20T00:00:00.000Z'),
  ]
  folders.S = [
    folder('G', '0-80', '2026-09-10T00:00:00.000Z'),
    folder('C81', 'Chap 81', '2026-09-12T00:00:00.000Z'),
  ]
  folders['driveFolderId123'] = [folder('S', 'Truyện A', '2026-09-01T00:00:00.000Z')]
  setActivePinia(createPinia())
})

function setupLibrary() {
  const libraryStore = useLibraryStore()
  libraryStore.libraries = [
    { id: 'lib-uuid', name: 'Kho chính', folderId: 'driveFolderId123', createdAt: 1 },
  ]
  return libraryStore
}

/** Giả lập computed của StoryCard — theo dõi lastModified qua reactive */
function watchStoryDate(storiesStore: ReturnType<typeof useStoriesStore>) {
  const seen = { lastModified: undefined as string | undefined }
  const stop = watchEffect(
    () => {
      seen.lastModified = storiesStore.stories.find((item) => item.id === 'S')?.lastModified
    },
    { flush: 'sync' },
  )
  return { seen, stop }
}

/** Đi tới trạng thái "user vừa đánh dấu nhóm trong StoryPage": cold mở + markAsGroup + quét lại */
async function setupStoryWithGroup(storiesStore: ReturnType<typeof useStoriesStore>) {
  folderTypeStore.set('S', { folderId: 'S', type: 'story', markedAt: 1 })
  await storiesStore.openLibrary('lib-uuid')
  await storiesStore.markAsGroup('G', 'S')
  await storiesStore.ensureChapters('lib-uuid', 'S', { force: true })
}

describe('Ngày cập nhật truyện qua các action (integration — scanner thật)', () => {
  it('cold mở trang: ngày = max(folder, con trực tiếp) — chưa thấy trong nhóm', async () => {
    setupLibrary()
    folderTypeStore.set('S', { folderId: 'S', type: 'story', markedAt: 1 })
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await storiesStore.openLibrary('lib-uuid')

    // Walk thấy folder 1/9 + "0-80" 10/9 + "Chap 81" 12/9 → 12/9 (Chap 80 20/9 còn khuất)
    expect(seen.lastModified).toBe('2026-09-12T00:00:00.000Z')
    expect(storiesStore.counts['S']).toBe(2) // "0-80" và "Chap 81" đều là chapter
    stop()
  })

  it('đánh dấu nhóm → quét lại → ngày nhảy theo chap mới nhất trong nhóm (bug chính)', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await setupStoryWithGroup(storiesStore)

    // Chap 80 (20/9) được đưa lên làm chapter → ngày cập nhật = 20/9,
    // KHÔNG kẹt 12/9 như trước, và KHÔNG pha modifiedTime folder (1/9)
    expect(seen.lastModified).toBe('2026-09-20T00:00:00.000Z')
    expect(storiesStore.counts['S']).toBe(3)
    expect(storiesStore.latest['S']).toBe('Chap 81')
    stop()
  })

  it('quay về Library (warm) → ngày đúng từ chapters cache, 0 request thêm', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await setupStoryWithGroup(storiesStore)
    await storiesStore.openLibrary('lib-uuid')

    // Warm phục hồi 12/9 từ stories cache → phải tính lại từ chapters cache thành 20/9
    expect(seen.lastModified).toBe('2026-09-20T00:00:00.000Z')
    expect(storiesStore.counts['S']).toBe(3)
    // Không request nào ngoài các request scan/merge — warm giữ nguyên 0 request
    const newChildren = await vi.mocked(
      (await import('@/lib/driveApi')).listNewChildren,
    ).mock.calls
    // listNewChildren không chạy lần nào trong warm (chỉ chạy khi Làm mới/incremental)
    expect(newChildren.length).toBe(0)
    stop()
  })

  it('chủ kho thêm chap TRONG nhóm → Làm mới phát hiện (Drive không bump folder nhóm)', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await setupStoryWithGroup(storiesStore)
    // Owner up Chap 90 (26/9) vào trong nhóm — folder "0-80" KHÔNG bị Drive bump
    folders.G!.push(folder('C90', 'Chap 90', '2026-09-26T00:00:00.000Z'))

    await storiesStore.openLibrary('lib-uuid', { force: true })

    expect(seen.lastModified).toBe('2026-09-26T00:00:00.000Z')
    expect(storiesStore.counts['S']).toBe(4)
    expect(storiesStore.latest['S']).toBe('Chap 90')
    // Ngày mới được persist vào stories cache (lần warm sau khỏi tính lại)
    const record = cacheStore.get('stories:lib-uuid')
    const cached = (record?.data as StorySummary[] | undefined)?.find(
      (item) => item.id === 'S',
    )
    expect(cached?.lastModified).toBe('2026-09-26T00:00:00.000Z')
    stop()
  })

  it('owner đổi TÊN truyện (bump modifiedTime folder) → ngày KHÔNG nhảy — nhiễu metadata', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await setupStoryWithGroup(storiesStore)
    // Đổi tên folder truyện → Drive bump modifiedTime của chính folder truyện
    folders['driveFolderId123'] = [
      folder('S', 'Truyện A (đổi tên)', '2026-09-25T00:00:00.000Z'),
    ]

    await storiesStore.openLibrary('lib-uuid', { force: true })

    // Đổi tên không phải cập nhật nội dung → ngày giữ 20/9 theo chapter
    expect(seen.lastModified).toBe('2026-09-20T00:00:00.000Z')
    stop()
  })

  it('chap mới TRỰC TIẾP (không nhóm) → Làm mới vẫn phát hiện như cũ', async () => {
    setupLibrary()
    const storiesStore = useStoriesStore()
    const { seen, stop } = watchStoryDate(storiesStore)

    await setupStoryWithGroup(storiesStore)
    // Owner up Chap 82 (27/9) trực tiếp trong truyện
    folders.S!.push(folder('C82', 'Chap 82', '2026-09-27T00:00:00.000Z'))

    await storiesStore.openLibrary('lib-uuid', { force: true })

    expect(seen.lastModified).toBe('2026-09-27T00:00:00.000Z')
    expect(storiesStore.counts['S']).toBe(4)
    stop()
  })

  it('NHÓM LỒNG NHAU + trộn tên "CHAP x"/số thuần: đánh dấu 1-60 rồi 1-5 → 61 là mới nhất (bug thật)', async () => {
    setupLibrary()
    // Cây đúng theo bug report — chapter trong nhóm "1-5" tên "CHAP 1..5"
    // (không phải số thuần), ngoài nhóm là "6..61":
    // S ─┬─ G1 "1-60" ─┬─ G2 "1-5" ─ CHAP 1, CHAP 2, CHAP 5 (7/12/2019)
    //   │             └─ 6 (4/4/2025) … 60 (31/5/2025)
    //   └─ "61" (12/7/2025)
    folders.S = [
      folder('G1', '1-60', '2026-08-31T00:00:00.000Z'),
      folder('C61', '61', '2026-07-12T00:00:00.000Z'),
    ]
    folders.G1 = [
      folder('G2', '1-5', '2020-03-04T00:00:00.000Z'),
      folder('C6', '6', '2025-04-04T00:00:00.000Z'),
      folder('C60', '60', '2025-05-31T00:00:00.000Z'),
    ]
    folders.G2 = [
      folder('C1', 'CHAP 1', '2019-12-07T00:00:00.000Z'),
      folder('C2', 'CHAP 2', '2019-12-07T00:00:00.000Z'),
      folder('C5', 'CHAP 5', '2019-12-07T00:00:00.000Z'),
    ]
    folderTypeStore.set('S', { folderId: 'S', type: 'story', markedAt: 1 })
    const storiesStore = useStoriesStore()

    await storiesStore.openLibrary('lib-uuid') // cold: chưa nhóm — chapter = [1-60, 61]

    // B1: đánh dấu "1-60" là nhóm (rescan như StoryPage load(true))
    await storiesStore.markAsGroup('G1', 'S')
    const afterG1 = await storiesStore.ensureChapters('lib-uuid', 'S', { force: true })
    expect(afterG1.map((chapter) => chapter.name)).toEqual(['1-5', '6', '60', '61'])

    // B2: đánh dấu "1-5" (con của 1-60) là nhóm
    await storiesStore.markAsGroup('G2', 'S')
    const afterG2 = await storiesStore.ensureChapters('lib-uuid', 'S', { force: true })

    // Sort theo SỐ TRONG TÊN — không phải collation thuần (số trước chữ) vốn
    // dồn cả cụm "CHAP x" xuống cuối → đảo ngược sẽ hiện "CHAP 5" là mới nhất
    expect(afterG2.map((chapter) => chapter.name)).toEqual([
      'CHAP 1',
      'CHAP 2',
      'CHAP 5',
      '6',
      '60',
      '61',
    ])

    // Vào lại truyện (load(false) đọc cache) + warm vào lại kho — vẫn phải đúng
    const fromCache = await storiesStore.ensureChapters('lib-uuid', 'S')
    expect(fromCache.map((chapter) => chapter.name)).toEqual([
      'CHAP 1',
      'CHAP 2',
      'CHAP 5',
      '6',
      '60',
      '61',
    ])
    await storiesStore.openLibrary('lib-uuid')
    expect(storiesStore.latest['S']).toBe('61')
    expect(storiesStore.counts['S']).toBe(6)
  })
})