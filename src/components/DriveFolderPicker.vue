<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NEmpty, NInput, NSpace, NSpin, NText } from 'naive-ui'

import { listChildren, listSharedFolders, searchFolders, toErrorMessage } from '@/lib/driveApi'
import { naturalSort } from '@/lib/naturalSort'
import { FOLDER_MIME } from '@/lib/scanner'

interface PickerFolder {
  id: string
  name: string
}

const emit = defineEmits<{ select: [folder: PickerFolder] }>()

/** 2 gốc duyệt: Drive của mình / folder được chia sẻ (kho viewer thường nằm đây) */
type RootKind = 'home' | 'shared'

const ROOTS: Array<{ kind: RootKind; label: string }> = [
  { kind: 'home', label: '☁️ My Drive' },
  { kind: 'shared', label: '👥 Đã chia sẻ với tôi' },
]

const ROOT_LABELS: Record<RootKind, string> = {
  home: '☁️ My Drive',
  shared: '👥 Đã chia sẻ với tôi',
}

const rootKind = ref<RootKind>('shared')
/** Folder đã đi vào, tính từ gốc — phần tử cuối là folder đang xem (chọn được) */
const path = ref<PickerFolder[]>([])
const items = ref<PickerFolder[]>([])
const loading = ref(false)
const error = ref('')

/** Search theo tên — chạy trên toàn bộ Drive, thay danh sách duyệt bằng kết quả */
const search = ref('')
const searching = ref(false)
const searchResults = ref<PickerFolder[]>([])
const searchError = ref('')

let loadSeq = 0
let searchSeq = 0
let searchAbort: AbortController | null = null
let searchTimer: ReturnType<typeof setTimeout> | undefined

const searchingActive = computed(() => search.value.trim() !== '')
const canSelect = computed(() => path.value.length > 0 && !searchingActive.value)
const currentName = computed(
  () => path.value[path.value.length - 1]?.name ?? ROOT_LABELS[rootKind.value],
)
const titleText = computed(() =>
  searchingActive.value ? `Tìm: ${search.value.trim()}` : currentName.value,
)
const emptyText = computed(() =>
  rootKind.value === 'shared' && path.value.length === 0
    ? 'Không có folder nào được chia sẻ với bạn'
    : 'Không có folder con',
)
const activeError = computed(() => (searchingActive.value ? searchError.value : error.value))

async function load(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  error.value = ''
  items.value = []
  try {
    const current = path.value[path.value.length - 1]
    const raw =
      current === undefined
        ? rootKind.value === 'home'
          ? await listChildren('root')
          : await listSharedFolders()
        : await listChildren(current.id)
    if (seq !== loadSeq) return
    items.value = naturalSort(
      raw.filter((item) => item.mimeType === FOLDER_MIME),
      (folder) => folder.name,
    )
  } catch (e) {
    if (seq !== loadSeq) return
    error.value = toErrorMessage(e)
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(search, (value) => {
  clearTimeout(searchTimer)
  const query = value.trim()
  if (!query) {
    // Xóa ô tìm → quay lại danh sách duyệt đang dở
    searchAbort?.abort()
    searchSeq++
    searching.value = false
    searchResults.value = []
    searchError.value = ''
    return
  }
  searchTimer = setTimeout(() => void runSearch(query), 400)
})

async function runSearch(query: string): Promise<void> {
  searchAbort?.abort()
  const controller = new AbortController()
  searchAbort = controller
  const seq = ++searchSeq
  searching.value = true
  searchError.value = ''
  try {
    const found = await searchFolders(query, { signal: controller.signal })
    if (seq !== searchSeq) return
    searchResults.value = naturalSort(
      found.filter((item) => item.mimeType === FOLDER_MIME),
      (folder) => folder.name,
    )
  } catch (e) {
    if (seq !== searchSeq) return
    searchError.value = toErrorMessage(e)
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}

function retry(): void {
  if (searchingActive.value) void runSearch(search.value.trim())
  else void load()
}

function switchRoot(kind: RootKind): void {
  search.value = ''
  if (rootKind.value === kind) return
  rootKind.value = kind
  path.value = []
  void load()
}

function openFolder(folder: PickerFolder): void {
  path.value = [...path.value, folder]
  void load()
}

/** Vào folder từ kết quả tìm — đặt lại stack thành đúng folder đó rồi duyệt tiếp */
function openFromSearch(folder: PickerFolder): void {
  search.value = ''
  path.value = [folder]
  void load()
}

function goBack(): void {
  if (searchingActive.value) {
    search.value = ''
    return
  }
  path.value = path.value.slice(0, -1)
  void load()
}

function confirmSelect(): void {
  const folder = path.value[path.value.length - 1]
  if (folder) emit('select', folder)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div>
    <div class="picker-bar">
      <NButton
        quaternary
        size="small"
        :disabled="path.length === 0 && !searchingActive"
        @click="goBack"
      >
        ←
      </NButton>
      <NText strong class="picker-title" :title="titleText">{{ titleText }}</NText>
      <NButton size="small" type="primary" secondary :disabled="!canSelect" @click="confirmSelect">
        ✓ Chọn folder này
      </NButton>
    </div>

    <div class="picker-roots">
      <NButton
        v-for="root in ROOTS"
        :key="root.kind"
        size="small"
        :type="rootKind === root.kind ? 'primary' : 'default'"
        secondary
        @click="switchRoot(root.kind)"
      >
        {{ root.label }}
      </NButton>
      <NInput
        v-model:value="search"
        size="small"
        placeholder="Tìm folder theo tên..."
        clearable
        class="picker-search"
      />
    </div>

    <NAlert v-if="activeError" type="error" style="margin-bottom: 8px">
      <NSpace align="center" size="small">
        <span>{{ activeError }}</span>
        <NButton size="tiny" secondary @click="retry">Thử lại</NButton>
      </NSpace>
    </NAlert>

    <div class="picker-list">
      <template v-if="searchingActive">
        <div v-if="searching" class="picker-loading">
          <NSpin size="small" />
        </div>
        <NEmpty
          v-else-if="!searchResults.length"
          size="small"
          description="Không tìm thấy folder nào"
          style="margin: 24px 0"
        />
        <template v-else>
          <NButton
            v-for="folder in searchResults"
            :key="folder.id"
            quaternary
            class="folder-row"
            @click="openFromSearch(folder)"
          >
            📁 {{ folder.name }}
          </NButton>
        </template>
      </template>

      <template v-else>
        <div v-if="loading" class="picker-loading">
          <NSpin size="small" />
        </div>
        <NEmpty
          v-else-if="!items.length"
          size="small"
          :description="emptyText"
          style="margin: 24px 0"
        />
        <template v-else>
          <NButton
            v-for="folder in items"
            :key="folder.id"
            quaternary
            class="folder-row"
            @click="openFolder(folder)"
          >
            📁 {{ folder.name }}
          </NButton>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picker-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.picker-roots {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 10px;
}

.picker-search {
  flex: 1;
}

.picker-list {
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.picker-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
}

.folder-row {
  justify-content: flex-start;
}

.folder-row :deep(.n-button__content) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
