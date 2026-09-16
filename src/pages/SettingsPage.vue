<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
  NSwitch,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import {
  clearBlobs,
  clearListCache,
  clearProgress,
  clearAllCaches,
  deleteDatabase,
  storageEstimate,
} from '@/lib/db'
import { useAuthStore } from '@/stores/auth'
import { useLibraryStore } from '@/stores/library'
import { useSyncStore } from '@/stores/sync'

const router = useRouter()
const auth = useAuthStore()
const libraryStore = useLibraryStore()
const syncStore = useSyncStore()
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
  confirmClear('Xóa toàn bộ ảnh/PDF đã lưu trên thiết bị?', async () => {
    await clearBlobs()
  })
}

function clearLists(): void {
  confirmClear(
    'Xóa danh sách truyện/chapter đã lưu?\nLần tới mở, ứng dụng sẽ tải lại từ Google Drive.',
    async () => {
      await clearListCache()
    },
  )
}

function clearReadingProgress(): void {
  confirmClear('Xóa toàn bộ tiến trình đọc?', async () => {
    await clearProgress()
    // Ghi mốc wipe để các thiết bị khác cũng xóa khi đồng bộ
    await syncStore.noteProgressWipe()
  })
}

function clearEverything(): void {
  confirmClear('Xóa toàn bộ dữ liệu đã lưu + tiến trình đọc?', async () => {
    await clearAllCaches()
    await syncStore.noteProgressWipe()
  })
}

/** Đặt lại app từ đầu: xóa hẳn database + tải lại trang (không chỉ cache). */
function resetApp(): void {
  dialog.error({
    title: 'Đặt lại ứng dụng?',
    content:
      'Xóa sạch mọi dữ liệu ứng dụng lưu trên thiết bị: kho truyện, tiến trình đọc, đánh dấu và ' +
      'ảnh/PDF đã lưu. Trang sẽ tải lại ngay sau đó. Nếu đang bật đồng bộ, dữ liệu sẽ được tự kéo lại ' +
      'từ Google Drive.',
    positiveText: 'Xóa & tải lại',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      await deleteDatabase()
      location.reload()
    },
  })
}

function formatSyncTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  })
}

const syncStatusText = computed(() => {
  if (syncStore.status === 'syncing') return 'Đang đồng bộ...'
  if (syncStore.lastSyncAt) return `Đồng bộ lần cuối ${formatSyncTime(syncStore.lastSyncAt)}`
  return 'Chưa đồng bộ'
})

function logout(): void {
  dialog.warning({
    title: 'Đăng xuất?',
    content: 'Bạn cần đăng nhập lại để tiếp tục đọc.',
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
        <NCard title="Dữ liệu lưu trên thiết bị" size="small">
          <NSpace vertical size="large">
            <div>
              <NSpace align="center" justify="space-between">
                <NText
                  >Đã dùng: <strong>{{ formatBytes(usage) }}</strong></NText
                >
                <NButton size="tiny" quaternary title="Tính lại dung lượng" @click="refreshUsage">
                  <template #icon>
                    <AppIcon name="refresh" :size="14" />
                  </template>
                </NButton>
              </NSpace>
              <NProgress
                type="line"
                :percentage="quota ? Math.min(100, (usage / quota) * 100) : 0"
                :indicator-placement="'inside'"
                style="margin-top: 8px"
              />
              <NText depth="3" style="font-size: 12px">
                Dung lượng trình duyệt cho phép: {{ formatBytes(quota) }}
              </NText>
            </div>

            <NSpace size="small" style="flex-wrap: wrap">
              <NButton size="small" secondary type="warning" @click="clearImages"
                >Xóa ảnh/PDF đã lưu</NButton
              >
              <NButton size="small" secondary type="warning" @click="clearLists"
                >Xóa danh sách đã lưu</NButton
              >
              <NButton size="small" secondary @click="clearReadingProgress"
                >Xóa tiến trình đọc</NButton
              >
              <NButton size="small" secondary type="error" @click="clearEverything"
                >Xóa tất cả</NButton
              >
              <NButton size="small" secondary type="error" @click="resetApp"
                >Đặt lại ứng dụng</NButton
              >
            </NSpace>

            <NAlert type="info" :bordered="false" style="font-size: 13px">
              Ảnh/PDF từng đọc được lưu sẵn trên thiết bị nên lần sau mở không tốn mạng. "Xóa danh
              sách đã lưu" buộc ứng dụng tải lại kho từ Drive — dùng khi có truyện/chapter mới nhưng
              nút Làm mới chưa đủ.
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
              <template #icon>
                <AppIcon name="library" :size="16" />
              </template>
              Quản lý kho
            </NButton>
          </NSpace>
        </NCard>

        <NDivider />

        <NCard title="Đồng bộ đa thiết bị" size="small">
          <NSpace vertical size="large">
            <NSpace align="center" justify="space-between">
              <NText>Đồng bộ qua Google Drive</NText>
              <NSwitch
                size="small"
                :value="syncStore.enabled"
                @update:value="syncStore.setEnabled"
              />
            </NSpace>
            <NText depth="3" style="font-size: 13px">
              Tiến độ đọc, danh sách kho (kèm kho đang chọn) và đánh dấu truyện/nhóm được lưu vào một
              thư mục ẩn trên Drive của bạn — chỉ ứng dụng này thấy được, không hiện trong My Drive —
              và tự tải mỗi khi mở trang. Cùng tài khoản Google = cùng dữ liệu trên mọi thiết bị.
            </NText>
            <NAlert
              v-if="syncStore.status === 'error'"
              type="error"
              :bordered="false"
              style="font-size: 13px"
            >
              {{ syncStore.error || 'Đồng bộ bị lỗi' }}
            </NAlert>
            <NSpace align="center" size="small">
              <NButton
                size="small"
                secondary
                :loading="syncStore.status === 'syncing'"
                :disabled="!auth.authed"
                @click="syncStore.syncNow()"
              >
                Đồng bộ ngay
              </NButton>
              <NText depth="3" style="font-size: 12px">{{ syncStatusText }}</NText>
            </NSpace>
          </NSpace>
        </NCard>

        <NDivider />

        <NCard title="Tài khoản" size="small">
          <NSpace vertical size="large">
            <NText v-if="auth.user">
              <strong>{{ auth.user.displayName }}</strong
              ><br />
              <NText depth="3">{{ auth.user.emailAddress }}</NText>
            </NText>
            <NAlert type="info" :bordered="false" style="font-size: 13px">
              Phiên đăng nhập không lưu trên thiết bị — mỗi lần mở trang, ứng dụng tự kết nối lại
              với Google.
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

@media (max-width: 640px) {
  .settings-page {
    padding: 12px;
  }
}
</style>
