import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DriveItem } from '../driveApi'

// Mock Drive: map folderId → toàn bộ con (folder + file)
const folders: Record<string, DriveItem[]> = {
  // Truyện A: nhóm 0-30 (4 chapter) + chapter trực tiếp 31, 32
  root: [folder('f-31', '31'), folder('f-32', '32'), folder('f-0-30', '0-30'), file('ignored.txt', 'text/plain')],
  'f-31': [file('002.jpg', 'image/jpeg'), file('001.jpg', 'image/jpeg')],
  'f-32': [file('truyen.pdf', 'application/pdf')],
  'f-0-30': [folder('c-0', '0'), folder('c-2', '2'), folder('c-5', '5'), folder('c-10', '10')],
  'c-0': [file('z.png', 'image/png'), file('a.png', 'image/png')],
  'c-2': [file('only.jpg', 'image/jpeg')],
  'c-5': [file('m.webp', 'image/webp')],
  'c-10': [file('x.webp', 'image/webp')],
  // Truyện nhóm lồng sâu: nhóm > nhóm con > chapter
  deep: [folder('g1', 'Phần 1'), folder('c-9', '9')],
  g1: [folder('g1a', 'Tập 1')],
  g1a: [folder('c-5d', '5')],
  'c-5d': [file('p.jpg', 'image/jpeg')],
  'c-9': [file('q.jpg', 'image/jpeg')],
  // Trộn cả ảnh lẫn PDF → ensureChapterFiles ưu tiên ảnh
  mixed: [file('a.jpg', 'image/jpeg'), file('all.pdf', 'application/pdf')],
  // Folder thật sự trống (không file đọc được)
  'c-empty': [],
}

function folder(id: string, name: string): DriveItem {
  return { id, name, mimeType: 'application/vnd.google-apps.folder' }
}

function file(name: string, mimeType: string): DriveItem {
  return { id: `file-${name}`, name, mimeType }
}

const isFolderItem = (item: DriveItem): boolean =>
  item.mimeType === 'application/vnd.google-apps.folder'

/** Ghi nhận folder nào đã bị query */
const queriedParents = new Set<string>()

vi.mock('../driveApi', () => ({
  listChildrenGrouped: vi.fn<
    (
      parentIds: string[],
      options?: { foldersOnly?: boolean },
    ) => Promise<Map<string, DriveItem[]>>
  >(async (parentIds, options) => {
    const map = new Map<string, DriveItem[]>()
    for (const id of parentIds) {
      queriedParents.add(id)
      const children = structuredClone(folders[id] ?? [])
      map.set(id, options?.foldersOnly ? children.filter(isFolderItem) : children)
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
  getCache: vi.fn<(key: string) => Promise<{ key: string; data: unknown; fetchedAt: number } | undefined>>(
    async (key: string) => cacheStore.get(key),
  ),
  setCache: vi.fn<(key: string, data: unknown) => Promise<void>>(async (key, data) => {
    cacheStore.set(key, { key, data, fetchedAt: Date.now() })
  }),
}))

import { listChildren } from '../driveApi'
import { ensureChapterFiles, scanStories, scanStory } from '../scanner'

beforeEach(() => {
  vi.mocked(listChildren).mockClear()
  cacheStore.clear()
  queriedParents.clear()
})

describe('scanStories / scanStory (1 cấp tự động + đánh dấu nhóm)', () => {
  it('KHÔNG đánh dấu → danh sách chapter = đúng con trực tiếp (kể cả nhóm)', async () => {
    const chapters = await scanStory('root')
    // "0-30" là nhóm nhưng chưa đánh dấu → hiện nguyên là 1 dòng chapter
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0-30', '31', '32'])
    // Chỉ query đúng 1 cấp — không đụng tới con của 0-30
    expect(queriedParents.has('root')).toBe(true)
    expect(queriedParents.has('f-0-30')).toBe(false)
    expect(queriedParents.has('c-0')).toBe(false)
  })

  it('đánh dấu 0-80 kiểu nhóm → con được đưa lên cùng cấp với 31, 32', async () => {
    const chapters = await scanStory('root', { groupMarks: new Set(['f-0-30']) })
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0', '2', '5', '10', '31', '32'])
    // Nhóm bị thay thế bởi con của nó — không hiện "0-30" nữa
    expect(chapters.some((chapter) => chapter.name === '0-30')).toBe(false)
  })

  it('nhóm đánh dấu mà rỗng → bỏ qua (không thành chapter trống)', async () => {
    const chapters = await scanStory('root', { groupMarks: new Set(['f-32']) })
    expect(chapters.map((chapter) => chapter.name)).toEqual(['0-30', '31'])
  })

  it('nhóm lồng nhau: đánh dấu cả 2 tầng mới bung hết', async () => {
    // chỉ đánh dấu tầng ngoài
    const one = await scanStory('deep', { groupMarks: new Set(['g1']) })
    expect(one.map((chapter) => chapter.name)).toEqual(['9', 'Tập 1'])

    // đánh dấu cả tầng trong
    const both = await scanStory('deep', { groupMarks: new Set(['g1', 'g1a']) })
    expect(both.map((chapter) => chapter.name)).toEqual(['5', '9'])
  })

  it('quét nhiều truyện batch, chapter về đúng truyện gốc', async () => {
    const results = await scanStories(
      [
        { id: 'root', name: 'Truyện A' },
        { id: 'deep', name: 'Truyện Deep' },
      ],
      { groupMarks: new Set(['f-0-30', 'g1', 'g1a']) },
    )
    expect(results.get('root')?.map((chapter) => chapter.name)).toEqual(['0', '2', '5', '10', '31', '32'])
    expect(results.get('deep')?.map((chapter) => chapter.name)).toEqual(['5', '9'])
  })

  it('báo số chapter tăng dần qua onChapterFound', async () => {
    const seen: number[] = []
    const chapters = await scanStory('root', {
      groupMarks: new Set(['f-0-30']),
      onChapterFound: (count) => seen.push(count),
    })
    expect(chapters).toHaveLength(6)
    expect(seen[seen.length - 1]).toBe(6)
  })

  it('truyện rỗng vẫn tính 1 chapter để không mất truyện', async () => {
    const chapters = await scanStory('c-empty')
    expect(chapters).toHaveLength(1)
  })
})

describe('ensureChapterFiles (lazy — chỉ lấy khi mở chapter)', () => {
  it('lấy + sort ảnh tự nhiên rồi cache, lần sau không gọi API', async () => {
    const first = await ensureChapterFiles('c-0', '0')
    expect(first.isPdf).toBe(false)
    expect(first.files.map((f) => f.name)).toEqual(['a.png', 'z.png'])
    expect(listChildren).toHaveBeenCalledTimes(1)

    const second = await ensureChapterFiles('c-0', '0')
    expect(second.files).toHaveLength(2)
    expect(listChildren).toHaveBeenCalledTimes(1) // phục vụ từ cache
  })

  it('chapter chỉ có PDF → pdf-mode', async () => {
    const chapter = await ensureChapterFiles('f-32', '32')
    expect(chapter.isPdf).toBe(true)
    expect(chapter.files.map((f) => f.name)).toEqual(['truyen.pdf'])
  })

  it('folder có cả ảnh và PDF → ưu tiên ảnh', async () => {
    const chapter = await ensureChapterFiles('mixed', 'mixed')
    expect(chapter.isPdf).toBe(false)
    expect(chapter.files.map((f) => f.name)).toEqual(['a.jpg'])
  })

  it('chapter trống → không file, không pdf', async () => {
    const chapter = await ensureChapterFiles('c-empty', 'empty')
    expect(chapter.files).toEqual([])
    expect(chapter.isPdf).toBe(false)
  })

  it('force → bỏ qua cache, gọi lại API', async () => {
    await ensureChapterFiles('c-2', '2')
    expect(listChildren).toHaveBeenCalledTimes(1)
    await ensureChapterFiles('c-2', '2', { force: true })
    expect(listChildren).toHaveBeenCalledTimes(2)
  })
})
