import { defineStore } from 'pinia'

import { toErrorMessage } from '@/lib/driveApi'
import {
  clearChaptersCache,
  deleteFolderType,
  getCache,
  getFolderTypes,
  putFolderType,
  setCache,
} from '@/lib/db'
import {
  scanLibraryStories,
  scanStories,
  scanStory,
  type ChapterRef,
  type StorySummary,
} from '@/lib/scanner'
import { useLibraryStore } from './library'

const storiesKey = (libId: string): string => `stories:${libId}`
const chaptersKey = (storyId: string): string => `chapters:${storyId}`

/**
 * Trạng thái truyện của thư viện đang mở:
 * - list truyện: cache IndexedDB trước, gọi mạng chỉ khi force / chưa có
 * - KHÔNG tự động quét chapter — chỉ folder nào được USER đánh dấu là truyện
 *   (marks) mới quét (batch theo tầng, lấy mẫu nhóm), counts hiện dần
 * - folder chưa đánh dấu: hiện "Chưa phân loại", bấm vào xem nội dung để quyết định
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
      for (const record of records) {
        if (record.type === 'story') marks[record.folderId] = 'story'
        else groups[record.folderId] = true
      }
      this.marks = marks
      this.groups = groups
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
            // Cache viết trước khi có modifiedTime (thiếu field) → lấy lại 1 lần cho đủ
            staleCache = cached.data.some((story) => story.modifiedTime === undefined)
          }
        }

        if (options.force || staleCache || this.stories.length === 0) {
          const stories = await scanLibraryStories(folderId)
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
      await this.scanMarkedStories(gen)
    },

    /** Chỉ quét chapter các folder USER đã xác nhận là truyện (chưa có cache). */
    async scanMarkedStories(gen: number): Promise<void> {
      const marked = this.stories.filter((story) => this.marks[story.id])
      const uncached: StorySummary[] = []
      for (const story of marked) {
        const cached = await getCache<ChapterRef[]>(chaptersKey(story.id))
        if (cached) {
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

    /** USER xác nhận folder là truyện → lưu đánh dấu + quét chapter ngay. */
    async markAsStory(folderId: string): Promise<void> {
      if (this.marks[folderId]) return
      await putFolderType({ folderId, type: 'story', markedAt: Date.now() })
      this.marks[folderId] = 'story'
      void this.ensureChapters(this.libId, folderId).catch(() => {
        // lỗi đã ghi vào scanErrors
      })
    },

    /** Bỏ đánh dấu (user đánh nhầm) — cache giữ lại để lần sau đánh dấu lại là có ngay. */
    async unmarkStory(folderId: string): Promise<void> {
      await deleteFolderType(folderId)
      delete this.marks[folderId]
      delete this.scanning[folderId]
      delete this.scanErrors[folderId]
      // counts/latest giữ tạm — folder trở lại "Chưa phân loại" trên UI
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
    },

    async unmarkGroup(folderId: string): Promise<void> {
      await deleteFolderType(folderId)
      delete this.groups[folderId]
      await clearChaptersCache()
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
      if (options.force) return this.runScan(storyId, options.gen)

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
        if (cached) {
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
