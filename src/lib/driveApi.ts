import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

import { sleep } from './concurrency'
import { clearToken, getToken, hasToken, isTokenFresh, refreshToken, setToken } from './tokenBox'

declare module 'axios' {
  export interface AxiosRequestConfig {
    __authRetried?: boolean
    __retries?: number
  }
}

export interface DriveItem {
  id: string
  name: string
  mimeType: string
  /** Link preview do Google render (ký sẵn) — viewer xem được kể cả khi tải bị chặn */
  thumbnailLink?: string
  /** Ngày sửa đổi cuối (RFC 3339) — hiển thị trên danh sách truyện */
  modifiedTime?: string
}

export interface DriveUser {
  displayName: string
  emailAddress: string
  photoLink?: string
}

/** File bị Google chặn tải xuống (VD: kho bật "Viewers can't download") — vẫn xem preview được. */
export class DriveFileBlockedError extends Error {
  readonly fileId: string

  constructor(fileId: string) {
    super('Google chặn tải file này (view-only)')
    this.name = 'DriveFileBlockedError'
    this.fileId = fileId
  }
}

/**
 * Đổi suffix kích thước của thumbnailLink googleusercontent
 * (`...=s220` → `...=s2048`) để lấy preview to đủ đọc.
 */
export function sizedThumbnail(link: string, size = 2048): string {
  const eq = link.lastIndexOf('=')
  return eq > 0 ? `${link.slice(0, eq)}=s${size}` : `${link}=s${size}`
}

/** Lấy thumbnailLink mới (link cũ hết hạn sau vài giờ) với kích thước lớn. */
export async function getFreshThumbnail(
  fileId: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const res = await http.get<{ thumbnailLink?: string }>(`/files/${fileId}`, {
    params: { fields: 'thumbnailLink' },
    signal: options.signal,
  })
  if (!res.data.thumbnailLink) throw new Error('File không có ảnh preview')
  return sizedThumbnail(res.data.thumbnailLink)
}

const http = axios.create({
  baseURL: 'https://www.googleapis.com/drive/v3',
  timeout: 60_000,
})

http.interceptors.request.use(async (config) => {
  // Token có nhưng sắp hết hạn (< 5 phút) → xin mới silent trước khi gọi
  if (getToken() && !isTokenFresh()) {
    const granted = await refreshToken()
    if (granted) setToken(granted.token, granted.expiresAt)
  }
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as
      | (AxiosRequestConfig & { headers: Record<string, string> })
      | undefined
    if (!config) throw error

    const status = error.response?.status
    const retries = config.__retries ?? 0

    // 401 → xin token mới silent rồi retry đúng 1 lần
    if (status === 401 && !config.__authRetried) {
      config.__authRetried = true
      const granted = await refreshToken()
      if (granted) {
        setToken(granted.token, granted.expiresAt)
        config.headers.Authorization = `Bearer ${granted.token}`
        return http.request(config)
      }
      clearToken()
      throw error
    }

    // 403 rate-limit (Drive trả userRateLimitExceeded/rateLimitExceeded) → backoff lâu
    if (status === 403 && retries < 5 && (await isRateLimitError(error))) {
      config.__retries = retries + 1
      await sleep(1000 * 2 ** (config.__retries - 1) + Math.random() * 500)
      return http.request(config)
    }

    // 429 / 5xx → backoff rồi retry tối đa 3 lần
    if ((status === 429 || (status !== undefined && status >= 500)) && retries < 3) {
      config.__retries = retries + 1
      await sleep(1000 * 2 ** (config.__retries - 1) + Math.random() * 300)
      return http.request(config)
    }

    throw error
  },
)

const RATE_LIMIT_REASONS = new Set(['userratelimited', 'ratelimited'])

/** 403 do vượt quota (userRateLimitExceeded/rateLimitExceeded) — khác 403 do thiếu quyền. */
async function isRateLimitError(error: AxiosError): Promise<boolean> {
  let payload: unknown = error.response?.data
  if (payload instanceof Blob) {
    try {
      payload = JSON.parse(await payload.text())
    } catch {
      return false
    }
  }
  const details = (payload as { error?: { errors?: Array<{ reason?: string }>; status?: string } })
    ?.error
  if (!details) return false
  if (
    details.errors?.some((item) => RATE_LIMIT_REASONS.has(String(item.reason ?? '').toLowerCase()))
  ) {
    return true
  }
  return RATE_LIMIT_REASONS.has(String(details.status ?? '').toLowerCase())
}

/** Chỉ để auth store nạp token có sẵn vào lúc boot (nếu có trong memory). */
export function primeApiToken(token: string, expiresAt: number): void {
  setToken(token, expiresAt)
}

export function apiHasToken(): boolean {
  return hasToken()
}

export function apiTokenFresh(): boolean {
  return isTokenFresh()
}

/**
 * Liệt kê toàn bộ con của folder (phân trang, bỏ qua trash).
 * Trả về cả folder lẫn file — caller tự lọc theo mimeType.
 */
export async function listChildren(
  folderId: string,
  options: { signal?: AbortSignal } = {},
): Promise<DriveItem[]> {
  const out: DriveItem[] = []
  let pageToken: string | undefined

  do {
    const res = await http.get<{ files?: DriveItem[]; nextPageToken?: string }>('/files', {
      params: {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, thumbnailLink, modifiedTime)',
        pageSize: 1000,
        pageToken,
      },
      signal: options.signal,
    })
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken
  } while (pageToken)

  return out
}

/**
 * Liệt kê các folder được chia sẻ trực tiếp với user ("Đã chia sẻ với tôi")
 * — điểm vào để chọn kho truyện mà người dùng chỉ có quyền viewer.
 */
export async function listSharedFolders(
  options: { signal?: AbortSignal } = {},
): Promise<DriveItem[]> {
  const out: DriveItem[] = []
  let pageToken: string | undefined

  do {
    const res = await http.get<{ files?: DriveItem[]; nextPageToken?: string }>('/files', {
      params: {
        q: "sharedWithMe = true and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromSharedDrives: true,
      },
      signal: options.signal,
    })
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken
  } while (pageToken)

  return out
}

/**
 * Tìm folder theo tên trên TOÀN BỘ Drive (My Drive + được chia sẻ + shared drive),
 * không phụ thuộc vị trí — dùng trong picker chọn kho. Giới hạn 50 kết quả.
 */
export async function searchFolders(
  nameQuery: string,
  options: { signal?: AbortSignal } = {},
): Promise<DriveItem[]> {
  const escaped = nameQuery.replace(/'/g, "\\'")
  const res = await http.get<{ files?: DriveItem[] }>('/files', {
    params: {
      q: `name contains '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, mimeType)',
      pageSize: 50,
      supportsAllDrives: true,
      includeItemsFromSharedDrives: true,
    },
    signal: options.signal,
  })
  return res.data.files ?? []
}

/**
 * Liệt kê con của NHIỀU folder trong vài request duy nhất bằng query
 * `('id1' in parents or 'id2' in parents ...) and trashed = false`.
 * Kết quả nhóm theo cha qua field `parents`. Chunk 50 cha/request để
 * giữ URL ngắn. Đây là cách chống N+1 khi quét cả kho truyện.
 *
 * `foldersOnly`: chỉ lấy folder con (không kèm metadata ảnh/PDF) — dùng
 * khi quét cấu trúc; danh sách file của chapter lấy sau bằng listChildren.
 */
export async function listChildrenGrouped(
  parentIds: string[],
  options: { foldersOnly?: boolean; signal?: AbortSignal } = {},
): Promise<Map<string, DriveItem[]>> {
  const grouped = new Map<string, DriveItem[]>()
  const CHUNK = 50
  const mimeFilter = options.foldersOnly
    ? ' and mimeType = ' + "'application/vnd.google-apps.folder'"
    : ''

  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const chunk = parentIds.slice(i, i + CHUNK)
    const parentsQuery = chunk.map((id) => `'${id}' in parents`).join(' or ')
    let pageToken: string | undefined

    do {
      const res = await http.get<{
        files?: Array<DriveItem & { parents?: string[] }>
        nextPageToken?: string
      }>('/files', {
        params: {
          q: `((${parentsQuery}) and trashed = false)${mimeFilter}`,
          fields: 'nextPageToken, files(id, name, mimeType, parents, modifiedTime)',
          pageSize: 1000,
          pageToken,
        },
        signal: options.signal,
      })
      for (const file of res.data.files ?? []) {
        const parent = file.parents?.[0]
        if (!parent) continue
        const list = grouped.get(parent)
        if (list) list.push(file)
        else
          grouped.set(parent, [
            {
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
            },
          ])
      }
      pageToken = res.data.nextPageToken
    } while (pageToken)
  }

  return grouped
}

/** Metadata 1 file/folder (dùng lấy tên folder khi F5 trực tiếp URL). */
export async function getFileMeta(
  fileId: string,
  options: { signal?: AbortSignal } = {},
): Promise<DriveItem> {
  const res = await http.get<DriveItem>(`/files/${fileId}`, {
    params: { fields: 'id, name, mimeType, thumbnailLink' },
    signal: options.signal,
  })
  return res.data
}

/** Tải nội dung file (ảnh / PDF) dưới dạng blob. Trả DriveFileBlockedError nếu bị chặn tải. */
export async function getFileBlob(
  fileId: string,
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  try {
    const res = await http.get<Blob>(`/files/${fileId}`, {
      params: { alt: 'media' },
      responseType: 'blob',
      signal: options.signal,
    })
    return res.data
  } catch (error) {
    throw await normalizeDownloadError(error, fileId)
  }
}

/** 403 fileNotDownloadable → DriveFileBlockedError (phân biệt với 403 thiếu quyền/rate-limit). */
async function normalizeDownloadError(error: unknown, fileId: string): Promise<unknown> {
  if (error instanceof AxiosError && error.response?.status === 403) {
    const body = await parseErrorBody(error.response.data)
    const reason = body?.errors?.[0]?.reason?.toLowerCase()
    const message = body?.errors?.[0]?.message ?? ''
    if (reason === 'filenotdownloadable' || /cannot be downloaded/i.test(message)) {
      return new DriveFileBlockedError(fileId)
    }
  }
  return error
}

interface DriveErrorBody {
  errors?: Array<{ reason?: string; message?: string }>
  status?: string
}

async function parseErrorBody(data: unknown): Promise<DriveErrorBody | undefined> {
  let payload: unknown = data
  if (payload instanceof Blob) {
    try {
      payload = JSON.parse(await payload.text())
    } catch {
      return undefined
    }
  }
  if (payload && typeof payload === 'object') {
    return (payload as { error?: DriveErrorBody }).error
  }
  return undefined
}

/** Thông tin user đang đăng nhập (đủ quyền với scope drive.readonly). */
export async function getAboutUser(options: { signal?: AbortSignal } = {}): Promise<DriveUser> {
  const res = await http.get<{ user: DriveUser }>('/about', {
    params: { fields: 'user(displayName, emailAddress, photoLink)' },
    signal: options.signal,
  })
  return res.data.user
}

// ---------- đồng bộ đa thiết bị (appDataFolder) ----------

export const SYNC_FILE_NAME = 'truyen-drive-sync.json'

/** Endpoint upload nằm ngoài baseURL /drive/v3 — URL tuyệt đối, interceptor vẫn chạy. */
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files'

/** Tìm file dữ liệu đồng bộ trong appDataFolder (thư mục ẩn riêng của app). */
export async function findSyncFile(options: { signal?: AbortSignal } = {}): Promise<string | null> {
  const res = await http.get<{ files?: Array<{ id: string }> }>('/files', {
    params: {
      spaces: 'appDataFolder',
      q: `name = '${SYNC_FILE_NAME}'`,
      fields: 'files(id)',
      pageSize: 5,
    },
    signal: options.signal,
  })
  return res.data.files?.[0]?.id ?? null
}

/** Tải nội dung file đồng bộ (chuỗi JSON thô — không cho axios auto-parse). */
export async function downloadSyncFile(
  fileId: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const res = await http.get<string>(`/files/${fileId}`, {
    params: { alt: 'media' },
    responseType: 'text',
    transformResponse: [(data: string) => data],
    signal: options.signal,
  })
  return res.data
}

/**
 * Ghi nội dung file đồng bộ. Có fileId → PATCH media (1 request); chưa có →
 * tạo metadata với parents appDataFolder rồi PATCH media (2 request).
 * Trả về fileId để caller ghi nhớ cho lần ghi sau.
 */
export async function uploadSyncFile(
  fileId: string | null,
  content: string,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const media = {
    params: { uploadType: 'media' },
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
  }
  if (fileId) {
    await http.patch(`${UPLOAD_BASE}/${fileId}`, content, media)
    return fileId
  }
  const created = await http.post<{ id: string }>(
    '/files',
    { name: SYNC_FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' },
    { signal: options.signal },
  )
  await http.patch(`${UPLOAD_BASE}/${created.data.id}`, content, media)
  return created.data.id
}

/** Bọc lỗi axios thành message hiển thị được. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof DriveFileBlockedError) {
    return 'Google chặn tải file này (view-only) — không lấy được bản gốc'
  }
  if (error instanceof AxiosError) {
    const status = error.response?.status
    if (status === 401) {
      return 'Không có quyền truy cập — kiểm tra lại tài khoản Google đã được chia sẻ kho'
    }
    if (status === 403) {
      const data = error.response?.data
      const details =
        data && typeof data === 'object'
          ? (data as { error?: { errors?: Array<{ reason?: string }> } }).error
          : undefined
      const reason = details?.errors?.[0]?.reason?.toLowerCase()
      if (reason === 'userratelimited' || reason === 'ratelimited') {
        return 'Vượt giới hạn tần suất Google Drive — đợi ~1 phút rồi bấm Làm mới'
      }
      return 'Không có quyền truy cập — kiểm tra lại tài khoản Google đã được chia sẻ kho'
    }
    if (status === 404) return 'Không tìm thấy (kiểm tra ID folder / file)'
    if (status === 429) return 'Google Drive giới hạn tần suất, đợi chút rồi thử lại'
    return `Lỗi Google Drive${status ? ` (HTTP ${status})` : ''}: ${error.message}`
  }
  if (error instanceof Error) return error.message
  return String(error)
}
