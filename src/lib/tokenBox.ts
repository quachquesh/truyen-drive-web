/**
 * Hộp chứa token trong memory — cầu nối giữa Pinia store (auth) và
 * axios interceptors (driveApi) để tránh phụ thuộc vòng.
 *
 * Token KHÔNG bao giờ được ghi ra localStorage/sessionStorage;
 * refresh trang là mất token và phải xin lại (silent).
 */
interface TokenState {
  token: string
  /** Timestamp (ms) token hết hạn */
  expiresAt: number
}

let state: TokenState = { token: '', expiresAt: 0 }
let refresher: () => Promise<TokenState | null> = async () => null

export function setToken(token: string, expiresAt: number): void {
  state = { token, expiresAt }
}

export function getToken(): string {
  return state.token
}

export function getExpiresAt(): number {
  return state.expiresAt
}

/** Token còn hạn cách ít nhất 5 phút */
export function isTokenFresh(): boolean {
  return Boolean(state.token) && Date.now() < state.expiresAt - 5 * 60_000
}

export function hasToken(): boolean {
  return Boolean(state.token) && Date.now() < state.expiresAt
}

export function clearToken(): void {
  state = { token: '', expiresAt: 0 }
}

/** driveApi gọi hàm này khi gặp 401 để xin token mới rồi retry. */
export function setRefresher(fn: () => Promise<TokenState | null>): void {
  refresher = fn
}

export function refreshToken(): Promise<TokenState | null> {
  return refresher()
}
