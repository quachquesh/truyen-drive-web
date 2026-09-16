<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NText, useMessage } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import { readLoginHint } from '@/lib/googleAuth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const message = useMessage()

/** Có login-hint trong localStorage → máy này từng đăng nhập thành công */
const returningUser = !!readLoginHint()

async function login(): Promise<void> {
  const ok = await auth.login()
  if (!ok) return

  message.success('Đăng nhập thành công')
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  await router.replace(redirect)
}
</script>

<template>
  <div class="login-wrap">
    <NCard class="login-card" :bordered="false">
      <div class="login-body">
        <AppIcon name="book" :size="44" class="logo" />
        <h1 class="title">Truyện Drive</h1>
        <NText depth="2"> Đọc truyện từ kho Google Drive riêng tư của bạn </NText>

        <NAlert v-if="!returningUser" type="warning" :bordered="false" class="privacy-alert">
          <strong>Minh bạch về quyền riêng tư:</strong> ứng dụng chạy hoàn toàn trên trình duyệt
          của bạn — không thu thập dữ liệu gì, truyện và cài đặt ở lại trên Google Drive của bạn.
          <a
            href="https://github.com/quachquesh/truyen-drive-web"
            target="_blank"
            rel="noopener"
            class="privacy-link"
          >
            Mã nguồn công khai trên GitHub ↗
          </a>
        </NAlert>

        <NAlert
          v-if="!auth.clientConfigured"
          type="warning"
          title="Ứng dụng chưa kết nối được với Google"
          style="margin-top: 20px; text-align: left"
        >
          Ứng dụng cần được kết nối với Google một lần cuối trước khi dùng. Vui lòng liên hệ người
          phát triển.
          <div class="tech-hint">Thiếu VITE_GOOGLE_CLIENT_ID trong .env.local — xem README.md.</div>
        </NAlert>

        <NAlert
          v-else-if="auth.loginError"
          type="error"
          style="margin-top: 20px; text-align: left"
          closable
          @close="auth.loginError = ''"
        >
          <div style="font-weight: 600">{{ auth.loginError }}</div>
          <div v-if="!auth.loginPending" style="font-size: 12px; margin-top: 4px">
            (Gửi lỗi này cho người phát triển nếu bấm thử vẫn kẹt)
          </div>
        </NAlert>

        <NAlert
          v-else-if="returningUser && !auth.authed"
          type="info"
          :bordered="false"
          style="margin-top: 20px; text-align: left"
        >
          Mỗi lần mở trang cần đăng nhập lại — bấm nút bên dưới là vào tiếp, Google
          <strong>không hỏi cấp quyền lại</strong> (đã cấp trước đó).
        </NAlert>

        <NButton
          type="primary"
          size="large"
          block
          style="margin-top: 24px"
          :loading="auth.loginPending"
          :disabled="!auth.clientConfigured"
          @click="login"
        >
          <svg class="google-g" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
            />
          </svg>
          Đăng nhập bằng Google
        </NButton>

        <NText depth="3" style="font-size: 12px; margin-top: 16px; display: block">
          Chỉ tài khoản được chia sẻ quyền truy cập kho mới xem được nội dung. Phiên đăng nhập
          không lưu trên thiết bị.
        </NText>
      </div>
    </NCard>

    <nav class="login-links" aria-label="Liên kết hữu ích">
      <RouterLink :to="{ name: 'guide' }">Hướng dẫn sử dụng</RouterLink>
      <span aria-hidden="true">·</span>
      <RouterLink :to="{ name: 'privacy' }">Chính sách bảo mật</RouterLink>
      <span aria-hidden="true">·</span>
      <RouterLink :to="{ name: 'terms' }">Điều khoản sử dụng</RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: linear-gradient(160deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.08));
}

html.dark .login-wrap {
  background: linear-gradient(160deg, rgba(99, 102, 241, 0.1), rgba(16, 185, 129, 0.07));
}

.login-card {
  max-width: 420px;
  width: 100%;
  border-radius: 16px;
  box-shadow: var(--tdw-shadow);
}

.login-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  text-align: center;
}

.logo {
  color: var(--tdw-primary);
}

.title {
  margin: 12px 0 4px;
  font-size: 26px;
}

.tech-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 6px;
  font-family: ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Menlo, Consolas, monospace;
}

.privacy-alert {
  margin-top: 20px;
  text-align: left;
  font-size: 13px;
  line-height: 1.6;
}

.privacy-link {
  display: inline-block;
  padding: 4px 0;
  color: var(--tdw-primary);
  font-weight: 600;
}

.google-g {
  margin-right: 10px;
  flex-shrink: 0;
}

.login-links {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--tdw-text-muted);
}

.login-links a {
  color: var(--tdw-text-muted);
}

.login-links a:hover {
  color: var(--tdw-primary);
}
</style>
