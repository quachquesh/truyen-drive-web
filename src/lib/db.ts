import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export interface LibraryConfig {
  /** ID nội bộ của app (crypto.randomUUID) */
  id: string
  name: string
  /** Folder ID Google Drive của kho */
  folderId: string
  createdAt: number
}

export interface CacheRecord<T = unknown> {
  key: string
  data: T
  fetchedAt: number
}

export interface BlobRecord {
  fileId: string
  blob: Blob
  mimeType: string
  /** `${libraryId}:${storyId}` — để xóa cache ảnh theo truyện */
  storyKey: string
  fetchedAt: number
}

export interface ProgressRecord {
  /** `${libraryId}:${storyId}` */
  key: string
  chapterId: string
  chapterName: string
  /** 0..1 vị trí cuộn trong chapter */
  scrollPct: number
  updatedAt: number
}

/** Đánh dấu loại folder do USER quyết định (không auto-detect) */
export interface FolderTypeRecord {
  folderId: string
  /** 'story' = truyện (quét chapter con trực tiếp); 'group' = nhóm chapter (con được đưa lên cùng cấp) */
  type: 'story' | 'group'
  markedAt: number
}

interface TruyenDB extends DBSchema {
  libraries: { key: string; value: LibraryConfig }
  cache: { key: string; value: CacheRecord }
  blobs: { key: string; value: BlobRecord; indexes: { 'by-story': string } }
  progress: { key: string; value: ProgressRecord }
  folderTypes: { key: string; value: FolderTypeRecord }
}

const DB_NAME = 'truyen-drive-web'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<TruyenDB>> | null = null

function getDb(): Promise<IDBPDatabase<TruyenDB>> {
  dbPromise ??= openDB<TruyenDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('libraries', { keyPath: 'id' })
      db.createObjectStore('cache', { keyPath: 'key' })
      const blobs = db.createObjectStore('blobs', { keyPath: 'fileId' })
      blobs.createIndex('by-story', 'storyKey')
      db.createObjectStore('progress', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('folderTypes')) {
        db.createObjectStore('folderTypes', { keyPath: 'folderId' })
      }
    },
  })
  return dbPromise
}

// ---------- libraries ----------

export async function getLibraries(): Promise<LibraryConfig[]> {
  const db = await getDb()
  const all = await db.getAll('libraries')
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function putLibrary(lib: LibraryConfig): Promise<void> {
  const db = await getDb()
  await db.put('libraries', lib)
}

export async function deleteLibrary(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('libraries', id)
}

// ---------- cache (danh sách truyện / chapter / file) ----------

export async function getCache<T>(key: string): Promise<CacheRecord<T> | undefined> {
  const db = await getDb()
  return (await db.get('cache', key)) as CacheRecord<T> | undefined
}

export async function setCache<T>(key: string, data: T): Promise<void> {
  const db = await getDb()
  await db.put('cache', { key, data, fetchedAt: Date.now() } satisfies CacheRecord<T>)
}

export async function deleteCache(key: string): Promise<void> {
  const db = await getDb()
  await db.delete('cache', key)
}

export async function clearListCache(): Promise<void> {
  const db = await getDb()
  await db.clear('cache')
}

/** Xóa mọi cache danh sách chapter (khi (bỏ) đánh dấu nhóm — không biết truyện chứa folder). */
export async function clearChaptersCache(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('cache', 'readwrite')
  const store = tx.objectStore('cache')
  const keys = await store.getAllKeys()
  await Promise.all(
    keys.filter((key) => String(key).startsWith('chapters:')).map((key) => store.delete(key)),
  )
  await tx.done
}

// ---------- blobs (ảnh + PDF) ----------

export async function getBlob(fileId: string): Promise<BlobRecord | undefined> {
  const db = await getDb()
  return db.get('blobs', fileId)
}

export async function putBlob(record: BlobRecord): Promise<void> {
  const db = await getDb()
  await db.put('blobs', record)
}

export async function clearBlobs(): Promise<void> {
  const db = await getDb()
  await db.clear('blobs')
}

export async function clearBlobsByStory(storyKey: string): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('blobs', 'readwrite')
  const store = tx.objectStore('blobs')
  const keys = await store.index('by-story').getAllKeys(storyKey)
  await Promise.all(keys.map((key) => store.delete(key)))
  await tx.done
}

// ---------- progress ----------

export async function getProgress(key: string): Promise<ProgressRecord | undefined> {
  const db = await getDb()
  return db.get('progress', key)
}

export async function putProgress(record: ProgressRecord): Promise<void> {
  const db = await getDb()
  await db.put('progress', record)
}

export async function clearProgress(): Promise<void> {
  const db = await getDb()
  await db.clear('progress')
}

// ---------- folder types (đánh dấu của user) ----------

export async function getFolderTypes(): Promise<FolderTypeRecord[]> {
  const db = await getDb()
  return db.getAll('folderTypes')
}

export async function putFolderType(record: FolderTypeRecord): Promise<void> {
  const db = await getDb()
  await db.put('folderTypes', record)
}

export async function deleteFolderType(folderId: string): Promise<void> {
  const db = await getDb()
  await db.delete('folderTypes', folderId)
}

// ---------- storage ----------

export async function storageEstimate(): Promise<{ usage: number; quota: number }> {
  if (!navigator.storage?.estimate) return { usage: 0, quota: 0 }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

export async function clearAllCaches(): Promise<void> {
  await Promise.all([clearListCache(), clearBlobs(), clearProgress()])
}
