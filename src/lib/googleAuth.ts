/**
 * Google Identity Services — token client (implicit flow, không cần backend).
 *
 * Token chỉ tồn tại trong memory. Khi refresh trang, app gọi
 * `requestToken({ silent: true })`: nếu user đã consent trước đó và còn
 * session Google thì token được cấp lại tự động, không cần bấm nút.
 */

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SILENT_TIMEOUT_MS = 15_000

export interface GrantResult {
  token: string
  /** Timestamp (ms) token hết hạn */
  expiresAt: number
}

/** Xin token silent nhưng cần tương tác từ user (chưa consent / hết session Google). */
export class InteractionRequiredError extends Error {
  constructor(message = 'Cần đăng nhập lại bằng tương tác') {
    super(message)
    this.name = 'InteractionRequiredError'
  }
}

let scriptPromise: Promise<void> | null = null

function loadGisScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.accounts.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Không tải được Google Identity Services'))
    }
    document.head.append(script)
  })
  return scriptPromise
}

// ---- Trạng thái 1 request token đang chờ callback từ GIS ----
let requestSeq = 0
let waitingSilent = false
let waitingResolve: ((result: GrantResult) => void) | null = null
let waitingReject: ((error: Error) => void) | null = null

/**
 * Login hint (email) lưu ở localStorage — KHÔNG phải token, chỉ để Google
 * tự chọn đúng tài khoản khi khôi phục phiên, tránh chọn lại account mỗi lần.
 */
const LOGIN_HINT_KEY = 'tdw-login-hint'

function readLoginHint(): string {
  try {
    return localStorage.getItem(LOGIN_HINT_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeLoginHint(email: string): void {
  try {
    localStorage.setItem(LOGIN_HINT_KEY, email)
  } catch {
    // private mode — bỏ qua
  }
}

export function clearLoginHint(): void {
  try {
    localStorage.removeItem(LOGIN_HINT_KEY)
  } catch {
    // bỏ qua
  }
}

let tokenClient: google.accounts.oauth2.TokenClient | null = null

async function ensureClient(clientId: string): Promise<void> {
  await loadGisScript()
  if (tokenClient) return

  const hint = readLoginHint()
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    ...(hint ? { login_hint: hint } : {}),
    callback: (response) => {
      const resolve = waitingResolve
      const reject = waitingReject
      clearWaiting()
      if (response.access_token) {
        resolve?.({
          token: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
        })
      } else {
        reject?.(toAuthError(response.error ?? 'unknown', response.error_description))
      }
    },
    error_callback: (error) => {
      const reject = waitingReject
      const wasSilent = waitingSilent
      clearWaiting()
      if (wasSilent) {
        // Silent không thể hoàn tất (thiếu gesture / chặn popup / hết session) →
        // cần đăng nhập tương tác bằng nút bấm
        reject?.(new InteractionRequiredError())
        return
      }
      // Kèm error.type để chẩn đoán từ xa (popup_failed_to_open, popup_closed...)
      const detail = [error.type, error.message].filter(Boolean).join(': ')
      reject?.(new Error(`Đăng nhập thất bại (${detail || 'không rõ lỗi'})`))
    },
  })
}

function clearWaiting(): void {
  waitingResolve = null
  waitingReject = null
  waitingSilent = false
}

function toAuthError(code: string, description?: string): Error {
  if (code === 'access_denied') return new Error('Bạn đã từ chối cấp quyền truy cập Drive')
  return new Error(description || `Đăng nhập thất bại (${code})`)
}

export function getClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
}

export function isClientConfigured(): boolean {
  return getClientId().length > 0
}

/**
 * Xin access token.
 * - `silent: true` → prompt rỗng, không mở popup (refresh trang, token hết hạn,
 *   retry 401). Nếu cần tương tác → reject InteractionRequiredError.
 * - `silent: false` → popup (nút Đăng nhập, có user gesture). `prompt` mặc định
 *   rỗng: Google chỉ hỏi consent/chọn tài khoản khi thật sự cần — đã cấp quyền
 *   rồi thì vào lại ngay không hỏi gì thêm.
 *
 * Request mới tự hủy request cũ đang chờ (supersede).
 */
export async function requestToken(
  options: { silent?: boolean; prompt?: 'consent' | 'select_account' } = {},
): Promise<GrantResult> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Chưa cấu hình VITE_GOOGLE_CLIENT_ID')

  await ensureClient(clientId)

  const mySeq = ++requestSeq
  // Request trước đó (nếu có) coi như bị thay thế
  waitingResolve = null
  waitingReject?.(new InteractionRequiredError('Yêu cầu đăng nhập đã bị thay thế'))
  waitingReject = null

  waitingSilent = options.silent === true

  return new Promise<GrantResult>((resolve, reject) => {
    waitingResolve = (result) => {
      if (requestSeq !== mySeq) return
      clearWaiting()
      resolve(result)
    }
    waitingReject = (error) => {
      if (requestSeq !== mySeq) return
      clearWaiting()
      reject(error)
    }

    try {
      tokenClient?.requestAccessToken({ prompt: options.silent ? '' : (options.prompt ?? '') })
    } catch (error) {
      clearWaiting()
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }

    if (options.silent) {
      // Silent request thành công thì callback về rất nhanh; quá timeout coi như
      // không thể silent (hết session Google, chưa consent...)
      window.setTimeout(() => {
        if (requestSeq === mySeq && waitingReject) {
          const rejectMine = waitingReject
          clearWaiting()
          rejectMine(new InteractionRequiredError())
        }
      }, SILENT_TIMEOUT_MS)
    }
  })
}

export function revokeToken(token: string): void {
  try {
    google.accounts.oauth2?.revoke(token)
  } catch {
    // ignore — token sẽ tự hết hạn trong ~1h
  }
}
