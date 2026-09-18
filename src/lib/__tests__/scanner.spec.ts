import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DriveItem } from '../driveApi'

// Mock Drive: map folderId → toàn bộ con (folder + file)
const folders: Record<string, DriveItem[]> = {
  // Truyện A: nhóm 0-30 (4 chapter) + chapter trực tiếp 31, 32
  root: [
    folder('f-31', '31', '2026-09-15T08:00:00.000Z'),
    folder('f-32', '32'),
    folder('f-0-30', '0-30', '2026-08-23T00:00:00.000Z'),
    file('ignored.txt', 'text/plain'),
  ],
  'f-31': [file('002.jpg', 'image/jpeg'), file('001.jpg', 'image/jpeg')],
  'f-32': [file('truyen.pdf', 'application/pdf')],
  'f-0-30': [
    folder('c-0', '0'),
    folder('c-2', '2'),
    folder('c-5', '5'),
    // Chap mới up 16/09 nằm trong khi folder truyện vẫn đứng ở 23/08
    folder('c-10', '10', '2026-09-16T10:00:00.000Z'),
  ],
  'c-0': [file('z.png', 'image/png'), file('a.png', 'image/png')],
  'c-2': [file('only.jpg', 'image/jpeg')],
  'c-5': [file('m.webp', 'image/webp')],
  'c-10': [file('x.webp', 'image/webp')],
  // Truyện nhóm lồng sâu: nhóm > nhóm con > chapter
  deep: [folder('g1', 'Phần 1', '2026-08-01T00:00:00.000Z'), folder('c-9', '9', '2026-08-05T00:00:00.000Z')],
  g1: [folder('g1a', 'Tập 1')],
  g1a: [folder('c-5d', '5', '2026-09-16T12:00:00.000Z')],
  'c-5d': [file('p.jpg', 'image/jpeg')],
  'c-9': [file('q.jpg', 'image/jpeg')],
  // Truyện có chap mới hơn mốc cache (fetchNewChapters): nhóm "nhom" bị bump
  // ngày 17/09 vì chap "8" mới thêm vào bên trong
  inc: [
    folder('i-1', '1', '2026-08-01T00:00:00.000Z'),
    folder('i-grp', 'nhom', '2026-09-17T06:00:00.000Z'),
    folder('i-9', '9', '2026-09-17T09:00:00.000Z'),
  ],
  'i-grp': [folder('i-5', '5', '2026-08-10T00:00:00.000Z'), folder('i-8', '8', '2026-09-17T08:00:00.000Z')],
  // Chapter bị sửa (đổi tên) sau mốc cache — fetchNewChapters merge theo id
  ren: [folder('r-1', 'New', '2026-09-17T00:00:00.000Z')],
  // Trộn cả ảnh lẫn PDF → ensureChapterFiles ưu tiên ảnh
  mixed: [file('a.jpg', 'image/jpeg'), file('all.pdf', 'application/pdf')],
  // Folder thật sự trống (không file đọc được)
  'c-empty': [],
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

/** Ghi nhận folder nào đã bị query */
const queriedParents = new Set<string>()

vi.mock('../driveApi', () => ({
  DRIVE_CONCURRENCY: 3,
  listChildrenGrouped: vi.fn<
    (parentIds: string[], options?: { foldersOnly?: boolean }) => Promise<Map<string, DriveItem[]>>
  >(async (parentIds, options) => {
    const map = new Map<string, DriveItem[]>()
    for (const id of parentIds) {
      queriedParents.add(id)
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
      queriedParents.add(id)
      const children = (folders[id] ?? [])
        .filter((item) => (options?.foldersOnly ? isFolderItem(item) : true))
        .filter((item) => {
          if (!item.modifiedTime) return false
          return new Date(item.modifiedTime).getTime() > since
        })
      if (children.length > 0) map.set(id, structuredClone(children))
    }
    return map
  }),
  listChildren: vi.fn<(folderId: string) => Promise<DriveItem[]>>(async (folderId) => {
    queriedParents.add(folderId)
    return structuredClone(folders[folderId] ?? [])
  }),
}))

// Giả lập IndexedDB bằng Map trong memory (mirror shape CacheRecord {key, data, fetchedAt})
const cacheStore = new Map<string, { key: string; data: unknown; fetchedAt: number }>()
vi.mock('../db', () => ({
  getCache: vi.fn<
    (key: string) => Promise<{ key: string; data: unknown; fetchedAt: number } | undefined>
  >(async (key: string) => cacheStore.get(key)),
  setCache: vi.fn<(key: string, data: unknown) => Promise<void>>(async (key, data) => {
    cacheStore.set(key, { key, data, fetchedAt: Date.now() })
  }),
}))

import { listChildren, listNewChildren } from '../driveApi'
import {
  ensureChapterFiles,
  fetchNewChapters,
  latestIso,
  listStories,
  parseChaptersCache,
  refreshStoryDates,
  scanStories,
  scanStory,
  walkLibrary,
  type ChapterRef,
} from '../scanner'

beforeEach(() => {
  vi.mocked(listChildren).mockClear()
  vi.mocked(listNewChildren).mockClear()
  cacheStore.clear()
  queriedParents.clear()
})

describe('scanStories / scanStory (1 cấp tự động + đánh dấu nhóm)', () => {
  it('KHÔNG đánh dấu → danh sách chapter = đúng con trực tiếp (kể cả nhóm)', async () => {
    const { chapters, groups } = await scanStory('root')
    // "0-30" là nhóm nhưng chưa đánh dấu → hiện nguyên là 1 dòng chapter
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0-30', '31', '32'])
    expect(groups).toEqual([])
    // Chỉ query đúng 1 cấp — không đụng tới con của 0-30
    expect(queriedParents.has('root')).toBe(true)
    expect(queriedParents.has('f-0-30')).toBe(false)
    expect(queriedParents.has('c-0')).toBe(false)
  })

  it('đánh dấu 0-80 kiểu nhóm → con được đưa lên cùng cấp với 31, 32', async () => {
    const { chapters, groups } = await scanStory('root', { groupMarks: new Set(['f-0-30']) })
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0', '2', '5', '10', '31', '32'])
    // Nhóm bị thay thế bởi con của nó — không hiện "0-30" nữa
    expect(chapters.some((chapter) => chapter.name === '0-30')).toBe(false)
    // Nhóm đã đánh dấu được ghi lại (để biết nhóm nào thuộc truyện nào)
    expect(groups).toEqual([{ id: 'f-0-30', name: '0-30' }])
  })

  it('nhóm đánh dấu mà rỗng → bỏ qua (không thành chapter trống)', async () => {
    const { chapters, groups } = await scanStory('root', { groupMarks: new Set(['f-32']) })
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0-30', '31'])
    // Nhóm rỗng vẫn được ghi lại
    expect(groups).toEqual([{ id: 'f-32', name: '32' }])
  })

  it('nhóm lồng nhau: đánh dấu cả 2 tầng mới bung hết', async () => {
    // chỉ đánh dấu tầng ngoài
    const { chapters: one, groups: oneGroups } = await scanStory('deep', {
      groupMarks: new Set(['g1']),
    })
    expect(one.map((chapter) => chapter.name)).toEqual(['9', 'Tập 1'])
    expect(oneGroups).toEqual([{ id: 'g1', name: 'Phần 1' }])

    // đánh dấu cả tầng trong
    const { chapters: both, groups: bothGroups } = await scanStory('deep', {
      groupMarks: new Set(['g1', 'g1a']),
    })
    expect(both.map((chapter) => chapter.name)).toEqual(['5', '9'])
    expect(bothGroups).toEqual([
      { id: 'g1', name: 'Phần 1' },
      { id: 'g1a', name: 'Tập 1' },
    ])
  })

  it('quét nhiều truyện batch, chapter về đúng truyện gốc', async () => {
    const results = await scanStories(
      [
        { id: 'root', name: 'Truyện A' },
        { id: 'deep', name: 'Truyện Deep' },
      ],
      { groupMarks: new Set(['f-0-30', 'g1', 'g1a']) },
    )
    expect(results.get('root')?.chapters.map((chapter) => chapter.name)).toEqual([
      '0',
      '2',
      '5',
      '10',
      '31',
      '32',
    ])
    expect(results.get('deep')?.chapters.map((chapter) => chapter.name)).toEqual(['5', '9'])
    expect(results.get('root')?.groups).toEqual([{ id: 'f-0-30', name: '0-30' }])
    expect(results.get('deep')?.groups).toEqual([
      { id: 'g1', name: 'Phần 1' },
      { id: 'g1a', name: 'Tập 1' },
    ])
  })

  it('báo số chapter tăng dần qua onChapterFound', async () => {
    const seen: number[] = []
    const { chapters } = await scanStory('root', {
      groupMarks: new Set(['f-0-30']),
      onChapterFound: (count) => seen.push(count),
    })
    expect(chapters).toHaveLength(6)
    expect(seen[seen.length - 1]).toBe(6)
  })

  it('truyện rỗng vẫn tính 1 chapter để không mất truyện', async () => {
    const { chapters } = await scanStory('c-empty')
    expect(chapters).toHaveLength(1)
  })

  it('chapter giữ modifiedTime của folder chapter (kể cả chap trong nhóm)', async () => {
    const { chapters } = await scanStory('root', { groupMarks: new Set(['f-0-30']) })
    expect(chapters.find((chapter) => chapter.name === '31')?.modifiedTime).toBe(
      '2026-09-15T08:00:00.000Z',
    )
    // "10" nằm trong nhóm 0-30 → vẫn mang ngày của folder nó
    expect(chapters.find((chapter) => chapter.name === '10')?.modifiedTime).toBe(
      '2026-09-16T10:00:00.000Z',
    )
  })
})

describe('ensureChapterFiles (lazy — chỉ lấy khi mở chapter)', () => {
  it('lấy + sort ảnh tự nhiên rồi cache, lần sau không gọi API', async () => {
    const first = await ensureChapterFiles('c-0', '0')
    expect(first.isPdf).toBe(false)
    expect(first.files.map((f) => f.name)).toEqual(['a.png', 'z.png'])
    expect(first.pdfFile).toBeNull() // chapter chỉ có ảnh, không có PDF đi kèm
    expect(listChildren).toHaveBeenCalledTimes(1)

    const second = await ensureChapterFiles('c-0', '0')
    expect(second.files).toHaveLength(2)
    expect(listChildren).toHaveBeenCalledTimes(1) // phục vụ từ cache
  })

  it('chapter chỉ có PDF → pdf-mode', async () => {
    const chapter = await ensureChapterFiles('f-32', '32')
    expect(chapter.isPdf).toBe(true)
    expect(chapter.files.map((f) => f.name)).toEqual(['truyen.pdf'])
    expect(chapter.pdfFile).toBeNull()
  })

  it('folder có cả ảnh và PDF → ưu tiên ảnh, PDF trở thành option đọc', async () => {
    const chapter = await ensureChapterFiles('mixed', 'mixed')
    expect(chapter.isPdf).toBe(false)
    expect(chapter.files.map((f) => f.name)).toEqual(['a.jpg'])
    expect(chapter.pdfFile?.name).toBe('all.pdf')
  })

  it('chapter trống → không file, không pdf', async () => {
    const chapter = await ensureChapterFiles('c-empty', 'empty')
    expect(chapter.files).toEqual([])
    expect(chapter.isPdf).toBe(false)
    expect(chapter.pdfFile).toBeNull()
  })

  it('force → bỏ qua cache, gọi lại API', async () => {
    await ensureChapterFiles('c-2', '2')
    expect(listChildren).toHaveBeenCalledTimes(1)
    await ensureChapterFiles('c-2', '2', { force: true })
    expect(listChildren).toHaveBeenCalledTimes(2)
  })

  it('cache cũ thiếu pdfFile → tự lấy lại 1 lần cho đủ field', async () => {
    // Cache viết trước bản có pdfFile (chỉ {id, name, files, isPdf})
    cacheStore.set('chapterFiles:old-shape', {
      key: 'chapterFiles:old-shape',
      data: {
        id: 'mixed',
        name: 'mixed',
        files: [{ id: 'file-a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }],
        isPdf: false,
      },
      fetchedAt: 1,
    })
    const chapter = await ensureChapterFiles('mixed', 'mixed')
    expect(listChildren).toHaveBeenCalledTimes(1) // refetch vì cache stale
    expect(chapter.pdfFile?.name).toBe('all.pdf')

    // Cache đã có field (kể cả null) → không gọi lại
    await ensureChapterFiles('mixed', 'mixed')
    expect(listChildren).toHaveBeenCalledTimes(1)
  })
})

describe('listStories (bước 1 — 1 request, không kèm quét)', () => {
  it('chỉ lấy folder con, sort tự nhiên, giữ ngày sửa đổi', async () => {
    const stories = await listStories('root')
    expect(stories.map((story) => story.name)).toEqual(['0-30', '31', '32'])
    expect(stories.find((story) => story.name === '32')?.modifiedTime).toBeUndefined()
    expect(stories.find((story) => story.name === '31')?.modifiedTime).toBe(
      '2026-09-15T08:00:00.000Z',
    )
    // Chỉ list folder kho — chưa tốn request nào cho con của truyện
    expect(queriedParents).toEqual(new Set(['root']))
  })
})

describe('walkLibrary (bước 2 — quét hợp nhất 1 lượt)', () => {
  it('lastModified mọi truyện = max(ngày folder, ngày con trực tiếp), không cần đánh dấu', async () => {
    const result = await walkLibrary([
      { id: 'f-0-30', name: '0-30', modifiedTime: '2026-08-23T00:00:00.000Z' },
      { id: 'f-31', name: '31', modifiedTime: '2026-09-15T08:00:00.000Z' },
      { id: 'f-32', name: '32' },
    ])
    // Truyện "0-30": folder đứng ở 23/08 nhưng chap con "10" up 16/09
    expect(result.lastModified.get('f-0-30')).toBe('2026-09-16T10:00:00.000Z')
    // Truyện "31": con trực tiếp chỉ là file (bỏ qua) → giữ ngày folder
    expect(result.lastModified.get('f-31')).toBe('2026-09-15T08:00:00.000Z')
    // Chưa đánh dấu truyện nào → không quét chapter, không nhóm
    expect(result.chapters.size).toBe(0)
    expect(result.groups.size).toBe(0)
    // Mỗi folder chỉ bị query đúng 1 lần (tầng 0 duy nhất)
    expect(queriedParents).toEqual(new Set(['f-0-30', 'f-31', 'f-32']))
  })

  it('truyện đánh dấu: chapter đúng 1 cấp tự động + nhóm bung con lên cùng cấp', async () => {
    const result = await walkLibrary(
      [
        { id: 'root', name: 'Truyện A' },
        { id: 'deep', name: 'Truyện Deep' },
      ],
      { markedStoryIds: new Set(['root', 'deep']), groupMarks: new Set(['f-0-30', 'g1', 'g1a']) },
    )
    expect(result.chapters.get('root')?.map((chapter) => chapter.name)).toEqual([
      '0',
      '2',
      '5',
      '10',
      '31',
      '32',
    ])
    expect(result.chapters.get('deep')?.map((chapter) => chapter.name)).toEqual(['5', '9'])
    // Nhóm đã đánh dấu gặp trong subtree được ghi lại theo truyện
    expect(result.groups.get('root')).toEqual([{ id: 'f-0-30', name: '0-30' }])
    expect(result.groups.get('deep')).toEqual([
      { id: 'g1', name: 'Phần 1' },
      { id: 'g1a', name: 'Tập 1' },
    ])
  })

  it('nhóm CHỦ bung trong subtree truyện đánh dấu — truyện thường không tốn thêm request', async () => {
    const result = await walkLibrary(
      [
        { id: 'root', name: 'A' },
        { id: 'deep', name: 'B' },
      ],
      { markedStoryIds: new Set(['root']), groupMarks: new Set(['f-0-30', 'g1', 'g1a']) },
    )
    expect(result.chapters.has('deep')).toBe(false)
    expect(result.groups.has('deep')).toBe(false)
    expect(result.groups.get('root')).toEqual([{ id: 'f-0-30', name: '0-30' }])
    // Nhóm của truyện KHÔNG đánh dấu không bị mở rộng
    expect(queriedParents.has('g1')).toBe(false)
    // Nhóm của truyện đánh dấu vẫn bung (query f-0-30 ở tầng 0 + tầng 1)
    expect(queriedParents.has('f-0-30')).toBe(true)
    // Folder chapter không bao giờ bị query (chỉ là lá)
    expect(queriedParents.has('c-10')).toBe(false)
  })

  it('truyện đánh dấu: chap trong nhóm lồng sâu vẫn tính chapter + bump lastModified', async () => {
    // g1 (Phần 1) là truyện đánh dấu, g1a (Tập 1) là nhóm — "5" nằm sâu 2 tầng
    const result = await walkLibrary(
      [{ id: 'g1', name: 'Phần 1', modifiedTime: '2026-08-01T00:00:00.000Z' }],
      { markedStoryIds: new Set(['g1']), groupMarks: new Set(['g1a']) },
    )
    expect(result.lastModified.get('g1')).toBe('2026-09-16T12:00:00.000Z')
    expect(result.chapters.get('g1')?.map((chapter) => chapter.name)).toEqual(['5'])
  })

  it('truyện rỗng đánh dấu vẫn tính 1 chapter để không mất truyện', async () => {
    const result = await walkLibrary([{ id: 'c-empty', name: 'Empty' }], {
      markedStoryIds: new Set(['c-empty']),
    })
    expect(result.chapters.get('c-empty')).toHaveLength(1)
  })

  it('onDates/onLevelDone báo tiến triển sau từng tầng', async () => {
    const dateSnapshots: number[] = []
    const counts: number[] = []
    await walkLibrary([{ id: 'root', name: 'A' }], {
      markedStoryIds: new Set(['root']),
      groupMarks: new Set(['f-0-30']),
      onDates: (latest) => dateSnapshots.push(latest.size),
      onLevelDone: (levelCounts) => counts.push(levelCounts.get('root') ?? 0),
    })
    // Tầng 0 (con trực tiếp) + tầng 1 (trong nhóm)
    expect(dateSnapshots).toEqual([1, 1])
    expect(counts).toEqual([2, 6]) // 31,32 rồi bung nhóm thêm 0,2,5,10
  })
})

describe('fetchNewChapters (incremental — chỉ lấy phần mới hơn mốc cache)', () => {
  const cached: ChapterRef[] = [
    { id: 'i-1', name: '1', modifiedTime: '2026-08-01T00:00:00.000Z' },
    { id: 'i-5', name: '5', modifiedTime: '2026-08-10T00:00:00.000Z' },
  ]

  it('merge chap mới trực tiếp + chap mới trong nhóm bị bump ngày', async () => {
    const chapters = await fetchNewChapters('inc', cached, { groupMarks: new Set(['i-grp']) })
    expect(chapters?.map((chapter) => chapter.name)).toEqual(['1', '5', '8', '9'])
    // Chỉ query truyện (tầng 0) và nhóm bị bump (tầng 1) — không list lại toàn bộ
    expect(queriedParents).toEqual(new Set(['inc', 'i-grp']))
  })

  it('chapter bị sửa (cùng id, đổi tên) → cập nhật tại chỗ, không nhân đôi', async () => {
    const chapters = await fetchNewChapters('ren', [
      { id: 'r-1', name: 'Old', modifiedTime: '2026-08-01T00:00:00.000Z' },
    ])
    expect(chapters).toEqual([
      { id: 'r-1', name: 'New', modifiedTime: '2026-09-17T00:00:00.000Z' },
    ])
  })

  it('không có gì mới hơn mốc → trả lại đúng cache', async () => {
    const chapters = await fetchNewChapters('deep', [
      { id: 'c-9', name: '9', modifiedTime: '2026-09-17T00:00:00.000Z' },
    ])
    expect(chapters).toEqual([{ id: 'c-9', name: '9', modifiedTime: '2026-09-17T00:00:00.000Z' }])
  })

  it('cache thiếu modifiedTime → trả null để caller quét full', async () => {
    const chapters = await fetchNewChapters('inc', [
      { id: 'i-1', name: '1' },
      { id: 'i-5', name: '5', modifiedTime: '2026-08-10T00:00:00.000Z' },
    ])
    expect(chapters).toBeNull()
    expect(queriedParents.size).toBe(0)
  })
})

describe('refreshStoryDates (Làm mới — chỉ lấy phần mới hơn mốc cũ)', () => {
  it('truyện có folder con mới hơn mốc → mốc mới; không có gì mới → không xuất hiện', async () => {
    const changed = await refreshStoryDates([
      // c-10 (16/09) không mới hơn mốc 16/09 → không đổi
      { id: 'f-0-30', name: '0-30', lastModified: '2026-09-16T10:00:00.000Z' },
      // con trực tiếp chỉ là file (foldersOnly) → không đổi
      { id: 'f-31', name: '31', lastModified: '2026-09-14T00:00:00.000Z' },
      // c-9 (05/08) mới hơn mốc 01/08 → bump
      { id: 'deep', name: 'Deep', lastModified: '2026-08-01T00:00:00.000Z' },
    ])
    expect(changed.get('deep')).toBe('2026-08-05T00:00:00.000Z')
    expect(changed.has('f-0-30')).toBe(false)
    expect(changed.has('f-31')).toBe(false)
  })

  it('chunk dùng mốc cũ nhất trong chunk (sort theo lastModified trước)', async () => {
    await refreshStoryDates([
      { id: 'f-0-30', name: '0-30', lastModified: '2026-09-16T10:00:00.000Z' },
      { id: 'f-31', name: '31', lastModified: '2026-09-14T00:00:00.000Z' },
      { id: 'deep', name: 'Deep', lastModified: '2026-08-01T00:00:00.000Z' },
    ])
    expect(listNewChildren).toHaveBeenCalledTimes(1)
    expect(listNewChildren).toHaveBeenCalledWith(
      ['deep', 'f-31', 'f-0-30'],
      '2026-08-01T00:00:00.000Z',
      expect.anything(),
    )
  })

  it('truyện thiếu lastModified bị bỏ qua — không tốn request', async () => {
    const changed = await refreshStoryDates([{ id: 'f-31', name: '31' }])
    expect(changed.size).toBe(0)
    expect(queriedParents.size).toBe(0)
  })
})

describe('latestIso', () => {
  it('trả ISO mới nhất, bỏ qua rỗng/undefined/lỗi parse', () => {
    expect(
      latestIso(undefined, '2026-08-23T00:00:00.000Z', 'not-a-date', '2026-09-16T10:00:00.000Z'),
    ).toBe('2026-09-16T10:00:00.000Z')
  })

  it('không có giá trị hợp lệ nào → undefined', () => {
    expect(latestIso()).toBeUndefined()
    expect(latestIso(undefined, 'garbage')).toBeUndefined()
  })
})

describe('parseChaptersCache (đọc cache chapter 2 shape)', () => {
  it('bản mới {chapters, groups} → parse đủ 2 mảng', () => {
    const result = parseChaptersCache({
      chapters: [{ id: 'c1', name: '1', modifiedTime: '2026-09-15T08:00:00.000Z' }],
      groups: [{ id: 'g1', name: '0-80' }],
    })
    expect(result).toEqual({
      chapters: [{ id: 'c1', name: '1', modifiedTime: '2026-09-15T08:00:00.000Z' }],
      groups: [{ id: 'g1', name: '0-80' }],
    })
  })

  it('thiếu groups → điền mảng rỗng', () => {
    const result = parseChaptersCache({ chapters: [] })
    expect(result).toEqual({ chapters: [], groups: [] })
  })

  // Regression: LibraryPage từng truyền cache thô vào applyLiveProgress —
  // bare array KHÔNG phải {chapters, groups} → phải trả null chứ không phải mảng
  it('bản cũ bare array → null (caller coi như miss, không đưa vào applyLiveProgress)', () => {
    const legacy: ChapterRef[] = [{ id: 'c1', name: '1', modifiedTime: '2026-09-15T08:00:00.000Z' }]
    expect(parseChaptersCache(legacy)).toBeNull()
  })

  it('dữ liệu rác / thiếu chapters → null', () => {
    expect(parseChaptersCache(null)).toBeNull()
    expect(parseChaptersCache('oops')).toBeNull()
    expect(parseChaptersCache({ groups: [] })).toBeNull()
  })
})
