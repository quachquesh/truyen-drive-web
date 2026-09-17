import { acceptHMRUpdate, defineStore } from 'pinia'

import { toErrorMessage } from '@/lib/driveApi'
import {
  clearChaptersCache,
  deleteFolderType,
  getCache,
  getFolderTypes,
  putFolderType,
  putTombstone,
  setCache,
} from '@/lib/db'
import {
  latestIso,
  scanLibraryStories,
  scanStories,
  scanStory,
  type ChapterRef,
  type StorySummary,
} from '@/lib/scanner'
import { markTombstoneKey } from '@/lib/sync'
import { useLibraryStore } from './library'
import { useSyncStore } from './sync'

const storiesKey = (libId: string): string => `stories:${libId}`
const chaptersKey = (storyId: string): string => `chapters:${storyId}`

/**
 * Cache chapter dùng được khi đủ modifiedTime (đời cache cũ thiếu field) và
 * không cũ hơn ngày cập nhật của truyện — lastModified mới hơn chapter mới
 * nhất trong cache nghĩa là Drive vừa có chap mới (thêm/sửa) → phải quét lại.
 */
function isChaptersCacheFresh(chapters: ChapterRef[], story: StorySummary): boolean {
  if (chapters.some((chapter) => chapter.modifiedTime === undefined)) return false
  const cachedLatest = latestIso(...chapters.map((chapter) => chapter.modifiedTime))
  const storyTime = new Date(story.lastModified ?? story.modifiedTime ?? '').getTime()
  // Thiếu ngày để so (cache rỗng, Drive không trả ngày) → giữ cache như cũ
  if (cachedLatest === undefined || Number.isNaN(storyTime)) return true
  return storyTime <= new Date(cachedLatest).getTime()
}

/**
 * Trạng thái truyện của thư viện đang mở:
 * - list truyện: cache IndexedDB trước, gọi mạng chỉ khi force / chưa có
 * - cache chapter quét lại khi lastModified của truyện mới hơn chap mới nhất
 *   trong cache (owner thêm/sửa chap trên Drive) hoặc khi force
 * - KHÔNG tự động quét chapter — chỉ folder nào được USER đánh dấu là truyện
 *   (marks) mới quét (batch theo tầng, lấy mẫu nhóm), counts hiện dần
 * - folder chưa đánh dấu: hiện "Chưa phân loại", bấm vào xem nội dung để quyết định
 * - đánh dấu "list" (danh sách nhiều truyện) chỉ là nhãn — không ảnh hưởng quét
 */
export const useStoriesStore = defineStore('stories', {
  state: () => ({
    libId: '',
    stories: [] as StorySummary[],
    listLoading: false,
    listError: '',
    /** folderId → số chapter đã quét được */
    counts: {} as Record<string, number>,
    /** folderId → tên chapter mới nhất (sau sort tự nhiên) */
    latest: {} as Record<string, string>,
    /** folderId → đang quét */
    scanning: {} as Record<string, boolean>,
    scanErrors: {} as Record<string, string>,
    /** Đánh dấu "là truyện" của user: folderId → 'story' */
    marks: {} as Record<string, 'story'>,
    /** Đánh dấu "là nhóm chapter" của user: folderId → true */
    groups: {} as Record<string, true>,
    /** Đánh dấu "là danh sách nhiều truyện" của user: folderId → true */
    lists: {} as Record<string, true>,
    marksLoaded: false,
    /** scan đang chạy theo storyId — chống quét trùng */
    pendingScans: new Map<string, Promise<ChapterRef[]>>(),
    gen: 0,
  }),

  actions: {
    async loadMarks(): Promise<void> {
      if (this.marksLoaded) return
      const records = await getFolderTypes()
      const marks: Record<string, 'story'> = {}
      const groups: Record<string, true> = {}
      const lists: Record<string, true> = {}
      for (const record of records) {
        if (record.type === 'story') marks[record.folderId] = 'story'
        else if (record.type === 'group') groups[record.folderId] = true
        else lists[record.folderId] = true
      }
      this.marks = marks
      this.groups = groups
      this.lists = lists
      this.marksLoaded = true
    },

    groupMarkSet(): Set<string> {
      return new Set(Object.keys(this.groups))
    },

    async openLibrary(libId: string, options: { force?: boolean } = {}): Promise<void> {
      const gen = ++this.gen
      this.libId = libId
      this.stories = []
      this.counts = {}
      this.latest = {}
      this.scanning = {}
      this.scanErrors = {}
      this.listError = ''
      this.listLoading = true

      await this.loadMarks()

      // libId là UUID nội bộ — phải tra folderId Drive tương ứng trong library store
      const libraryStore = useLibraryStore()
      const folderId = libraryStore.libraries.find((lib) => lib.id === libId)?.folderId
      if (!folderId) {
        this.listError = 'Không tìm thấy kho truyện (đã bị xóa?)'
        this.listLoading = false
        return
      }

      try {
        let staleCache = false
        if (!options.force) {
          const cached = await getCache<StorySummary[]>(storiesKey(libId))
          if (gen !== this.gen) return
          if (cached) {
            this.stories = cached.data
            // Cache viết trước khi có modifiedTime/lastModified (thiếu field) → lấy lại 1 lần cho đủ
            staleCache = cached.data.some(
              (story) => story.modifiedTime === undefined || story.lastModified === undefined,
            )
          }
        }

        if (options.force || staleCache || this.stories.length === 0) {
          const stories = await scanLibraryStories(folderId, { groupMarks: this.groupMarkSet() })
          if (gen !== this.gen) return
          this.stories = stories
          await setCache(storiesKey(libId), stories)
        }
      } catch (error) {
        if (gen !== this.gen) return
        this.listError = toErrorMessage(error)
      } finally {
        if (gen === this.gen) this.listLoading = false
      }

      if (gen !== this.gen) return
      await this.refreshMarkedChapters(this.stories, gen)
    },

    /**
     * Điền counts/latest cho các folder USER đã xác nhận là truyện trong
     * `stories` (list truyện của LibraryPage hoặc folder con của FolderPage —
     * phải kèm `lastModified` tươi): cache chapter còn tươi thì dùng ngay,
     * cũ hơn lastModified (owner thêm/sửa chap) hoặc chưa có thì quét lại batch.
     */
    async refreshMarkedChapters(stories: StorySummary[], gen: number): Promise<void> {
      const marked = stories.filter((story) => this.marks[story.id])
      const uncached: StorySummary[] = []
      for (const story of marked) {
        const cached = await getCache<ChapterRef[]>(chaptersKey(story.id))
        if (cached && isChaptersCacheFresh(cached.data, story)) {
          this.counts[story.id] = cached.data.length
          this.latest[story.id] = cached.data[cached.data.length - 1]?.name ?? ''
        } else {
          uncached.push(story)
        }
      }

      if (uncached.length === 0) return
      for (const story of uncached) this.scanning[story.id] = true

      try {
        const results = await scanStories(uncached, {
          groupMarks: this.groupMarkSet(),
          onLevelDone: (counts) => {
            if (gen !== this.gen) return
            for (const [storyId, count] of counts) this.counts[storyId] = count
          },
        })
        if (gen !== this.gen) return
        for (const [storyId, chapters] of results) {
          await setCache(chaptersKey(storyId), chapters)
          this.counts[storyId] = chapters.length
          this.latest[storyId] = chapters[chapters.length - 1]?.name ?? ''
        }
      } catch (error) {
        if (gen === this.gen) {
          for (const story of uncached) this.scanErrors[story.id] = toErrorMessage(error)
        }
      } finally {
        if (gen === this.gen) {
          for (const story of uncached) this.scanning[story.id] = false
        }
      }
    },

    /** USER xác nhận folder là truyện → lưu đánh dấu + quét TƯƠI ngay (force). */
    async markAsStory(folderId: string): Promise<void> {
      if (this.marks[folderId]) return
      await putFolderType({ folderId, type: 'story', markedAt: Date.now() })
      this.marks[folderId] = 'story'
      // Record ghi đè loại cũ (group/list) → dọn map tương ứng khỏi stale
      delete this.groups[folderId]
      delete this.lists[folderId]
      useSyncStore().schedulePush()
      // Cache cũ có thể là snapshot trước khi owner thêm chap mới → bỏ qua, quét lại
      void this.ensureChapters(this.libId, folderId, { force: true }).catch(() => {
        // lỗi đã ghi vào scanErrors
      })
    },

    /** Bỏ đánh dấu (user đánh nhầm) — cache giữ lại, lần đánh dấu lại sẽ quét tươi (force). */
    async unmarkStory(folderId: string): Promise<void> {
      await deleteFolderType(folderId)
      // Tombstone để máy khác không khôi phục lại đánh dấu đã bỏ
      await putTombstone(markTombstoneKey(folderId), Date.now())
      delete this.marks[folderId]
      delete this.scanning[folderId]
      delete this.scanErrors[folderId]
      // counts/latest giữ tạm — folder trở lại "Chưa phân loại" trên UI
      useSyncStore().schedulePush()
    },

    /**
     * USER đánh dấu folder là NHÓM chapter → con bên trong được đưa lên cùng cấp.
     * Xóa cache chapter (không biết truyện nào chứa folder) → truyện sẽ quét lại.
     */
    async markAsGroup(folderId: string): Promise<void> {
      if (this.groups[folderId]) return
      await putFolderType({ folderId, type: 'group', markedAt: Date.now() })
      this.groups[folderId] = true
      await clearChaptersCache()
      useSyncStore().schedulePush()
    },

    async unmarkGroup(folderId: string): Promise<void> {
      await deleteFolderType(folderId)
      await putTombstone(markTombstoneKey(folderId), Date.now())
      delete this.groups[folderId]
      await clearChaptersCache()
      useSyncStore().schedulePush()
    },

    /**
     * USER đánh dấu folder là DANH SÁCH nhiều truyện → chỉ là nhãn phân loại,
     * không ảnh hưởng quét chapter nên KHÔNG xóa cache.
     */
    async markAsList(folderId: string): Promise<void> {
      if (this.lists[folderId]) return
      await putFolderType({ folderId, type: 'list', markedAt: Date.now() })
      this.lists[folderId] = true
      useSyncStore().schedulePush()
    },

    async unmarkList(folderId: string): Promise<void> {
      await deleteFolderType(folderId)
      await putTombstone(markTombstoneKey(folderId), Date.now())
      delete this.lists[folderId]
      useSyncStore().schedulePush()
    },

    /**
     * Lấy danh sách chapter của truyện: cache → quét. Dedupe để 2 nơi gọi
     * cùng lúc không quét đôi.
     */
    ensureChapters(
      libId: string,
      storyId: string,
      options: { force?: boolean; gen?: number } = {},
    ): Promise<ChapterRef[]> {
      if (options.force) return this.runScan(storyId, options.gen, true)

      const inFlight = this.pendingScans.get(storyId)
      if (inFlight) return inFlight

      const promise = this.runScan(storyId, options.gen, false).finally(() => {
        this.pendingScans.delete(storyId)
      })
      this.pendingScans.set(storyId, promise)
      return promise
    },

    async runScan(storyId: string, gen?: number, force = false): Promise<ChapterRef[]> {
      const myGen = gen ?? this.gen

      if (!force) {
        const cached = await getCache<ChapterRef[]>(chaptersKey(storyId))
        // Cache viết trước khi chapter có modifiedTime (thiếu field) → quét lại 1 lần cho đủ
        if (cached && cached.data.every((chapter) => chapter.modifiedTime !== undefined)) {
          if (myGen === this.gen) {
            this.counts[storyId] = cached.data.length
            this.latest[storyId] = cached.data[cached.data.length - 1]?.name ?? ''
          }
          return cached.data
        }
      }

      if (myGen === this.gen) this.scanning[storyId] = true
      try {
        const chapters = await scanStory(storyId, {
          groupMarks: this.groupMarkSet(),
          onChapterFound: (count) => {
            if (myGen === this.gen) this.counts[storyId] = count
          },
        })
        await setCache(chaptersKey(storyId), chapters)
        if (myGen === this.gen) {
          this.counts[storyId] = chapters.length
          this.latest[storyId] = chapters[chapters.length - 1]?.name ?? ''
        }
        return chapters
      } catch (error) {
        if (myGen === this.gen) this.scanErrors[storyId] = toErrorMessage(error)
        throw error
      } finally {
        if (myGen === this.gen) this.scanning[storyId] = false
      }
    },

    /** Tìm tên truyện từ list đang có trong memory (fallback khi vào URL trực tiếp). */
    storyName(storyId: string): string {
      return this.stories.find((story) => story.id === storyId)?.name ?? ''
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useStoriesStore, import.meta.hot))
}
