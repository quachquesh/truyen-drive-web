/**
 * Đồng bộ đa thiết bị qua Google Drive appDataFolder (file ẩn riêng của app).
 *
 * Chu trình: snapshot dữ liệu local (IndexedDB) → merge last-write-wins với
 * bản trên Drive → apply về IndexedDB → push bản merged lên Drive.
 *
 * Khóa ghép giữa các thiết bị là folderId Drive — id nội bộ (crypto.randomUUID)
 * mỗi máy khác nhau nên không đưa vào payload. Xóa một bản ghi phải ghi
 * tombstone kèm thời điểm, nếu không lần pull sau nó sẽ "hồi sinh" từ máy khác.
 */
import {
  clearChaptersCache,
  deleteFolderType,
  deleteLibrary as dbDeleteLibrary,
  deleteProgress,
  getAllProgress,
  getFolderTypes,
  getLibraries,
  getProgress,
  getTombstones,
  putFolderType,
  putLibrary,
  putProgress,
  type LibraryConfig,
} from './db'

export const SYNC_VERSION = 1
/** Tombstone cho thao tác "Xóa toàn bộ tiến trình đọc". */
export const WIPE_PROGRESS_KEY = 'wipe:progress'

export interface SyncLibrary {
  folderId: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface SyncMark {
  folderId: string
  type: 'story' | 'group'
  markedAt: number
}

export interface SyncProgress {
  folderId: string
  storyId: string
  chapterId: string
  chapterName: string
  /** 0..1 vị trí cuộn trong chapter */
  scrollPct: number
  /** 1-based — hiển thị "đang đọc 45/100" ngoài kho (máy cũ không có) */
  chapterNo?: number
  chapterTotal?: number
  updatedAt: number
}

export interface SyncPayload {
  version: number
  /** Thời điểm push cuối (epoch ms) */
  updatedAt: number
  /** Thời điểm "xóa toàn bộ tiến trình đọc" cuối (0 = chưa từng) */
  progressWipeAt: number
  libraries: SyncLibrary[]
  /** Kho đang chọn ('' nếu không có) — theo folderId Drive */
  activeFolderId: string
  activeUpdatedAt: number
  marks: SyncMark[]
  progress: SyncProgress[]
  /** `lib:${folderId}` | `mark:${folderId}` → thời điểm xóa */
  tombstones: Record<string, number>
}

export function libTombstoneKey(folderId: string): string {
  return `lib:${folderId}`
}

export function markTombstoneKey(folderId: string): string {
  return `mark:${folderId}`
}

export function emptyPayload(): SyncPayload {
  return {
    version: SYNC_VERSION,
    updatedAt: 0,
    progressWipeAt: 0,
    libraries: [],
    activeFolderId: '',
    activeUpdatedAt: 0,
    marks: [],
    progress: [],
    tombstones: {},
  }
}

/** Parse chuỗi JSON tải từ Drive — null nếu hỏng hoặc khác version (không ghi đè). */
export function parseSyncPayload(raw: string): SyncPayload | null {
  let data: Partial<SyncPayload>
  try {
    data = JSON.parse(raw) as Partial<SyncPayload>
  } catch {
    return null
  }
  if (data.version !== SYNC_VERSION) return null
  if (
    !Array.isArray(data.libraries) ||
    !Array.isArray(data.marks) ||
    !Array.isArray(data.progress)
  ) {
    return null
  }
  return {
    ...emptyPayload(),
    ...data,
    tombstones: data.tombstones && typeof data.tombstones === 'object' ? data.tombstones : {},
    progressWipeAt: data.progressWipeAt ?? 0,
    activeFolderId: data.activeFolderId ?? '',
    activeUpdatedAt: data.activeUpdatedAt ?? 0,
  }
}

/** Snapshot dữ liệu local. `active` lấy từ library store + localStorage. */
export async function snapshotLocal(active: {
  id: string
  updatedAt: number
}): Promise<SyncPayload> {
  const [libraries, progressRecords, marks, tombstones] = await Promise.all([
    getLibraries(),
    getAllProgress(),
    getFolderTypes(),
    getTombstones(),
  ])

  const idToFolder = new Map(libraries.map((lib) => [lib.id, lib.folderId]))
  const activeFolderId = idToFolder.get(active.id) ?? ''

  return {
    version: SYNC_VERSION,
    updatedAt: Date.now(),
    progressWipeAt: tombstones.find((item) => item.key === WIPE_PROGRESS_KEY)?.deletedAt ?? 0,
    libraries: libraries.map((lib) => ({
      folderId: lib.folderId,
      name: lib.name,
      createdAt: lib.createdAt,
      updatedAt: lib.updatedAt ?? lib.createdAt,
    })),
    activeFolderId,
    activeUpdatedAt: active.updatedAt,
    marks: marks.map((mark) => ({
      folderId: mark.folderId,
      type: mark.type,
      markedAt: mark.markedAt,
    })),
    progress: progressRecords.flatMap((record) => {
      // key local: `${libId}:${storyId}` — đổi sang folderId để ổn định giữa các máy
      const sep = record.key.indexOf(':')
      if (sep <= 0) return []
      const folderId = idToFolder.get(record.key.slice(0, sep))
      if (!folderId) return [] // progress của kho đã xóa local — bỏ khỏi payload
      return [
        {
          folderId,
          storyId: record.key.slice(sep + 1),
          chapterId: record.chapterId,
          chapterName: record.chapterName,
          scrollPct: record.scrollPct,
          chapterNo: record.chapterNo,
          chapterTotal: record.chapterTotal,
          updatedAt: record.updatedAt,
        },
      ]
    }),
    tombstones: Object.fromEntries(tombstones.map((item) => [item.key, item.deletedAt])),
  }
}

/**
 * Gộp 2 payload theo last-write-wins (pure function — dễ test):
 * - libraries/marks: union theo folderId, giữ stamp mới hơn; tombstone xóa sau
 *   lần sửa cuối thì thắng, sửa lại SAU khi bị xóa thì bản ghi sống lại
 * - progress: theo cặp folderId:storyId, record cũ hơn progressWipeAt bị bỏ
 * - active: bên đổi gần đây hơn thắng; folderId không còn → về kho đầu tiên
 */
export function mergeSync(local: SyncPayload, remote: SyncPayload): SyncPayload {
  const tombstones = { ...local.tombstones }
  for (const [key, at] of Object.entries(remote.tombstones)) {
    if (at > (tombstones[key] ?? 0)) tombstones[key] = at
  }

  const libraries = mergeByStamp(
    local.libraries,
    remote.libraries,
    (lib) => lib.folderId,
    (lib) => lib.updatedAt,
    (folderId) => tombstones[libTombstoneKey(folderId)] ?? 0,
  )
  const marks = mergeByStamp(
    local.marks,
    remote.marks,
    (mark) => mark.folderId,
    (mark) => mark.markedAt,
    (folderId) => tombstones[markTombstoneKey(folderId)] ?? 0,
  )
  const progressWipeAt = Math.max(local.progressWipeAt, remote.progressWipeAt)
  const progress = mergeByStamp(
    local.progress,
    remote.progress,
    (item) => `${item.folderId}:${item.storyId}`,
    (item) => item.updatedAt,
    () => 0,
  ).filter((item) => item.updatedAt > progressWipeAt)

  const activeFromLocal = local.activeUpdatedAt >= remote.activeUpdatedAt
  let activeFolderId = activeFromLocal ? local.activeFolderId : remote.activeFolderId
  if (activeFolderId && !libraries.some((lib) => lib.folderId === activeFolderId)) {
    activeFolderId = libraries[0]?.folderId ?? ''
  }

  return {
    version: SYNC_VERSION,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    progressWipeAt,
    libraries,
    activeFolderId,
    activeUpdatedAt: activeFromLocal ? local.activeUpdatedAt : remote.activeUpdatedAt,
    marks,
    progress,
    tombstones,
  }
}

/** Gộp 2 danh sách theo key; stamp mới hơn thắng (bằng nhau giữ bên local). */
function mergeByStamp<T>(
  local: T[],
  remote: T[],
  keyOf: (item: T) => string,
  stampOf: (item: T) => number,
  tombstoneOf: (key: string) => number,
): T[] {
  const byKey = new Map<string, T>()
  for (const item of [...local, ...remote]) {
    const key = keyOf(item)
    if (tombstoneOf(key) > stampOf(item)) continue // đã bị xóa sau lần sửa này
    const existing = byKey.get(key)
    if (!existing || stampOf(item) > stampOf(existing)) byKey.set(key, item)
  }
  return [...byKey.values()]
}

/** So sánh nội dung 2 payload (bỏ updatedAt — chỉ là thời điểm push). */
export function payloadsEqual(a: SyncPayload, b: SyncPayload): boolean {
  const norm = (payload: SyncPayload) => JSON.stringify({ ...payload, updatedAt: 0 })
  return norm(a) === norm(b)
}

export interface ApplyResult {
  /** folderId Drive của kho nên active sau khi apply */
  activeFolderId: string
  /** Có bản ghi local thực sự thay đổi (để store biết có cần refresh UI) */
  changed: boolean
  /** Tiến độ đọc thay đổi (ghi mới / xóa vì wipe) — để store bump progressRev */
  progressChanged: boolean
}

/** Ghi payload đã merge vào IndexedDB. KHÔNG đụng localStorage/timer — store lo phần đó. */
export async function applySync(payload: SyncPayload): Promise<ApplyResult> {
  const localLibs = await getLibraries()
  const byFolder = new Map(localLibs.map((lib) => [lib.folderId, lib]))
  const folderToId = new Map(localLibs.map((lib) => [lib.folderId, lib.id]))
  let changed = false
  let progressChanged = false

  // Kho bị xóa (tombstone/đã biến mất khỏi payload) → xóa local
  const keepFolders = new Set(payload.libraries.map((lib) => lib.folderId))
  for (const lib of localLibs) {
    if (!keepFolders.has(lib.folderId)) {
      await dbDeleteLibrary(lib.id)
      changed = true
    }
  }
  for (const item of payload.libraries) {
    const local = byFolder.get(item.folderId)
    if (!local) {
      const lib: LibraryConfig = {
        id: crypto.randomUUID(),
        name: item.name,
        folderId: item.folderId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }
      await putLibrary(lib)
      folderToId.set(lib.folderId, lib.id)
      changed = true
    } else if (item.updatedAt > (local.updatedAt ?? local.createdAt)) {
      await putLibrary({ ...local, name: item.name, updatedAt: item.updatedAt })
      changed = true
    }
  }

  // Đánh dấu story/group
  const localMarks = await getFolderTypes()
  const markByFolder = new Map(localMarks.map((mark) => [mark.folderId, mark]))
  const keepMarkFolders = new Set(payload.marks.map((mark) => mark.folderId))
  let marksChanged = false
  for (const mark of localMarks) {
    if (!keepMarkFolders.has(mark.folderId)) {
      await deleteFolderType(mark.folderId)
      marksChanged = true
    }
  }
  for (const mark of payload.marks) {
    const local = markByFolder.get(mark.folderId)
    if (!local || mark.markedAt > local.markedAt) {
      await putFolderType({ folderId: mark.folderId, type: mark.type, markedAt: mark.markedAt })
      marksChanged = true
    }
  }
  if (marksChanged) {
    // Đánh dấu nhóm ảnh hưởng cách quét chapter → xóa cache chapter cho chắc
    await clearChaptersCache()
    changed = true
  }

  // Tiến độ đọc: xóa record cũ hơn lần wipe, ghi record mới hơn local
  if (payload.progressWipeAt > 0) {
    for (const record of await getAllProgress()) {
      if (record.updatedAt < payload.progressWipeAt) {
        await deleteProgress(record.key)
        changed = true
        progressChanged = true
      }
    }
  }
  for (const item of payload.progress) {
    const libId = folderToId.get(item.folderId)
    if (!libId) continue // kho chưa có trên máy — giữ trong payload, đợi kho được thêm
    const key = `${libId}:${item.storyId}`
    const existing = await getProgress(key)
    if (!existing || item.updatedAt > existing.updatedAt) {
      await putProgress({
        key,
        chapterId: item.chapterId,
        chapterName: item.chapterName,
        scrollPct: item.scrollPct,
        chapterNo: item.chapterNo,
        chapterTotal: item.chapterTotal,
        updatedAt: item.updatedAt,
      })
      changed = true
      progressChanged = true
    }
  }

  return { activeFolderId: payload.activeFolderId, changed, progressChanged }
}
