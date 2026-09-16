/**
 * Nhận ID folder Google Drive từ URL dạng
 * https://drive.google.com/drive/folders/<id>?usp=sharing
 * hoặc từ chính ID thuần.
 */
const FOLDER_URL_RE = /\/folders\/([A-Za-z0-9_-]{10,})/
const RAW_ID_RE = /^[A-Za-z0-9_-]{10,}$/

export function parseFolderId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const fromUrl = trimmed.match(FOLDER_URL_RE)
  if (fromUrl?.[1]) return fromUrl[1]

  if (RAW_ID_RE.test(trimmed)) return trimmed

  return null
}
