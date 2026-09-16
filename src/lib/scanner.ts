import { listChildren, listChildrenGrouped, type DriveItem } from './driveApi'
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

/**
 * Điền `lastModified` cho từng truyện = ISO mới nhất giữa folder truyện và
 * các folder con trực tiếp; folder con được USER đánh dấu nhóm (`groupMarks`)
 * thì quét thêm bên trong (đệ quy theo tầng như scanStories) — nhờ vậy chap
 * mới nằm trong nhóm ("0-80") cũng bump được ngày.
 *
 * Request lỗi → fallback `lastModified = modifiedTime` (ngày cũ của folder) —
 * ngày chỉ là metadata phụ, không được phép chặn việc mở danh sách.
 */
export async function annotateLastModified(
  stories: StorySummary[],
  options: { groupMarks?: Set<string>; signal?: AbortSignal } = {},
): Promise<void> {
  if (stories.length === 0) return
  const groupMarks = options.groupMarks ?? new Set<string>()

  try {
    const latest = new Map<string, string | undefined>(
      stories.map((story) => [story.id, story.modifiedTime]),
    )
    let toExpand = stories.map((story) => ({ id: story.id, owner: story.id }))

    for (let depth = 0; depth < MAX_DEPTH && toExpand.length > 0; depth++) {
      const childrenMap = await listChildrenGrouped(
        toExpand.map((folder) => folder.id),
        { foldersOnly: true, signal: options.signal },
      )

      const nextLevel: Array<{ id: string; owner: string }> = []
      for (const folder of toExpand) {
        for (const child of childrenMap.get(folder.id) ?? []) {
          latest.set(folder.owner, latestIso(latest.get(folder.owner), child.modifiedTime))
          if (groupMarks.has(child.id)) nextLevel.push({ id: child.id, owner: folder.owner })
        }
      }
      toExpand = nextLevel
    }

    for (const story of stories) story.lastModified = latest.get(story.id) ?? story.modifiedTime
  } catch {
    for (const story of stories) story.lastModified = story.modifiedTime
  }
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
): Promise<Map<string, ChapterRef[]>> {
  const chaptersOf = new Map<string, ChapterRef[]>()
  const owner = new Map<string, string>()
  const groupMarks = options.groupMarks ?? new Set<string>()

  for (const story of stories) {
    chaptersOf.set(story.id, [])
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
          // Nhóm đã đánh dấu → đưa con của nó lên (mở rộng tầng sau)
          nextLevel.push(child)
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

  const result = new Map<string, ChapterRef[]>()
  for (const story of stories) {
    result.set(
      story.id,
      naturalSort(chaptersOf.get(story.id) ?? [], (chapter) => chapter.name),
    )
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
): Promise<ChapterRef[]> {
  const result = await scanStories([{ id: storyFolderId, name: '' }], {
    signal: options.signal,
    groupMarks: options.groupMarks,
    onLevelDone: (counts) => {
      const count = counts.get(storyFolderId)
      if (count) options.onChapterFound?.(count)
    },
  })
  return result.get(storyFolderId) ?? []
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

/** Danh sách truyện = các folder con trực tiếp của kho, sort tự nhiên theo tên. */
export async function scanLibraryStories(
  libraryFolderId: string,
  options: { signal?: AbortSignal; groupMarks?: Set<string> } = {},
): Promise<StorySummary[]> {
  const children = await listChildren(libraryFolderId, { signal: options.signal })
  const stories = naturalSort(
    children.filter(isFolder).map((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
    })),
    (story) => story.name,
  )
  await annotateLastModified(stories, options)
  return stories
}
