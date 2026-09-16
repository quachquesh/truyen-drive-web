import { defineStore } from 'pinia'

import { getAboutUser, type DriveUser } from '@/lib/driveApi'
import {
  InteractionRequiredError,
  clearLoginHint,
  isClientConfigured,
  requestToken,
  revokeToken,
  writeLoginHint,
} from '@/lib/googleAuth'
import * as tokenBox from '@/lib/tokenBox'

/**
 * Token Google chỉ giữ trong memory (tokenBox). Refresh trang → mất token →
 * guard gọi boot() xin lại silent. Không bao giờ ghi ra storage.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    authed: false,
    /** Đã thử silent sau khi trang vừa load chưa */
    booted: false,
    booting: false,
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
    },

    async fetchUser(): Promise<void> {
      try {
        this.user = await getAboutUser()
        if (this.user.emailAddress) writeLoginHint(this.user.emailAddress)
      } catch {
        // không chặn đăng nhập nếu chỉ fail lấy thông tin user
      }
    },

    /** Gọi 1 lần sau khi trang load — xin token lại silent (không popup). */
    async boot(): Promise<void> {
      if (this.booted || this.booting) return
      this.booting = true
      this.wireRefresher()
      try {
        if (tokenBox.hasToken()) {
          // đã có token trong memory (không xảy ra sau F5, nhưng đề phòng)
          this.authed = true
          void this.fetchUser()
          return
        }
        const granted = await requestToken({ silent: true })
        await this.applyGrant(granted)
      } catch (error) {
        this.authed = false
        if (!(error instanceof InteractionRequiredError)) {
          // Lỗi khác (mạng, GIS...) — để login page hiển thị
          this.loginError = error instanceof Error ? error.message : String(error)
        }
      } finally {
        this.booting = false
        this.booted = true
      }
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
    },
  },
})
