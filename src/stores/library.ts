import { acceptHMRUpdate, defineStore } from 'pinia'

import { listChildren } from '@/lib/driveApi'
import {
  deleteLibrary as dbDeleteLibrary,
  getLibraries,
  putLibrary,
  putTombstone,
  type LibraryConfig,
} from '@/lib/db'
import { parseFolderId } from '@/lib/folderUrl'
import { libTombstoneKey } from '@/lib/sync'
import { useSyncStore } from './sync'

const ACTIVE_KEY = 'tdw-active-library'
/** Thời điểm đổi kho đang chọn — mốc last-write-wins khi đồng bộ đa thiết bị */
const ACTIVE_AT_KEY = 'tdw-active-updated-at'

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? ''
  } catch {
    return ''
  }
}

export function readActiveUpdatedAt(): number {
  try {
    return Number(localStorage.getItem(ACTIVE_AT_KEY)) || 0
  } catch {
    return 0
  }
}

function writeActiveUpdatedAt(): void {
  try {
    localStorage.setItem(ACTIVE_AT_KEY, String(Date.now()))
  } catch {
    // private mode
  }
}

export const useLibraryStore = defineStore('library', {
  state: () => ({
    libraries: [] as LibraryConfig[],
    loaded: false,
    loading: false,
    activeId: readActiveId(),
    managerVisible: false,
  }),

  getters: {
    active: (state): LibraryConfig | undefined =>
      state.libraries.find((lib) => lib.id === state.activeId),
  },

  actions: {
    openManager(): void {
      this.managerVisible = true
    },

    closeManager(): void {
      this.managerVisible = false
    },

    async load(): Promise<void> {
      if (this.loading) return
      this.loading = true
      try {
        this.libraries = await getLibraries()
        this.loaded = true
        if (this.activeId && !this.libraries.some((lib) => lib.id === this.activeId)) {
          this.activeId = ''
        }
      } finally {
        this.loading = false
      }
    },

    /**
     * Thêm kho: name + folder URL/ID. Validate bằng cách list folder
     * (bắt 403/404 sớm) trước khi lưu.
     */
    async add(name: string, folderInput: string): Promise<LibraryConfig> {
      const folderId = parseFolderId(folderInput)
      if (!folderId) throw new Error('URL / ID folder Google Drive không hợp lệ')

      // Validate quyền truy cập + folder tồn tại
      await listChildren(folderId)

      const lib: LibraryConfig = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Kho truyện',
        folderId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      await putLibrary(lib)
      this.libraries = [...this.libraries, lib].sort((a, b) => a.createdAt - b.createdAt)
      if (!this.activeId) this.setActive(lib.id)
      useSyncStore().schedulePush()
      return lib
    },

    async remove(id: string): Promise<void> {
      const lib = this.libraries.find((item) => item.id === id)
      if (!lib) return
      // Tombstone để máy khác không "hồi sinh" kho đã xóa khi đồng bộ
      await putTombstone(libTombstoneKey(lib.folderId), Date.now())
      await dbDeleteLibrary(id)
      this.libraries = this.libraries.filter((item) => item.id !== id)
      if (this.activeId === id) {
        const next = this.libraries[0]
        this.setActive(next?.id ?? '')
      }
      useSyncStore().schedulePush()
    },

    async rename(id: string, name: string): Promise<void> {
      const lib = this.libraries.find((item) => item.id === id)
      if (!lib) return
      lib.name = name.trim() || lib.name
      lib.updatedAt = Date.now()
      await putLibrary(lib)
      useSyncStore().schedulePush()
    },

    setActive(id: string): void {
      if (id === this.activeId) return
      this.activeId = id
      writeActiveUpdatedAt()
      try {
        if (id) localStorage.setItem(ACTIVE_KEY, id)
        else localStorage.removeItem(ACTIVE_KEY)
      } catch {
        // private mode — bỏ qua
      }
      useSyncStore().schedulePush()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useLibraryStore, import.meta.hot))
}
