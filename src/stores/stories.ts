import { acceptHMRUpdate, defineStore } from 'pinia'

import { pooledMap } from '@/lib/concurrency'
import { DRIVE_CONCURRENCY, toErrorMessage } from '@/lib/driveApi'
import {
  deleteChaptersCaches,
  deleteFolderType,
  findChaptersCacheOwners,
  getCache,
  getFolderTypes,
  putFolderType,
  putTombstone,
  setCache,
} from '@/lib/db'
import {
  fetchNewChapters,
  latestIso,
  listStories,
  parseChaptersCache,
  refreshStoryDates,
  scanStories,
  scanStory,
  walkLibrary,
  type ChapterRef,
  type GroupRef,
  type StoryScanResult,
  type StorySummary,
} from '@/lib/scanner'
import { markTombstoneKey } from '@/lib/sync'
import { useLibraryStore } from './library'
import { useSyncStore } from './sync'

const storiesKey = (libId: string): string => `stories:${libId}`
const chaptersKey = (storyId: string): string => `chapters:${storyId}`
const folderKey = (folderId: string): string => `folder:${folderId}`

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
 * - list truyện: cache IndexedDB trước, gọi mạng chỉ khi force / chưa có;
 *   khi phải gọi thì chỉ 1 request lấy danh sách — card hiện ngay, không chờ quét
 * - cache chapter: quét hợp nhất 1 lượt khi lạnh (walkStories), còn tươi thì
 *   dùng ngay, cũ hơn lastModified thì chỉ lấy PHẦN MỚI (fetchNewChapters)
 * - KHÔNG tự động quét chapter — chỉ folder nào được USER đánh dấu là truyện
 *   (marks) mới quét, counts hiện dần theo từng tầng
 * - folder chưa đánh dấu: hiện "Chưa phân loại", bấm vào xem nội dung để quyết định
 * - đánh dấu "list" (danh sách nhiều truyện) chỉ là nhãn — không ảnh hưởng quét
 */
export const useStoriesStore = defineStore('stories', {
  state: () => ({
    libId: '',
    /** Cache key của view đang mở (stories:… / folder:…) — đổi view là reset danh sách */
    viewKey: '',
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
    /** storyId → các nhóm đã đánh dấu gặp khi quét subtree (để Hủy nhóm trong StoryPage) */
    groupsByStory: {} as Record<string, GroupRef[]>,
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
      this.libId = libId
      // libId là UUID nội bộ — phải tra folderId Drive tương ứng trong library store
      const libraryStore = useLibraryStore()
      const folderId = libraryStore.libraries.find((lib) => lib.id === libId)?.folderId
      if (!folderId) {
        this.listError = 'Không tìm thấy kho truyện (đã bị xóa?)'
        this.listLoading = false
        return
      }
      await this.openListing(storiesKey(libId), folderId, options)
    },

    /** Mở 1 folder bên trong kho như danh sách truyện (FolderPage) — cùng luồng openLibrary. */
    async openFolder(
      libId: string,
      folderId: string,
      options: { force?: boolean } = {},
    ): Promise<void> {
      this.libId = libId
      await this.openListing(folderKey(folderId), folderId, options)
    },

    /**
     * Luồng mở danh sách truyện dùng chung (kho hoặc folder): cache IndexedDB
     * trước — có cache ngày là Làm mới chỉ lấy phần thay đổi; không thì 1
     * request lấy danh sách (hiện card ngay) rồi quét hợp nhất ngầm.
     */
    async openListing(
      cacheKey: string,
      rootFolderId: string,
      options: { force?: boolean } = {},
    ): Promise<void> {
      const gen = ++this.gen
      // Đổi view (kho khác / folder khác) → xóa danh sách cũ; Làm mới cùng view → giữ
      if (this.viewKey !== cacheKey) this.stories = []
      this.viewKey = cacheKey
      this.counts = {}
      this.latest = {}
      this.scanning = {}
      this.scanErrors = {}
      this.listError = ''
      this.listLoading = true

      await this.loadMarks()

      // Mảng RAW từ scanner — cache bắt buộc ghi bản này: IndexedDB serialize bằng
      // structured clone, KHÔNG chấp nhận reactive proxy của Pinia (DataCloneError)
      let freshStories: StorySummary[] | null = null
      /** lastModified cũ theo id — có khi Làm mới (force) để đi đường incremental */
      let knownDates: Map<string, string> | null = null
      try {
        let staleCache = false
        // Đọc cache trước cả khi force — cần mốc cũ cho incremental
        const cached = await getCache<StorySummary[]>(cacheKey)
        if (gen !== this.gen) return
        if (cached) {
          if (options.force) {
            if (cached.data.every((story) => story.lastModified !== undefined)) {
              knownDates = new Map(
                cached.data.map((story) => [story.id, story.lastModified as string]),
              )
            }
          } else {
            this.stories = cached.data
            // Cache viết trước khi có modifiedTime/lastModified (thiếu field) → lấy lại 1 lần cho đủ
            staleCache = cached.data.some(
              (story) => story.modifiedTime === undefined || story.lastModified === undefined,
            )
          }
        }

        if (options.force || staleCache || this.stories.length === 0) {
          // Bước 1: 1 request lấy danh sách → hiện card NGAY, không chờ quét sâu
          freshStories = await listStories(rootFolderId)
          if (gen !== this.gen) return
          this.stories = freshStories
          this.listLoading = false
          await setCache(cacheKey, freshStories)
        } else {
          this.listLoading = false
        }
      } catch (error) {
        if (gen !== this.gen) return
        this.listError = toErrorMessage(error)
        this.listLoading = false
        return
      }

      if (gen !== this.gen) return

      // Danh sách đã hiển thị — phần sau chỉ là metadata/chapter: lỗi phải được
      // nhìn thấy ở console thay vì bị nuốt im lặng (đã từng mất cache ngày vì thế)
      try {
        if (!freshStories) {
          // Warm: danh sách từ cache — 0 request danh sách, chỉ chapter incremental
          await this.refreshMarkedChapters(this.stories, gen)
          return
        }

        if (knownDates) {
          // Làm mới: gắn ngày cũ vào danh sách mới rồi chỉ lấy PHẦN THAY ĐỔI —
          // ~vài request nhỏ thay vì quét lại toàn kho
          for (const story of freshStories) story.lastModified = knownDates.get(story.id)
          const toWalk = freshStories.filter((story) => story.lastModified === undefined)
          try {
            const changed = await refreshStoryDates(freshStories)
            if (gen !== this.gen) return
            for (const [storyId, lastModified] of changed) {
              const story = freshStories.find((item) => item.id === storyId)
              if (story) story.lastModified = lastModified
            }
          } catch (error) {
            // Incremental lỗi (mạng/quota) → fallback quét full như cũ
            console.error('[stories] Làm mới incremental lỗi — quét lại toàn bộ', error)
            toWalk.length = 0
            toWalk.push(...freshStories)
          }
          // Truyện mới xuất hiện trong kho → quét hợp nhất full cho phần đó
          await this.walkStories(toWalk, gen)
          if (gen !== this.gen) return
          // Truyện đánh dấu có ngày mới hơn chapter cache → fetchNewChapters
          await this.refreshMarkedChapters(this.stories, gen)
        } else {
          // Cold thật (chưa có cache / xóa danh sách đã lưu): quét hợp nhất đầy đủ
          await this.walkStories(freshStories, gen)
          if (gen !== this.gen) return
        }
        await setCache(cacheKey, freshStories)
      } catch (error) {
        console.error('[stories] lỗi hậu kỳ openLibrary (không chặn danh sách)', error)
      }
    },

    /**
     * Bước 2 của mở thư mục (LibraryPage lạnh/làm mới, FolderPage): quét hợp
     * nhất qua walkLibrary — patch `lastModified` tiến triển trực tiếp vào
     * các object story (UI hiện dần), ghi cache chapter + counts/latest cho
     * truyện đánh dấu. Ngày là metadata phụ: lỗi quét → fallback
     * lastModified = modifiedTime, không chặn danh sách.
     */
    async walkStories(stories: StorySummary[], gen: number): Promise<void> {
      if (stories.length === 0) return
      const marked = stories.filter((story) => this.marks[story.id])
      for (const story of marked) this.scanning[story.id] = true

      try {
        const result = await walkLibrary(stories, {
          markedStoryIds: new Set(marked.map((story) => story.id)),
          groupMarks: this.groupMarkSet(),
          onDates: (latest) => {
            if (gen !== this.gen) return
            for (const story of stories) {
              const lastModified = latest.get(story.id)
              if (lastModified !== undefined) story.lastModified = lastModified
            }
          },
          onLevelDone: (counts) => {
            if (gen !== this.gen) return
            for (const [storyId, count] of counts) this.counts[storyId] = count
          },
        })
        if (gen !== this.gen) return
        for (const [storyId, chapters] of result.chapters) {
          const groups = result.groups.get(storyId) ?? []
          await setCache(chaptersKey(storyId), { chapters, groups })
          if (gen !== this.gen) return
          this.counts[storyId] = chapters.length
          this.latest[storyId] = chapters[chapters.length - 1]?.name ?? ''
          this.groupsByStory[storyId] = groups
        }
      } catch {
        for (const story of stories) story.lastModified = story.modifiedTime
      } finally {
        if (gen === this.gen) {
          for (const story of marked) this.scanning[story.id] = false
        }
      }
    },

    /**
     * Điền counts/latest cho các folder USER đã xác nhận là truyện trong
     * `stories` (list truyện từ CACHE — phải kèm `lastModified` tươi):
     * - cache chapter còn tươi → dùng ngay (0 request)
     * - cũ hơn lastModified (owner vừa thêm/sửa chap) → fetchNewChapters:
     *   chỉ lấy phần mới hơn mốc cache (1 request/truyện, chạy song song)
     * - chưa có cache / cache cũ thiếu modifiedTime → quét full batch
     */
    async refreshMarkedChapters(stories: StorySummary[], gen: number): Promise<void> {
      const marked = stories.filter((story) => this.marks[story.id])
      const incremental: Array<{ story: StorySummary; cached: ChapterRef[]; groups: GroupRef[] }> =
        []
      const uncached: StorySummary[] = []
      for (const story of marked) {
        const cached = await getCache<StoryScanResult>(chaptersKey(story.id))
        const record = cached ? parseChaptersCache(cached.data) : null
        if (record && isChaptersCacheFresh(record.chapters, story)) {
          this.counts[story.id] = record.chapters.length
          this.latest[story.id] = record.chapters[record.chapters.length - 1]?.name ?? ''
          this.groupsByStory[story.id] = record.groups
        } else if (
          record &&
          !record.chapters.some((chapter) => chapter.modifiedTime === undefined)
        ) {
          incremental.push({ story, cached: record.chapters, groups: record.groups })
        } else {
          uncached.push(story)
        }
      }

      const all = [...incremental.map((entry) => entry.story), ...uncached]
      if (all.length === 0) return
      for (const story of all) this.scanning[story.id] = true

      try {
        const merged = await pooledMap(
          incremental,
          async ({ story, cached, groups }) => {
            try {
              const chapters = await fetchNewChapters(story.id, cached, {
                groupMarks: this.groupMarkSet(),
              })
              return { story, chapters, groups, error: '' }
            } catch (error) {
              // Lỗi mạng riêng truyện — không throw để truyện khác vẫn chạy
              return { story, chapters: null, groups, error: toErrorMessage(error) }
            }
          },
          DRIVE_CONCURRENCY,
        )
        if (gen !== this.gen) return

        const fullScan = [...uncached]
        for (const { story, chapters, groups, error } of merged) {
          if (chapters === null) {
            if (error) this.scanErrors[story.id] = error
            // fetchNewChapters trả null (cache không merge được) → quét full
            else fullScan.push(story)
            continue
          }
          // Incremental không gặp lại nhóm cũ → giữ nguyên groups từ cache
          await setCache(chaptersKey(story.id), { chapters, groups })
          this.counts[story.id] = chapters.length
          this.latest[story.id] = chapters[chapters.length - 1]?.name ?? ''
          this.groupsByStory[story.id] = groups
        }

        if (fullScan.length === 0) return
        const results = await scanStories(fullScan, {
          groupMarks: this.groupMarkSet(),
          onLevelDone: (counts) => {
            if (gen !== this.gen) return
            for (const [storyId, count] of counts) this.counts[storyId] = count
          },
        })
        if (gen !== this.gen) return
        for (const [storyId, scan] of results) {
          await setCache(chaptersKey(storyId), scan)
          this.counts[storyId] = scan.chapters.length
          this.latest[storyId] = scan.chapters[scan.chapters.length - 1]?.name ?? ''
          this.groupsByStory[storyId] = scan.groups
        }
      } catch (error) {
        if (gen === this.gen) {
          for (const story of all) this.scanErrors[story.id] = toErrorMessage(error)
        }
      } finally {
        if (gen === this.gen) {
          for (const story of all) this.scanning[story.id] = false
        }
      }
    },

    /** USER xác nhận folder là truyện → lưu đánh dấu + quét TƯƠI ngay (force). */
    async markAsStory(folderId: string): Promise<void> {
      if (this.marks[folderId]) return
      // Đánh dấu đổi ý nghĩa quét → vô hiệu mọi quét đang chạy (giữ snapshot
      // marks cũ, chạy xong sẽ ghi đè cache/counts bằng danh sách cũ)
      this.gen++
      this.scanning = {}
      await putFolderType({ folderId, type: 'story', markedAt: Date.now() })
      this.marks[folderId] = 'story'
      // Record ghi đè loại cũ (group/list) → dọn map tương ứng khỏi stale
      delete this.groups[folderId]
      delete this.lists[folderId]
      useSyncStore().schedulePush()
        // Cache cũ có thể là snapshot trước khi owner thêm chap mới → bỏ qua, quét lại
        void this.ensureChapters(this.libId, folderId, { force: true }).catch((error) => {
          console.error('[stories] quét sau khi đánh dấu lỗi', error)
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
     * Chỉ xóa cache của truyện chứa folder (owner nếu biết, không thì tìm qua
     * nội dung cache) — truyện khác không đổi hình dạng danh sách.
     */
    async markAsGroup(folderId: string, ownerStoryId?: string): Promise<void> {
      if (this.groups[folderId]) return
      // Nhóm mới đưa con lên cùng cấp → mọi quét đang chạy với groupMarks cũ
      // đều sai (chạy xong sẽ ghi đè cache/counts bằng danh sách cũ) → vô hiệu
      this.gen++
      this.scanning = {}
      await putFolderType({ folderId, type: 'group', markedAt: Date.now() })
      this.groups[folderId] = true
      await this.invalidateGroupOwners([folderId], ownerStoryId)
      useSyncStore().schedulePush()
    },

    async unmarkGroup(folderId: string): Promise<void> {
      await this.unmarkGroups([folderId])
    },

    /** Bỏ đánh dấu TẤT CẢ nhóm của 1 truyện (nút "Hủy nhóm" trong StoryPage). */
    async unmarkGroups(folderIds: string[], ownerStoryId?: string): Promise<void> {
      if (folderIds.length === 0) return
      // Bỏ nhóm cũng đổi hình dạng danh sách → vô hiệu quét đang chạy như markAsGroup
      this.gen++
      this.scanning = {}
      for (const folderId of folderIds) {
        await deleteFolderType(folderId)
        await putTombstone(markTombstoneKey(folderId), Date.now())
        delete this.groups[folderId]
      }
      await this.invalidateGroupOwners(folderIds, ownerStoryId)
      useSyncStore().schedulePush()
    },

    /**
     * Xóa cache chapter + groupsByStory của đúng các truyện bị (bỏ) nhóm ảnh
     * hưởng: owner truyền vào (nếu biết) hợp với các cache nhắc tới folder.
     */
    async invalidateGroupOwners(folderIds: string[], ownerStoryId?: string): Promise<void> {
      const owners = await findChaptersCacheOwners(folderIds)
      if (ownerStoryId) owners.add(ownerStoryId)
      await deleteChaptersCaches([...owners])
      for (const storyId of owners) delete this.groupsByStory[storyId]
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
        const cached = await getCache<StoryScanResult>(chaptersKey(storyId))
        const record = cached ? parseChaptersCache(cached.data) : null
        // Cache cũ (bare array) hoặc thiếu modifiedTime → quét lại 1 lần cho đủ
        if (record && record.chapters.every((chapter) => chapter.modifiedTime !== undefined)) {
          if (myGen === this.gen) {
            this.counts[storyId] = record.chapters.length
            this.latest[storyId] = record.chapters[record.chapters.length - 1]?.name ?? ''
            this.groupsByStory[storyId] = record.groups
          }
          return record.chapters
        }
      }

      if (myGen === this.gen) this.scanning[storyId] = true
      try {
        const { chapters, groups } = await scanStory(storyId, {
          groupMarks: this.groupMarkSet(),
          onChapterFound: (count) => {
            if (myGen === this.gen) this.counts[storyId] = count
          },
        })
        await setCache(chaptersKey(storyId), { chapters, groups })
        if (myGen === this.gen) {
          this.counts[storyId] = chapters.length
          this.latest[storyId] = chapters[chapters.length - 1]?.name ?? ''
          this.groupsByStory[storyId] = groups
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
