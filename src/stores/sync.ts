import { acceptHMRUpdate, defineStore } from 'pinia'

import {
  apiHasToken,
  downloadSyncFile,
  findSyncFile,
  toErrorMessage,
  uploadSyncFile,
} from '@/lib/driveApi'
import { putTombstone } from '@/lib/db'
import {
  applySync,
  mergeSync,
  parseSyncPayload,
  payloadsEqual,
  snapshotLocal,
  WIPE_PROGRESS_KEY,
} from '@/lib/sync'
import { useLibraryStore, readActiveUpdatedAt } from './library'
import { useStoriesStore } from './stories'

const ENABLED_KEY = 'tdw-sync-enabled'
/** Sau thay đổi cục bộ, chờ hơi rồi mới push (gom các thay đổi liên tiếp). */
const PUSH_DEBOUNCE_MS = 15_000
/** Giới hạn tối thiểu giữa 2 lần push để không spam Drive khi đọc liên tục. */
const PUSH_MIN_INTERVAL_MS = 60_000

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

/** Flush tiến độ khi tab bị ẩn — chỉ cần wire 1 lần cho cả app. */
let visibilityWired = false
function ensureVisibilityWired(): void {
  if (visibilityWired || typeof document === 'undefined') return
  visibilityWired = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') useSyncStore().flushPush()
  })
}

/**
 * Đồng bộ đa thiết bị: pull + merge + apply + push qua appDataFolder.
 * Sync chạy sau khi đăng nhập xong và mỗi khi dữ liệu local đổi (debounce).
 */
export const useSyncStore = defineStore('sync', {
  state: () => ({
    enabled: readEnabled(),
    status: 'idle' as 'idle' | 'syncing' | 'synced' | 'error',
    /** Thời điểm (epoch ms) chu trình sync cuối cùng thành công */
    lastSyncAt: 0,
    error: '',
    /** FileId của file đồng bộ trên Drive — nhớ lại để khỏi tìm mỗi lần */
    remoteFileId: '',
    lastPushAt: 0,
    syncing: false,
    pushTimer: undefined as number | undefined,
  }),

  actions: {
    /** Chu trình đầy đủ: pull remote → merge → apply local → push nếu đổi. */
    async syncNow(): Promise<void> {
      ensureVisibilityWired()
      if (!this.enabled || !apiHasToken() || this.syncing) return
      this.syncing = true
      this.status = 'syncing'
      this.error = ''
      try {
        const libraryStore = useLibraryStore()

        let fileId = this.remoteFileId || (await findSyncFile())
        let remote = null
        if (fileId) {
          remote = parseSyncPayload(await downloadSyncFile(fileId))
          if (!remote) {
            // File hỏng / khác version — dừng, KHÔNG push đè để bảo vệ dữ liệu
            this.status = 'error'
            this.error = 'File dữ liệu đồng bộ trên Drive bị hỏng hoặc khác version'
            return
          }
        }

        const local = await snapshotLocal({
          id: libraryStore.activeId,
          updatedAt: readActiveUpdatedAt(),
        })
        const merged = remote ? mergeSync(local, remote) : local
        const result = await applySync(merged)

        if (result.changed) {
          await libraryStore.load()
          useStoriesStore().marksLoaded = false
        }
        const active = libraryStore.libraries.find((lib) => lib.folderId === result.activeFolderId)
        if (active && active.id !== libraryStore.activeId) libraryStore.setActive(active.id)

        if (!remote || !payloadsEqual(merged, remote)) {
          const outgoing = { ...merged, updatedAt: Date.now() }
          fileId = await uploadSyncFile(fileId, JSON.stringify(outgoing))
          this.remoteFileId = fileId
          this.lastPushAt = Date.now()
        } else if (fileId) {
          this.remoteFileId = fileId
        }
        this.lastSyncAt = Date.now()
        this.status = 'synced'
      } catch (error) {
        this.status = 'error'
        this.error = toErrorMessage(error)
      } finally {
        this.syncing = false
      }
    },

    /** Đánh dấu có thay đổi local → push sau debounce (không chắn việc đọc). */
    schedulePush(): void {
      if (!this.enabled || !apiHasToken()) return
      ensureVisibilityWired()
      window.clearTimeout(this.pushTimer)
      const wait = Math.max(PUSH_DEBOUNCE_MS, this.lastPushAt + PUSH_MIN_INTERVAL_MS - Date.now())
      this.pushTimer = window.setTimeout(() => {
        this.pushTimer = undefined
        void this.syncNow()
      }, wait)
    },

    /** Đẩy NGAY không chờ debounce — gọi khi tab sắp bị ẩn. */
    flushPush(): void {
      if (this.pushTimer === undefined) return
      window.clearTimeout(this.pushTimer)
      this.pushTimer = undefined
      void this.syncNow()
    },

    /** Ghi tombstone "đã xóa toàn bộ tiến trình" để các máy khác cũng xóa. */
    async noteProgressWipe(): Promise<void> {
      await putTombstone(WIPE_PROGRESS_KEY, Date.now())
      this.schedulePush()
    },

    setEnabled(value: boolean): void {
      this.enabled = value
      try {
        localStorage.setItem(ENABLED_KEY, String(value))
      } catch {
        // private mode
      }
      if (value) void this.syncNow()
      else window.clearTimeout(this.pushTimer)
    },

    /** Đăng xuất — hủy timer, lần đăng nhập sau sync lại từ đầu. */
    reset(): void {
      window.clearTimeout(this.pushTimer)
      this.pushTimer = undefined
      this.status = 'idle'
      this.error = ''
      this.lastSyncAt = 0
      this.lastPushAt = 0
      this.remoteFileId = ''
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSyncStore, import.meta.hot))
}
