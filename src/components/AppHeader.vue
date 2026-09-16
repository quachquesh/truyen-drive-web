<script setup lang="ts">
import { computed, h } from 'vue'
import { useRouter } from 'vue-router'
import { NAvatar, NButton, NDropdown, type DropdownOption } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import LibraryModal from '@/components/LibraryModal.vue'

defineProps<{ dark: boolean }>()
const emit = defineEmits<{ toggleTheme: [] }>()

const router = useRouter()
const auth = useAuthStore()
const libraryStore = useLibraryStore()

const libraryOptions = computed<DropdownOption[]>(() => {
  const libs = libraryStore.libraries.map((lib) => ({
    key: lib.id,
    label: lib.name,
    disabled: lib.id === libraryStore.activeId,
  }))
  return [
    { key: 'label', label: 'Kho truyện', disabled: true },
    ...libs,
    { key: 'manage', label: 'Quản lý kho truyện', icon: renderLibraryIcon() },
  ]
})

const userOptions: DropdownOption[] = [
  { key: 'logout', label: 'Đăng xuất', icon: renderLogoutIcon() },
]

function renderLibraryIcon() {
  return () => h(AppIcon, { name: 'library', size: 16 })
}

function renderLogoutIcon() {
  return () => h(AppIcon, { name: 'log-out', size: 16 })
}

function onLibrarySelect(key: string | number): void {
  if (key === 'manage') {
    libraryStore.openManager()
    return
  }
  if (typeof key === 'string' && libraryStore.libraries.some((lib) => lib.id === key)) {
    libraryStore.setActive(key)
    void router.push({ name: 'library', params: { libId: key } })
  }
}

function onUserSelect(key: string | number): void {
  if (key === 'logout') {
    auth.logout()
    void router.push({ name: 'login' })
  }
}

const activeName = computed(() => libraryStore.active?.name ?? 'Chọn kho')
</script>

<template>
  <header class="app-header">
    <div class="app-header-inner">
      <RouterLink :to="{ name: 'home' }" class="brand" title="Truyện Drive">
        <AppIcon name="book" :size="22" class="brand-icon" />
        <span class="brand-text">Truyện Drive</span>
      </RouterLink>

      <NDropdown trigger="click" :options="libraryOptions" @select="onLibrarySelect">
        <NButton quaternary size="medium" class="lib-switch">
          <span class="lib-name">{{ activeName }}</span>
          <template #icon>
            <AppIcon name="chevron-down" :size="14" />
          </template>
        </NButton>
      </NDropdown>

      <div class="spacer" />

      <NButton quaternary circle size="medium" title="Sáng / tối" @click="emit('toggleTheme')">
        <template #icon>
          <AppIcon :name="dark ? 'sun' : 'moon'" :size="18" />
        </template>
      </NButton>

      <NButton
        quaternary
        circle
        size="medium"
        title="Cài đặt"
        @click="router.push({ name: 'settings' })"
      >
        <template #icon>
          <AppIcon name="settings" :size="18" />
        </template>
      </NButton>

      <NDropdown trigger="click" :options="userOptions" @select="onUserSelect">
        <NAvatar round size="medium" :src="auth.user?.photoLink" style="cursor: pointer">
          {{ auth.user ? auth.user.emailAddress.charAt(0).toUpperCase() : '?' }}
        </NAvatar>
      </NDropdown>
    </div>

    <LibraryModal />
  </header>
</template>

<style scoped>
.app-header {
  flex-shrink: 0;
  background: var(--tdw-header-bg);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--tdw-border);
}

.app-header-inner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  max-width: 1200px;
  margin: 0 auto;
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

.spacer {
  flex: 1;
}

.lib-switch .lib-name {
  max-width: 30vw;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}

@media (max-width: 480px) {
  .brand-text {
    display: none;
  }

  .app-header-inner {
    gap: 8px;
    padding: 6px 12px;
  }
}
</style>
