<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NCard,
  NDivider,
  NGi,
  NGrid,
  NProgress,
  NSpace,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'

import {
  clearBlobs,
  clearListCache,
  clearProgress,
  clearAllCaches,
  storageEstimate,
} from '@/lib/db'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'

const router = useRouter()
const auth = useAuthStore()
const libraryStore = useLibraryStore()
const message = useMessage()
const dialog = useDialog()

const usage = ref(0)
const quota = ref(0)
const loadingUsage = ref(false)

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exp).toFixed(exp === 0 ? 0 : 1)} ${units[exp]}`
}

async function refreshUsage(): Promise<void> {
  loadingUsage.value = true
  try {
    const estimate = await storageEstimate()
    usage.value = estimate.usage
    quota.value = estimate.quota
  } finally {
    loadingUsage.value = false
  }
}

function confirmClear(title: string, action: () => Promise<void>): void {
  dialog.warning({
    title,
    positiveText: 'Xóa',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      await action()
      message.success('Đã xóa')
      await refreshUsage()
    },
  })
}

function clearImages(): void {
  confirmClear('Xóa toàn bộ cache ảnh/PDF?', async () => {
    await clearBlobs()
  })
}

function clearLists(): void {
  confirmClear('Xóa cache danh sách (truyện/chapter)?\nLần tới sẽ quét lại từ Google Drive.', async () => {
    await clearListCache()
  })
}

function clearReadingProgress(): void {
  confirmClear('Xóa toàn bộ tiến trình đọc?', async () => {
    await clearProgress()
  })
}

function clearEverything(): void {
  confirmClear('Xóa TOÀN BỘ cache + tiến trình đọc?', async () => {
    await clearAllCaches()
  })
}

function logout(): void {
  dialog.warning({
    title: 'Đăng xuất?',
    content: 'Token sẽ bị thu hồi. Bạn cần đăng nhập lại để tiếp tục đọc.',
    positiveText: 'Đăng xuất',
    negativeText: 'Ở lại',
    onPositiveClick: () => {
      auth.logout()
      void router.push({ name: 'login' })
    },
  })
}

onMounted(() => {
  void refreshUsage()
  void libraryStore.load()
})
</script>

<template>
  <div class="settings-page">
    <h2 style="margin: 0 0 16px">Cài đặt</h2>

    <NGrid :x-gap="16" :y-gap="16" cols="1 m:2" responsive="screen">
      <NGi>
        <NCard title="Bộ nhớ đệm (IndexedDB)" size="small">
          <NSpace vertical size="large">
            <div>
              <NSpace align="center" justify="space-between">
                <NText>Đã dùng: <strong>{{ formatBytes(usage) }}</strong></NText>
                <NButton size="tiny" quaternary @click="refreshUsage">↻</NButton>
              </NSpace>
              <NProgress
                type="line"
                :percentage="quota ? Math.min(100, (usage / quota) * 100) : 0"
                :indicator-placement="'inside'"
                style="margin-top: 8px"
              />
              <NText depth="3" style="font-size: 12px">
                Tổng hạn mức trình duyệt cấp: {{ formatBytes(quota) }}
              </NText>
            </div>

            <NSpace size="small" style="flex-wrap: wrap">
              <NButton size="small" secondary type="warning" @click="clearImages">Xóa cache ảnh/PDF</NButton>
              <NButton size="small" secondary type="warning" @click="clearLists">Xóa cache danh sách</NButton>
              <NButton size="small" secondary @click="clearReadingProgress">Xóa tiến trình đọc</NButton>
              <NButton size="small" secondary type="error" @click="clearEverything">Xóa toàn bộ</NButton>
            </NSpace>

            <NAlert type="info" :bordered="false" style="font-size: 13px">
              Ảnh/PDF từng đọc được lưu sẵn nên lần sau mở không tốn mạng. "Xóa cache danh sách"
              buộc app quét lại kho từ Drive (dùng khi có truyện/chapter mới nhưng nút Làm mới chưa đủ).
            </NAlert>
          </NSpace>
        </NCard>
      </NGi>

      <NGi>
        <NCard title="Kho truyện" size="small">
          <NSpace vertical size="large">
            <NText depth="2">
              Đang có <strong>{{ libraryStore.libraries.length }}</strong> kho.
            </NText>
            <NButton secondary style="align-self: flex-start" @click="libraryStore.openManager()">
              Quản lý kho
            </NButton>
          </NSpace>
        </NCard>

        <NDivider />

        <NCard title="Tài khoản" size="small">
          <NSpace vertical size="large">
            <NText v-if="auth.user">
              <strong>{{ auth.user.displayName }}</strong><br />
              <NText depth="3">{{ auth.user.emailAddress }}</NText>
            </NText>
            <NAlert type="info" :bordered="false" style="font-size: 13px">
              Token không lưu trên thiết bị — mỗi lần mở trang, app tự xin token mới từ Google.
            </NAlert>
            <NButton secondary type="error" style="align-self: flex-start" @click="logout">
              Đăng xuất
            </NButton>
          </NSpace>
        </NCard>
      </NGi>
    </NGrid>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}
</style>
