import { acceptHMRUpdate, defineStore } from 'pinia'

import { getAboutUser, type DriveUser } from '@/lib/driveApi'
import {
  clearLoginHint,
  isClientConfigured,
  requestToken,
  revokeToken,
  writeLoginHint,
} from '@/lib/googleAuth'
import * as tokenBox from '@/lib/tokenBox'
import { useSyncStore } from './sync'

/**
 * Token Google chỉ giữ trong memory (tokenBox). Refresh trang → mất token →
 * guard đưa về login, người dùng bấm nút xin lại. Không bao giờ ghi ra storage.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    authed: false,
    /** boot() đã chạy lần nào sau khi trang load chưa */
    booted: false,
    loginPending: false,
    loginError: '',
    user: null as DriveUser | null,
    clientConfigured: isClientConfigured(),
  }),

  actions: {
    wireRefresher(): void {
      tokenBox.setRefresher(async () => {
        try {
          const granted = await requestToken({ silent: true })
          this.authed = true
          return granted
        } catch {
          this.authed = false
          return null
        }
      })
    },

    async applyGrant(granted: { token: string; expiresAt: number }): Promise<void> {
      tokenBox.setToken(granted.token, granted.expiresAt)
      this.authed = true
      this.loginError = ''
      void this.fetchUser()
      // Đăng nhập xong → kéo dữ liệu đồng bộ từ Drive (tiến độ, kho, đánh dấu)
      void useSyncStore().syncNow()
    },

    async fetchUser(): Promise<void> {
      try {
        this.user = await getAboutUser()
        if (this.user.emailAddress) writeLoginHint(this.user.emailAddress)
      } catch {
        // không chặn đăng nhập nếu chỉ fail lấy thông tin user
      }
    },

    /** Gọi 1 lần sau khi trang load — không tự xin token; người dùng bấm nút đăng nhập. */
    async boot(): Promise<void> {
      if (this.booted) return
      this.wireRefresher()
      if (tokenBox.hasToken()) {
        // còn token trong memory (SPA navigation, không xảy ra sau F5) → vẫn đăng nhập
        this.authed = true
        void this.fetchUser()
      }
      this.booted = true
    },

    /** Nút Đăng nhập — popup có user gesture; prompt mặc định rỗng (không ép consent lại). */
    async login(): Promise<boolean> {
      if (!this.clientConfigured) {
        this.loginError = 'Chưa cấu hình VITE_GOOGLE_CLIENT_ID — xem README.md'
        return false
      }
      this.loginPending = true
      this.loginError = ''
      try {
        const granted = await requestToken({ silent: false })
        await this.applyGrant(granted)
        return true
      } catch (error) {
        this.loginError = error instanceof Error ? error.message : String(error)
        return false
      } finally {
        this.loginPending = false
      }
    },

    /** Đảm bảo token còn hạn (xin mới nếu sắp hết) — gọi trước tác vụ nặng. */
    async ensureFreshToken(): Promise<boolean> {
      if (tokenBox.isTokenFresh()) return true
      try {
        const granted = await requestToken({ silent: true })
        await this.applyGrant(granted)
        return true
      } catch {
        this.authed = false
        return false
      }
    },

    logout(): void {
      const token = tokenBox.getToken()
      if (token) revokeToken(token)
      tokenBox.clearToken()
      clearLoginHint()
      this.authed = false
      this.user = null
      this.booted = false
      useSyncStore().reset()
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
}
