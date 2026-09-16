import { getFileBlob } from './driveApi'
import { getBlob, putBlob } from './db'

/**
 * Lấy blob file (ảnh/PDF): ưu tiên cache IndexedDB, miss thì tải từ Drive
 * rồi lưu vào cache. Lần đọc sau không tốn mạng.
 */
export async function ensureFileBlob(
  fileId: string,
  storyKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  const cached = await getBlob(fileId)
  if (cached) return cached.blob

  const blob = await getFileBlob(fileId, { signal: options.signal })
  await putBlob({
    fileId,
    blob,
    mimeType: blob.type,
    storyKey,
    fetchedAt: Date.now(),
  })
  return blob
}
