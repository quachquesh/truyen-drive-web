import { defineStore } from 'pinia'

import { listChildren } from '@/lib/driveApi'
import {
  deleteLibrary as dbDeleteLibrary,
  getLibraries,
  putLibrary,
  type LibraryConfig,
} from '@/lib/db'
import { parseFolderId } from '@/lib/folderUrl'

const ACTIVE_KEY = 'tdw-active-library'

function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? ''
  } catch {
    return ''
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
      }
      await putLibrary(lib)
      this.libraries = [...this.libraries, lib].sort((a, b) => a.createdAt - b.createdAt)
      if (!this.activeId) this.setActive(lib.id)
      return lib
    },

    async remove(id: string): Promise<void> {
      await dbDeleteLibrary(id)
      this.libraries = this.libraries.filter((lib) => lib.id !== id)
      if (this.activeId === id) {
        const next = this.libraries[0]
        this.setActive(next?.id ?? '')
      }
    },

    async rename(id: string, name: string): Promise<void> {
      const lib = this.libraries.find((item) => item.id === id)
      if (!lib) return
      lib.name = name.trim() || lib.name
      await putLibrary(lib)
    },

    setActive(id: string): void {
      this.activeId = id
      try {
        if (id) localStorage.setItem(ACTIVE_KEY, id)
        else localStorage.removeItem(ACTIVE_KEY)
      } catch {
        // private mode — bỏ qua
      }
    },
  },
})
