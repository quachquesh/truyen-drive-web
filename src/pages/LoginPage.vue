<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NCard, NSpin, NText, useMessage } from 'naive-ui'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const message = useMessage()

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
        <div class="logo">📚</div>
        <h1 class="title">Truyện Drive</h1>
        <NText depth="2"> Đọc truyện từ kho Google Drive riêng tư của bạn </NText>

        <NAlert
          v-if="!auth.clientConfigured"
          type="warning"
          title="Chưa cấu hình Google OAuth"
          style="margin-top: 20px; text-align: left"
        >
          Tạo file <code>.env.local</code> với
          <code>VITE_GOOGLE_CLIENT_ID=&lt;client_id&gt;</code> rồi chạy lại dev server. Xem hướng
          dẫn trong README.md.
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
          v-else-if="auth.booted && !auth.authed"
          type="info"
          :bordered="false"
          style="margin-top: 20px; text-align: left"
        >
          Phiên đăng nhập cần khôi phục — bấm nút bên dưới để vào lại, Google
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
          <span class="google-g">G</span>
          Đăng nhập bằng Google
        </NButton>

        <NSpin v-if="auth.booting" size="small" style="margin-top: 16px">
          <NText depth="3" style="font-size: 12px">Đang khôi phục phiên đăng nhập...</NText>
        </NSpin>

        <NText depth="3" style="font-size: 12px; margin-top: 16px; display: block">
          Chỉ tài khoản được chia sẻ quyền truy cập kho mới xem được nội dung. Token không lưu trên
          máy — mỗi lần mở trang sẽ xác thực lại.
        </NText>
      </div>
    </NCard>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: linear-gradient(160deg, rgba(99, 102, 241, 0.12), rgba(16, 185, 129, 0.08));
}

.login-card {
  max-width: 420px;
  width: 100%;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
}

.login-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  text-align: center;
}

.logo {
  font-size: 48px;
  line-height: 1;
}

.title {
  margin: 12px 0 4px;
  font-size: 26px;
}

.google-g {
  font-weight: 800;
  margin-right: 8px;
  background: linear-gradient(90deg, #4285f4, #ea4335 60%, #fbbc05);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
</style>
