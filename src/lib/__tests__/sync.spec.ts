import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LibraryConfig, ProgressRecord } from '../db'
import {
  applySync,
  emptyPayload,
  libTombstoneKey,
  markTombstoneKey,
  mergeSync,
  parseSyncPayload,
  payloadsEqual,
  snapshotLocal,
  type SyncPayload,
} from '../sync'

// ---------- builder ----------

function payload(overrides: Partial<SyncPayload> = {}): SyncPayload {
  return { ...emptyPayload(), ...overrides }
}

function lib(folderId: string, name: string, updatedAt: number, createdAt = updatedAt) {
  return { folderId, name, createdAt, updatedAt }
}

function progress(
  folderId: string,
  storyId: string,
  updatedAt: number,
  chapterId = `c${updatedAt}`,
) {
  return {
    folderId,
    storyId,
    chapterId,
    chapterName: `Chapter ${chapterId}`,
    scrollPct: 0.5,
    updatedAt,
  }
}

function mark(folderId: string, type: 'story' | 'group', markedAt: number) {
  return { folderId, type, markedAt }
}

// ---------- mergeSync (pure) ----------

describe('mergeSync — last-write-wins', () => {
  it('progress: mỗi truyện giữ record updatedAt lớn hơn (ghép 2 chiều)', () => {
    const local = payload({ progress: [progress('F1', 'S1', 1000), progress('F1', 'S2', 2000)] })
    const remote = payload({ progress: [progress('F1', 'S1', 3000), progress('F1', 'S2', 1500)] })

    const merged = mergeSync(local, remote)

    expect(merged.progress).toHaveLength(2)
    expect(merged.progress.find((p) => p.storyId === 'S1')?.updatedAt).toBe(3000) // remote mới hơn
    expect(merged.progress.find((p) => p.storyId === 'S2')?.updatedAt).toBe(2000) // local mới hơn
  })

  it('progressWipeAt: record cũ hơn lần wipe bị bỏ, mới hơn sống sót', () => {
    const local = payload({ progress: [progress('F1', 'S1', 1000), progress('F1', 'S2', 9000)] })
    const remote = payload({ progressWipeAt: 5000 })

    const merged = mergeSync(local, remote)

    expect(merged.progressWipeAt).toBe(5000)
    expect(merged.progress).toHaveLength(1)
    expect(merged.progress[0]?.storyId).toBe('S2')
  })

  it('libraries: union theo folderId — kho riêng mỗi máy đều giữ', () => {
    const local = payload({ libraries: [lib('F1', 'Kho một', 100)] })
    const remote = payload({ libraries: [lib('F2', 'Kho hai', 200)] })

    const merged = mergeSync(local, remote)

    expect(merged.libraries.map((item) => item.folderId).sort()).toEqual(['F1', 'F2'])
  })

  it('libraries: rename cùng folderId → bên sửa sau thắng', () => {
    const local = payload({ libraries: [lib('F1', 'Tên cũ', 100)] })
    const remote = payload({ libraries: [lib('F1', 'Tên mới', 300)] })

    expect(mergeSync(local, remote).libraries[0]?.name).toBe('Tên mới')
    expect(mergeSync(remote, local).libraries[0]?.name).toBe('Tên mới')
  })

  it('tombstone lib: xóa trên máy khác → không hồi sinh dù local vẫn còn', () => {
    const local = payload({ libraries: [lib('F1', 'Kho một', 100)] })
    const remote = payload({ tombstones: { [libTombstoneKey('F1')]: 500 } })

    const merged = mergeSync(local, remote)

    expect(merged.libraries).toHaveLength(0)
    expect(merged.tombstones[libTombstoneKey('F1')]).toBe(500)
  })

  it('tombstone lib cũ hơn lần sửa → kho sống lại (thêm lại trên máy khác)', () => {
    const local = payload({ libraries: [lib('F1', 'Kho thêm lại', 800)] })
    const remote = payload({ tombstones: { [libTombstoneKey('F1')]: 500 } })

    expect(mergeSync(local, remote).libraries).toHaveLength(1)
  })

  it('tombstones: cùng key lấy thời điểm xóa lớn hơn', () => {
    const local = payload({ tombstones: { a: 100, b: 900 } })
    const remote = payload({ tombstones: { a: 300, c: 50 } })

    expect(mergeSync(local, remote).tombstones).toEqual({ a: 300, b: 900, c: 50 })
  })

  it('marks: đánh dấu mới hơn thắng, tombstone xóa đánh dấu', () => {
    const local = payload({
      marks: [mark('M1', 'story', 1000), mark('M2', 'story', 1000), mark('M3', 'group', 1000)],
    })
    const remote = payload({
      marks: [mark('M1', 'story', 2000), mark('M2', 'group', 3000)],
      tombstones: { [markTombstoneKey('M3')]: 1500 },
    })

    const merged = mergeSync(local, remote)

    expect(merged.marks).toHaveLength(2)
    expect(merged.marks.find((m) => m.folderId === 'M1')?.markedAt).toBe(2000)
    expect(merged.marks.find((m) => m.folderId === 'M2')?.type).toBe('group')
    expect(merged.marks.some((m) => m.folderId === 'M3')).toBe(false)
  })

  it('active: bên đổi gần đây hơn thắng; folderId không còn → về kho đầu tiên', () => {
    const libraries = [lib('F1', 'Kho một', 100), lib('F2', 'Kho hai', 200)]
    const local = payload({ libraries, activeFolderId: 'F1', activeUpdatedAt: 100 })
    const remote = payload({ libraries, activeFolderId: 'F2', activeUpdatedAt: 500 })

    expect(mergeSync(local, remote).activeFolderId).toBe('F2')

    const remoteDead = payload({
      libraries,
      activeFolderId: 'F9',
      activeUpdatedAt: 900,
      tombstones: { [libTombstoneKey('F9')]: 1000 },
    })
    expect(mergeSync(local, remoteDead).activeFolderId).toBe('F1')
  })
})

// ---------- parseSyncPayload / payloadsEqual (pure) ----------

describe('parseSyncPayload', () => {
  it('JSON hỏng → null', () => {
    expect(parseSyncPayload('{ không hợp lệ')).toBeNull()
  })

  it('sai version → null (không ghi đè dữ liệu mới hơn)', () => {
    expect(parseSyncPayload(JSON.stringify({ ...payload(), version: 99 }))).toBeNull()
  })

  it('thiếu mảng bắt buộc → null', () => {
    expect(parseSyncPayload(JSON.stringify({ ...payload(), libraries: undefined }))).toBeNull()
    expect(parseSyncPayload('{"version":1,"marks":[],"progress":[]}')).toBeNull()
  })

  it('payload thiếu field tùy chọn → điền giá trị mặc định', () => {
    const parsed = parseSyncPayload(
      JSON.stringify({ version: 1, updatedAt: 5, libraries: [], marks: [], progress: [] }),
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.tombstones).toEqual({})
    expect(parsed?.progressWipeAt).toBe(0)
    expect(parsed?.activeFolderId).toBe('')
  })
})

describe('payloadsEqual', () => {
  it('giống nhau chỉ khác updatedAt → bằng nhau (không cần push lại)', () => {
    const a = payload({ updatedAt: 1, progress: [progress('F1', 'S1', 100)] })
    const b = payload({ updatedAt: 999, progress: [progress('F1', 'S1', 100)] })
    expect(payloadsEqual(a, b)).toBe(true)
  })

  it('khác nội dung progress → không bằng', () => {
    const a = payload({ progress: [progress('F1', 'S1', 100)] })
    const b = payload({ progress: [progress('F1', 'S1', 200)] })
    expect(payloadsEqual(a, b)).toBe(false)
  })
})

// ---------- snapshotLocal / applySync (mock IndexedDB) ----------

const libraryStore = new Map<string, LibraryConfig>()
const progressStore = new Map<string, ProgressRecord>()
const folderTypeStore = new Map<
  string,
  { folderId: string; type: 'story' | 'group'; markedAt: number }
>()
const tombstoneStore = new Map<string, { key: string; deletedAt: number }>()
const clearChaptersCache = vi.fn<() => Promise<void>>(async () => undefined)

vi.mock('../db', () => ({
  getLibraries: vi.fn<() => Promise<LibraryConfig[]>>(async () =>
    [...libraryStore.values()].sort((a, b) => a.createdAt - b.createdAt),
  ),
  putLibrary: vi.fn<(lib: LibraryConfig) => Promise<void>>(async (lib) => {
    libraryStore.set(lib.id, lib)
  }),
  deleteLibrary: vi.fn<(id: string) => Promise<void>>(async (id) => {
    libraryStore.delete(id)
  }),
  getAllProgress: vi.fn<() => Promise<ProgressRecord[]>>(async () => [
    ...progressStore.values(),
  ]),
  getProgress: vi.fn<(key: string) => Promise<ProgressRecord | undefined>>(async (key) =>
    progressStore.get(key),
  ),
  putProgress: vi.fn<(record: ProgressRecord) => Promise<void>>(async (record) => {
    progressStore.set(record.key, record)
  }),
  deleteProgress: vi.fn<(key: string) => Promise<void>>(async (key) => {
    progressStore.delete(key)
  }),
  getFolderTypes: vi.fn<
    () => Promise<Array<{ folderId: string; type: 'story' | 'group'; markedAt: number }>>
  >(async () => [...folderTypeStore.values()]),
  putFolderType: vi.fn<
    (
      record: { folderId: string; type: 'story' | 'group'; markedAt: number },
    ) => Promise<void>
  >(async (record) => {
    folderTypeStore.set(record.folderId, record)
  }),
  deleteFolderType: vi.fn<(folderId: string) => Promise<void>>(async (folderId) => {
    folderTypeStore.delete(folderId)
  }),
  getTombstones: vi.fn<
    () => Promise<Array<{ key: string; deletedAt: number }>>
  >(async () => [...tombstoneStore.values()]),
  clearChaptersCache: () => clearChaptersCache(),
}))

let uuidSeq = 0
beforeEach(() => {
  vi.clearAllMocks()
  libraryStore.clear()
  progressStore.clear()
  folderTypeStore.clear()
  tombstoneStore.clear()
  uuidSeq = 0
  vi.stubGlobal('crypto', { randomUUID: () => `uuid-mới-${++uuidSeq}` })
})

describe('snapshotLocal', () => {
  it('đổi progress key UUID nội bộ sang folderId Drive, bỏ progress kho đã xóa', async () => {
    libraryStore.set('uuid-1', { id: 'uuid-1', name: 'Kho một', folderId: 'F1', createdAt: 100 })
    progressStore.set('uuid-1:S1', {
      key: 'uuid-1:S1',
      chapterId: 'c15',
      chapterName: 'Chapter 15',
      scrollPct: 0.4,
      updatedAt: 1234,
    })
    progressStore.set('uuid-đã-xóa:S2', {
      key: 'uuid-đã-xóa:S2',
      chapterId: 'c1',
      chapterName: 'Chapter 1',
      scrollPct: 0,
      updatedAt: 999,
    })
    tombstoneStore.set('wipe:progress', { key: 'wipe:progress', deletedAt: 555 })

    const snap = await snapshotLocal({ id: 'uuid-1', updatedAt: 42 })

    expect(snap.progress).toHaveLength(1)
    expect(snap.progress[0]).toMatchObject({ folderId: 'F1', storyId: 'S1', chapterId: 'c15' })
    expect(snap.progressWipeAt).toBe(555)
    expect(snap.activeFolderId).toBe('F1')
    expect(snap.activeUpdatedAt).toBe(42)
    expect(snap.libraries[0]).toMatchObject({ folderId: 'F1', name: 'Kho một' })
  })

  it('thư viện chưa từng có updatedAt → dùng createdAt làm mốc merge', async () => {
    libraryStore.set('uuid-1', { id: 'uuid-1', name: 'Kho cũ', folderId: 'F1', createdAt: 777 })

    const snap = await snapshotLocal({ id: '', updatedAt: 0 })

    expect(snap.libraries[0]?.updatedAt).toBe(777)
    expect(snap.activeFolderId).toBe('')
  })

  it('giữ nguyên số thứ tự chapter (chapterNo/chapterTotal) khi đổi key sang folderId', async () => {
    libraryStore.set('uuid-1', { id: 'uuid-1', name: 'Kho một', folderId: 'F1', createdAt: 100 })
    progressStore.set('uuid-1:S1', {
      key: 'uuid-1:S1',
      chapterId: 'c45',
      chapterName: 'Chapter 45',
      scrollPct: 0.5,
      chapterNo: 45,
      chapterTotal: 100,
      updatedAt: 1234,
    })

    const snap = await snapshotLocal({ id: 'uuid-1', updatedAt: 42 })

    expect(snap.progress[0]).toMatchObject({ storyId: 'S1', chapterNo: 45, chapterTotal: 100 })
  })
})

describe('applySync', () => {
  function seedLocal() {
    libraryStore.set('uuid-1', {
      id: 'uuid-1',
      name: 'Kho một',
      folderId: 'F1',
      createdAt: 100,
      updatedAt: 100,
    })
    progressStore.set('uuid-1:S1', {
      key: 'uuid-1:S1',
      chapterId: 'c10',
      chapterName: 'Chapter 10',
      scrollPct: 0.2,
      updatedAt: 1000,
    })
    folderTypeStore.set('M1', { folderId: 'M1', type: 'story', markedAt: 1000 })
  }

  it('đổi tên kho, tạo kho mới với UUID riêng, xóa kho biến mất', async () => {
    seedLocal()

    const result = await applySync(
      payload({
        libraries: [lib('F1', 'Tên mới', 300, 100), lib('F2', 'Kho hai', 200)],
        activeFolderId: 'F2',
      }),
    )

    expect(result.changed).toBe(true)
    expect(result.activeFolderId).toBe('F2')
    const libs = [...libraryStore.values()]
    expect(libs).toHaveLength(2)
    expect(libs.find((l) => l.folderId === 'F1')?.name).toBe('Tên mới')
    const f2 = libs.find((l) => l.folderId === 'F2')
    expect(f2?.id).toBe('uuid-mới-1')
    expect(f2?.createdAt).toBe(200)
  })

  it('progress: record mới hơn ghi đè, story chưa đọc được thêm, kho chưa có bị bỏ qua', async () => {
    seedLocal()

    const result = await applySync(
      payload({
        libraries: [lib('F1', 'Kho một', 100)],
        progress: [
          progress('F1', 'S1', 2000, 'c15'),
          progress('F1', 'S2', 500), // story chưa đọc trên máy này → thêm (từ máy khác)
          progress('F9', 'S1', 9999), // kho chưa có trên máy → bỏ qua
        ],
      }),
    )

    expect(result.progressChanged).toBe(true)
    expect(progressStore.get('uuid-1:S1')).toMatchObject({ chapterId: 'c15', updatedAt: 2000 })
    expect(progressStore.get('uuid-1:S2')).toMatchObject({ updatedAt: 500 })
    expect(progressStore.size).toBe(2)
  })

  it('progress mới hơn → ghi kèm số thứ tự chapter cho card hiện "đang đọc 45/100"', async () => {
    seedLocal()

    await applySync(
      payload({
        libraries: [lib('F1', 'Kho một', 100)],
        progress: [{ ...progress('F1', 'S1', 2000, 'c45'), chapterNo: 45, chapterTotal: 100 }],
      }),
    )

    expect(progressStore.get('uuid-1:S1')).toMatchObject({
      chapterId: 'c45',
      chapterNo: 45,
      chapterTotal: 100,
    })
  })

  it('progressWipeAt xóa record local cũ hơn wipe', async () => {
    seedLocal()

    const result = await applySync(payload({ libraries: [lib('F1', 'Kho một', 100)], progressWipeAt: 1500 }))

    expect(result.progressChanged).toBe(true)
    expect(progressStore.size).toBe(0)
  })

  it('marks: đánh dấu mới hơn thắng, đánh dấu biến mất bị xóa + clear cache chapter', async () => {
    seedLocal()
    folderTypeStore.set('M2', { folderId: 'M2', type: 'group', markedAt: 500 })

    const result = await applySync(
      payload({
        libraries: [lib('F1', 'Kho một', 100)],
        marks: [mark('M1', 'story', 3000)], // M2 không có trong payload → xóa
      }),
    )

    expect(result.changed).toBe(true)
    expect(folderTypeStore.size).toBe(1)
    expect(folderTypeStore.get('M1')?.markedAt).toBe(3000)
    expect(clearChaptersCache).toHaveBeenCalled()
  })

  it('payload trùng local → changed = false, không đụng gì', async () => {
    seedLocal()

    const result = await applySync(
      payload({
        libraries: [lib('F1', 'Kho một', 100)],
        marks: [mark('M1', 'story', 1000)],
        progress: [progress('F1', 'S1', 1000, 'c10')],
      }),
    )

    expect(result.changed).toBe(false)
    expect(result.progressChanged).toBe(false)
    expect(clearChaptersCache).not.toHaveBeenCalled()
  })
})
