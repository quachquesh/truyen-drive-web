<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NAvatar, NButton, NDropdown, NIcon, type DropdownOption } from 'naive-ui'

import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import LibraryModal from '@/components/LibraryModal.vue'

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
    { key: 'manage', label: '⚙ Quản lý kho...' },
  ]
})

const userOptions: DropdownOption[] = [{ key: 'logout', label: 'Đăng xuất' }]

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
      <RouterLink :to="{ name: 'home' }" class="brand">
        <span class="brand-icon">📚</span>
        <span class="brand-text">Truyện Drive</span>
      </RouterLink>

      <NDropdown trigger="click" :options="libraryOptions" @select="onLibrarySelect">
        <NButton quaternary size="small">
          {{ activeName }}
          <template #icon>
            <span class="dropdown-caret">▾</span>
          </template>
        </NButton>
      </NDropdown>

      <div class="spacer" />

      <NButton quaternary circle size="small" title="Sáng / tối" @click="emit('toggleTheme')">
        <template #icon>
          <NIcon>🌙</NIcon>
        </template>
      </NButton>

      <NButton
        quaternary
        circle
        size="small"
        title="Cài đặt"
        @click="router.push({ name: 'settings' })"
      >
        <template #icon>
          <NIcon>⚙️</NIcon>
        </template>
      </NButton>

      <NDropdown trigger="click" :options="userOptions" @select="onUserSelect">
        <NAvatar round size="small" :src="auth.user?.photoLink" style="cursor: pointer">
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
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);
  backdrop-filter: blur(8px);
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
  gap: 6px;
  text-decoration: none;
  font-weight: 700;
  font-size: 16px;
  color: inherit;
}

.spacer {
  flex: 1;
}

.dropdown-caret {
  font-size: 10px;
}
</style>
