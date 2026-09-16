<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NAlert, NButton, NEmpty, NSpace, NSpin, NText } from 'naive-ui'

import { listChildren, listSharedFolders, toErrorMessage } from '@/lib/driveApi'
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

let loadSeq = 0

const canSelect = computed(() => path.value.length > 0)
const currentName = computed(
  () => path.value[path.value.length - 1]?.name ?? ROOT_LABELS[rootKind.value],
)
const emptyText = computed(() =>
  rootKind.value === 'shared' && path.value.length === 0
    ? 'Không có folder nào được chia sẻ với bạn'
    : 'Không có folder con',
)

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

function switchRoot(kind: RootKind): void {
  if (rootKind.value === kind) return
  rootKind.value = kind
  path.value = []
  void load()
}

function openFolder(folder: PickerFolder): void {
  path.value = [...path.value, folder]
  void load()
}

function goBack(): void {
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
      <NButton quaternary size="small" :disabled="path.length === 0" @click="goBack">
        ←
      </NButton>
      <NText strong class="picker-title" :title="currentName">{{ currentName }}</NText>
      <NButton
        size="small"
        type="primary"
        secondary
        :disabled="!canSelect"
        @click="confirmSelect"
      >
        ✓ Chọn folder này
      </NButton>
    </div>

    <NSpace size="small" style="margin: 8px 0 10px">
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
    </NSpace>

    <NAlert v-if="error" type="error" style="margin-bottom: 8px">
      <NSpace align="center" size="small">
        <span>{{ error }}</span>
        <NButton size="tiny" secondary @click="load()">Thử lại</NButton>
      </NSpace>
    </NAlert>

    <div class="picker-list">
      <div v-if="loading" class="picker-loading">
        <NSpin size="small" />
      </div>
      <NEmpty v-else-if="!items.length" size="small" :description="emptyText" style="margin: 24px 0" />
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
