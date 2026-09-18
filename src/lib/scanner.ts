import { pooledMap } from './concurrency'
import {
  DRIVE_CONCURRENCY,
  listChildren,
  listChildrenGrouped,
  listNewChildren,
  type DriveItem,
} from './driveApi'
import { getCache, setCache } from './db'
import { naturalSort } from './naturalSort'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const PDF_MIME = 'application/pdf'

/** File đọc được trong folder chapter: ảnh hoặc PDF. */
export interface ChapterFile {
  id: string
  name: string
  mimeType: string
  /** Preview do Google render — fallback khi file bị chặn tải (view-only) */
  thumbnailLink?: string
}

/**
 * 1 chapter = folder lá trong cây thư mục của truyện.
 * Danh sách file (ảnh/PDF) KHÔNG lấy lúc quét — lấy khi mở chapter
 * (`ensureChapterFiles`) để response quét chỉ chứa folder.
 */
export interface ChapterRef {
  id: string
  name: string
  /** Ngày folder chapter sửa đổi cuối trên Drive (thường = ngày up chapter) */
  modifiedTime?: string
}

/**
 * Folder được USER đánh dấu là nhóm chapter — thu lại khi quét subtree của
 * truyện để biết NHÓM NÀO thuộc truyện nào (nhóm bị bung nên không xuất hiện
 * trong danh sách chapter).
 */
export interface GroupRef {
  id: string
  name: string
}

/** Kết quả quét chapter 1 truyện: danh sách chapter + các nhóm đã bung gặp trong subtree. */
export interface StoryScanResult {
  chapters: ChapterRef[]
  groups: GroupRef[]
}

/**
 * Đọc dữ liệu cache chapter `chapters:${storyId}`: bản mới là `{chapters, groups}`;
 * bản cũ (bare array, trước khi có nhóm) trả null để caller coi như MISS → quét
 * lại 1 lần cho đủ. Dùng chung cho store (runScan/refreshMarkedChapters) và
 * LibraryPage (applyLiveProgress) — KHÔNG đọc cache chapter chỗ nào không qua hàm này.
 */
export function parseChaptersCache(data: unknown): StoryScanResult | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const record = data as Partial<StoryScanResult>
  if (!Array.isArray(record.chapters)) return null
  return { chapters: record.chapters, groups: Array.isArray(record.groups) ? record.groups : [] }
}

/** Chapter + danh sách file đã resolve (image-mode hoặc pdf-mode). */
export interface ChapterWithFiles extends ChapterRef {
  files: ChapterFile[]
  isPdf: boolean
  /**
   * PDF "trọn bộ" nằm CÙNG ảnh trong chapter (ảnh vẫn là default vì lazy-load rẻ)
   * — null = không có PDF đi kèm hoặc chapter vốn PDF-only (dùng `files`).
   */
  pdfFile: ChapterFile | null
}

export interface StorySummary {
  id: string
  name: string
  /** Ngày folder được sửa đổi cuối trên Drive (RFC 3339) */
  modifiedTime?: string
  /**
   * Ngày cập nhật hiệu dụng = max(ngày folder, ngày con trực tiếp) — Drive
   * KHÔNG bump modifiedTime của folder cha khi thêm chap mới nên phải tự tính.
   */
  lastModified?: string
}

export interface ScanOptions {
  signal?: AbortSignal
  /** Gọi sau mỗi tầng quét với số chapter tạm tìm được của từng truyện */
  onLevelDone?: (counts: Map<string, number>) => void
  /** Folder USER đánh dấu là "nhóm chapter" → con của nó được đưa lên cùng cấp (đệ quy) */
  groupMarks?: Set<string>
}

const isImage = (item: DriveItem): boolean => item.mimeType.startsWith('image/')
const isPdf = (item: DriveItem): boolean => item.mimeType === PDF_MIME
const isFolder = (item: DriveItem): boolean => item.mimeType === FOLDER_MIME

const MAX_DEPTH = 8

/** ISO mới nhất trong các giá trị đưa vào (bỏ qua rỗng/lỗi parse); undefined nếu không có giá trị hợp lệ. */
export function latestIso(...times: Array<string | undefined>): string | undefined {
  let best: string | undefined
  let bestTime = Number.NEGATIVE_INFINITY
  for (const iso of times) {
    if (!iso) continue
    const time = new Date(iso).getTime()
    if (Number.isNaN(time)) continue
    if (time > bestTime) {
      best = iso
      bestTime = time
    }
  }
  return best
}

export interface WalkLibraryOptions {
  signal?: AbortSignal
  groupMarks?: Set<string>
  /** id truyện USER đã đánh dấu → quét chapter đầy đủ (mở rộng tầng nhóm) */
  markedStoryIds?: Set<string>
  /** Sau mỗi tầng: snapshot ngày cập nhật hiệu dụng tính đến giờ của mọi truyện */
  onDates?: (latest: Map<string, string | undefined>) => void
  /** Sau mỗi tầng: số chapter tạm tìm được của từng truyện ĐÁNH DẤU */
  onLevelDone?: (counts: Map<string, number>) => void
}

export interface WalkLibraryResult {
  /** storyId → ngày cập nhật hiệu dụng (đủ tầng nhóm với truyện đánh dấu) */
  lastModified: Map<string, string | undefined>
  /** storyId → danh sách chapter (chỉ có truyện được đánh dấu) */
  chapters: Map<string, ChapterRef[]>
  /** storyId → các nhóm đã đánh dấu gặp trong subtree (chỉ có truyện được đánh dấu) */
  groups: Map<string, GroupRef[]>
}

/**
 * Quét HỢP NHẤT 1 lượt duy nhất cho danh sách truyện vừa list, thay cho 2 lượt
 * riêng (annotate ngày + quét chapter) trước đây — không folder nào bị list 2 lần:
 * - `lastModified` cho MỌI truyện = max(ngày folder, ngày con trực tiếp) — Drive
 *   KHÔNG bump modifiedTime của folder cha khi thêm chap mới nên phải tự tính.
 * - Truyện ĐÁNH DẤU: danh sách chapter đầy đủ với đúng 1 cấp tự động + nhóm
 *   (đưa con nhóm lên cùng cấp như scanStories); chỉ subtree của truyện đánh
 *   dấu mới mở rộng tầng nhóm. Truyện chưa đánh dấu không descend — folder nhóm
 *   bị bump ngày khi thêm con nên max con trực tiếp vẫn phản ánh chap mới,
 *   còn chapter của truyện chưa đánh dấu thì không cần.
 *
 * Requests: 1 listing batch mỗi tầng cho toàn bộ folder đang mở rộng.
 */
export async function walkLibrary(
  stories: StorySummary[],
  options: WalkLibraryOptions = {},
): Promise<WalkLibraryResult> {
  const groupMarks = options.groupMarks ?? new Set<string>()
  const markedIds = options.markedStoryIds ?? new Set<string>()

  const latest = new Map<string, string | undefined>(
    stories.map((story) => [story.id, story.modifiedTime]),
  )
  const chaptersOf = new Map<string, ChapterRef[]>()
  const groupsOf = new Map<string, GroupRef[]>()
  const owner = new Map<string, string>()
  for (const story of stories) {
    chaptersOf.set(story.id, [])
    groupsOf.set(story.id, [])
    owner.set(story.id, story.id)
  }

  let toExpand: ExpandFolder[] = stories.map(
    (story) => ({ id: story.id, name: story.name, modifiedTime: story.modifiedTime }),
  )

  for (let depth = 0; depth < MAX_DEPTH && toExpand.length > 0; depth++) {
    const childrenMap = await listChildrenGrouped(
      toExpand.map((folder) => folder.id),
      { foldersOnly: true, signal: options.signal },
    )

    const nextLevel: ExpandFolder[] = []
    for (const folder of toExpand) {
      const storyId = owner.get(folder.id) ?? folder.id
      const marked = markedIds.has(storyId)
      const children = naturalSort(childrenMap.get(folder.id) ?? [], (child) => child.name)

      if (children.length === 0) {
        // Folder lá → chapter (truyện rỗng cũng tính 1 chapter để không mất truyện);
        // folder được đánh dấu nhóm thì kể cả rỗng cũng bỏ qua
        if (marked && !groupMarks.has(folder.id)) {
          chaptersOf
            .get(storyId)
            ?.push({ id: folder.id, name: folder.name, modifiedTime: folder.modifiedTime })
        }
        continue
      }

      for (const child of children) {
        latest.set(storyId, latestIso(latest.get(storyId), child.modifiedTime))
        if (owner.has(child.id)) continue
        owner.set(child.id, storyId)
        if (groupMarks.has(child.id)) {
          // Nhóm đã đánh dấu → bung con lên (tầng sau); chỉ cần với truyện đánh dấu
          if (marked) {
            nextLevel.push(child)
            groupsOf.get(storyId)?.push({ id: child.id, name: child.name })
          }
        } else if (marked) {
          chaptersOf
            .get(storyId)
            ?.push({ id: child.id, name: child.name, modifiedTime: child.modifiedTime })
        }
      }
    }

    toExpand = nextLevel
    options.onDates?.(new Map(latest))
    options.onLevelDone?.(currentCounts(stories.filter((story) => markedIds.has(story.id)), chaptersOf))
  }

  const chapters = new Map<string, ChapterRef[]>()
  const groups = new Map<string, GroupRef[]>()
  for (const story of stories) {
    if (!markedIds.has(story.id)) continue
    chapters.set(story.id, naturalSort(chaptersOf.get(story.id) ?? [], (chapter) => chapter.name))
    groups.set(story.id, groupsOf.get(story.id) ?? [])
  }
  return { lastModified: latest, chapters, groups }
}

/**
 * Lấy CHỈ phần chapter mới hơn mốc trong cache rồi merge — không list lại
 * toàn bộ truyện (q lọc `modifiedTime >` phía server). Folder NHÓM bị bump
 * ngày khi thêm con → quay về trong kết quả → lấy tiếp chap mới bên trong
 * (đệ quy theo groupMarks). Merge theo id: chapter mới thêm vào, chapter sửa
 * (đổi tên) cập nhật tại chỗ.
 *
 * Trả null khi không merge chắc chắn được (cache thiếu modifiedTime) — caller
 * quét full. Không phát hiện chapter bị XÓA/đưa đi nơi khác — bấm Làm mới
 * (force) để quét lại toàn bộ khi cần.
 */
export async function fetchNewChapters(
  storyId: string,
  cached: ChapterRef[],
  options: { groupMarks?: Set<string>; signal?: AbortSignal } = {},
): Promise<ChapterRef[] | null> {
  const groupMarks = options.groupMarks ?? new Set<string>()
  // Cache đời cũ thiếu modifiedTime ở chapter nào đó → mốc không tin được
  if (cached.some((chapter) => chapter.modifiedTime === undefined)) return null
  const threshold = latestIso(...cached.map((chapter) => chapter.modifiedTime))
  if (threshold === undefined) return null

  const chapters = new Map(cached.map((chapter) => [chapter.id, { ...chapter }]))
  let toExpand = [storyId]

  for (let depth = 0; depth < MAX_DEPTH && toExpand.length > 0; depth++) {
    const childrenMap = await listNewChildren(toExpand, threshold, {
      foldersOnly: true,
      signal: options.signal,
    })
    const nextLevel: string[] = []
    for (const folderId of toExpand) {
      for (const child of childrenMap.get(folderId) ?? []) {
        if (groupMarks.has(child.id)) {
          nextLevel.push(child.id)
        } else {
          chapters.set(child.id, {
            id: child.id,
            name: child.name,
            modifiedTime: child.modifiedTime,
          })
        }
      }
    }
    toExpand = nextLevel
  }

  return naturalSort([...chapters.values()], (chapter) => chapter.name)
}

/** Số cha mỗi request khi tính lại ngày incremental (payload nhỏ nhờ lọc mốc). */
const DATE_CHUNK = 24

/**
 * Tính lại ngày cập nhật hiệu dụng cho các truyện ĐÃ có `lastModified` —
 * chỉ lấy folder con MỚI HƠN mốc cũ (q lọc `modifiedTime >` phía server)
 * thay vì list lại toàn bộ con như walkLibrary. Dùng cho nút Làm mới.
 *
 * Truyện được sort theo mốc cũ rồi chunk liền nhau để mốc min của mỗi chunk
 * sát nhau (chunk toàn truyện lâu chưa cập nhật → trả về rỗng). Item cũ
 * hơn mốc riêng của truyện khác trong chunk quay về cũng vô hại — lấy max.
 *
 * Trả map id → lastModified MỚI, chỉ chứa truyện có phần mới hơn mốc cũ.
 * Request lỗi → throw để caller fallback quét full.
 */
export async function refreshStoryDates(
  stories: StorySummary[],
  options: { signal?: AbortSignal } = {},
): Promise<Map<string, string>> {
  const changed = new Map<string, string>()
  const eligible = [...stories]
    .filter((story) => story.lastModified !== undefined)
    .sort(
      (a, b) =>
        new Date(a.lastModified ?? 0).getTime() - new Date(b.lastModified ?? 0).getTime(),
    )

  const chunks: StorySummary[][] = []
  for (let i = 0; i < eligible.length; i += DATE_CHUNK) {
    chunks.push(eligible.slice(i, i + DATE_CHUNK))
  }

  await pooledMap(
    chunks,
    async (chunk) => {
      // Sau sort tăng dần, phần tử đầu chunk là mốc cũ nhất — lọc theo nó
      const threshold = chunk[0]!.lastModified!
      const childrenMap = await listNewChildren(
        chunk.map((story) => story.id),
        threshold,
        { foldersOnly: true, signal: options.signal },
      )
      for (const story of chunk) {
        const newest = latestIso(
          story.lastModified,
          ...(childrenMap.get(story.id) ?? []).map((child) => child.modifiedTime),
        )
        if (newest !== undefined && newest !== story.lastModified) changed.set(story.id, newest)
      }
    },
    DRIVE_CONCURRENCY,
  )

  return changed
}

/** Folder đang mở rộng khi quét (truyện hoặc nhóm) — mang theo ngày để đưa vào ChapterRef */
interface ExpandFolder {
  id: string
  name: string
  modifiedTime?: string
}

/**
 * Quét chapter của truyện — **tự động đúng 1 cấp**: danh sách chapter = các
 * folder con trực tiếp của truyện. Không suy diễn gì thêm.
 *
 * Folder được USER đánh dấu là nhóm (`groupMarks`, kiểu "0-80") → con bên trong
 * được đưa lên thay thế nó ở cùng cấp; nhóm lồng nhau mở rộng đệ quy theo đánh
 * dấu. Folder rỗng tính là 1 chapter (trừ khi được đánh dấu nhóm).
 *
 * Requests: 1 listing batch cho con trực tiếp mọi truyện + 1 listing mỗi tầng
 * nhóm đã đánh dấu.
 */
export async function scanStories(
  stories: StorySummary[],
  options: ScanOptions = {},
): Promise<Map<string, StoryScanResult>> {
  const chaptersOf = new Map<string, ChapterRef[]>()
  const groupsOf = new Map<string, GroupRef[]>()
  const owner = new Map<string, string>()
  const groupMarks = options.groupMarks ?? new Set<string>()

  for (const story of stories) {
    chaptersOf.set(story.id, [])
    groupsOf.set(story.id, [])
    owner.set(story.id, story.id)
  }

  let toExpand: ExpandFolder[] = stories.map(
    (story) => ({ id: story.id, name: story.name, modifiedTime: story.modifiedTime }),
  )

  for (let depth = 0; depth < MAX_DEPTH && toExpand.length > 0; depth++) {
    const childrenMap = await listChildrenGrouped(
      toExpand.map((folder) => folder.id),
      { foldersOnly: true, signal: options.signal },
    )

    const nextLevel: StorySummary[] = []
    for (const folder of toExpand) {
      const storyId = owner.get(folder.id) ?? folder.id
      const children = naturalSort(childrenMap.get(folder.id) ?? [], (child) => child.name)

      if (children.length === 0) {
        // Folder lá → chapter (truyện rỗng cũng tính 1 chapter để không mất truyện);
        // folder được đánh dấu nhóm thì kể cả rỗng cũng bỏ qua
        if (!groupMarks.has(folder.id)) {
          chaptersOf
            .get(storyId)
            ?.push({ id: folder.id, name: folder.name, modifiedTime: folder.modifiedTime })
        }
        continue
      }

      for (const child of children) {
        if (owner.has(child.id)) continue
        owner.set(child.id, storyId)
        if (groupMarks.has(child.id)) {
          // Nhóm đã đánh dấu → đưa con của nó lên (mở rộng tầng sau) + ghi lại
          nextLevel.push(child)
          groupsOf.get(storyId)?.push({ id: child.id, name: child.name })
        } else {
          chaptersOf
            .get(storyId)
            ?.push({ id: child.id, name: child.name, modifiedTime: child.modifiedTime })
        }
      }
    }

    toExpand = nextLevel
    options.onLevelDone?.(currentCounts(stories, chaptersOf))
  }

  const result = new Map<string, StoryScanResult>()
  for (const story of stories) {
    result.set(story.id, {
      chapters: naturalSort(chaptersOf.get(story.id) ?? [], (chapter) => chapter.name),
      groups: groupsOf.get(story.id) ?? [],
    })
  }
  return result
}

function currentCounts(
  stories: StorySummary[],
  chaptersOf: Map<string, ChapterRef[]>,
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const story of stories) counts.set(story.id, chaptersOf.get(story.id)?.length ?? 0)
  return counts
}

/** Quét 1 truyện (StoryPage / reader / làm mới 1 truyện). */
export async function scanStory(
  storyFolderId: string,
  options: {
    signal?: AbortSignal
    onChapterFound?: (count: number) => void
    groupMarks?: Set<string>
  } = {},
): Promise<StoryScanResult> {
  const result = await scanStories([{ id: storyFolderId, name: '' }], {
    signal: options.signal,
    groupMarks: options.groupMarks,
    onLevelDone: (counts) => {
      const count = counts.get(storyFolderId)
      if (count) options.onChapterFound?.(count)
    },
  })
  return result.get(storyFolderId) ?? { chapters: [], groups: [] }
}

// ---------- chapter files (lazy, chỉ lấy khi mở chapter) ----------

const chapterFilesKey = (chapterId: string): string => `chapterFiles:${chapterId}`

/**
 * Lấy danh sách file của chapter: cache IndexedDB trước, miss thì list folder
 * chapter (1 request) rồi cache. Ảnh thật (blob) vẫn do reader lazy-load.
 */
export async function ensureChapterFiles(
  chapterId: string,
  chapterName = '',
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<ChapterWithFiles> {
  if (!options.force) {
    const cached = await getCache<ChapterWithFiles>(chapterFilesKey(chapterId))
    // Cache viết trước khi có pdfFile (field undefined) và không phải PDF-only
    // → stale, lấy lại 1 lần cho đủ field
    if (cached && (cached.data.isPdf || cached.data.pdfFile !== undefined)) return cached.data
  }

  const children = await listChildren(chapterId, { signal: options.signal })
  const images = children.filter(isImage)
  const pdfs = naturalSort(children.filter(isPdf), (file) => file.name)
  const toChapterFile = (file: DriveItem): ChapterFile => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    thumbnailLink: file.thumbnailLink,
  })
  const files: ChapterFile[] = naturalSort(
    (images.length > 0 ? images : pdfs).map(toChapterFile),
    (file) => file.name,
  )

  const firstPdf = pdfs[0] ? toChapterFile(pdfs[0]) : null
  const chapter: ChapterWithFiles = {
    id: chapterId,
    name: chapterName,
    files,
    // Ưu tiên ảnh (lazy-load rẻ); chỉ PDF-mode khi không có ảnh nào
    isPdf: images.length === 0 && pdfs.length > 0,
    // Có ảnh + PDF trọn bộ đi kèm → PDF thành option "đọc dạng PDF" ở reader
    pdfFile: images.length > 0 ? firstPdf : null,
  }
  await setCache(chapterFilesKey(chapterId), chapter)
  return chapter
}

/**
 * Danh sách truyện = các folder con trực tiếp của kho, sort tự nhiên theo tên.
 * Chỉ 1 request — ngày cập nhật hiệu dụng và chapter do `walkLibrary` quét
 * thêm sau (render danh sách ngay không cần chờ).
 */
export async function listStories(
  libraryFolderId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StorySummary[]> {
  const children = await listChildren(libraryFolderId, { signal: options.signal })
  return naturalSort(
    children.filter(isFolder).map((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
    })),
    (story) => story.name,
  )
}
