<script setup lang="ts">
import { useRouter } from 'vue-router'
import { NButton } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'

/**
 * Khung chung cho các trang tĩnh (Hướng dẫn / Bảo mật / Điều khoản).
 * Không cần đăng nhập để xem — phục vụ cả người mới lẫn Google OAuth review.
 */
const router = useRouter()
</script>

<template>
  <div class="static-shell">
    <header class="shell-header">
      <div class="shell-header-inner">
        <RouterLink :to="{ name: 'home' }" class="brand" title="Truyện Drive">
          <AppIcon name="book" :size="22" class="brand-icon" />
          <span class="brand-text">Truyện Drive</span>
        </RouterLink>
        <NButton quaternary size="small" @click="router.push({ name: 'home' })">
          <template #icon>
            <AppIcon name="arrow-left" :size="16" />
          </template>
          Về ứng dụng
        </NButton>
      </div>
    </header>

    <main class="shell-body">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.static-shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.shell-header {
  flex-shrink: 0;
  background: var(--tdw-header-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--tdw-border);
}

.shell-header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  font-weight: 700;
  font-size: 16px;
  color: var(--tdw-text);
}

.brand-icon {
  color: var(--tdw-primary);
}

.shell-body {
  flex: 1;
  width: 100%;
  max-width: 860px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

@media (max-width: 640px) {
  .shell-body {
    padding: 16px 12px 32px;
  }
}
</style>
