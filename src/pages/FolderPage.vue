<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NEmpty, NGrid, NGridItem, NInput, NSpace, NSpin, NText } from 'naive-ui'

import StoryCard from '@/components/StoryCard.vue'
import { getFileMeta, listChildrenGrouped, toErrorMessage } from '@/lib/driveApi'
import { naturalSort } from '@/lib/naturalSort'
import { FOLDER_MIME, type StorySummary } from '@/lib/scanner'
import { useStoriesStore } from '@/stores/stories'

const route = useRoute()
const router = useRouter()
const storiesStore = useStoriesStore()

const folderId = computed(() =>
  typeof route.params.folderId === 'string' ? route.params.folderId : '',
)
const libId = computed(() => (typeof route.params.libId === 'string' ? route.params.libId : ''))

/** Tên folder truyền theo query khi điều hướng; F5 trực tiếp thì fetch metadata */
const folderName = ref(typeof route.query.name === 'string' ? route.query.name : '')

const children = ref<StorySummary[]>([])
const loading = ref(false)
const error = ref('')
const search = ref('')

const marked = computed(() => Boolean(storiesStore.marks[folderId.value]))
const groupMarked = computed(() => Boolean(storiesStore.groups[folderId.value]))

function deaccent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

const filteredChildren = computed(() => {
  const query = deaccent(search.value.trim())
  if (!query) return children.value
  return children.value.filter((child) => deaccent(child.name).includes(query))
})

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    if (!folderName.value) {
      const meta = await getFileMeta(folderId.value)
      folderName.value = meta.name
    }
    // Chỉ cần folder con (ảnh/file lẻ bị bỏ qua) — KHÔNG quét chapter gì ở đây,
    // user tự quyết định từng folder bên dưới
    const grouped = await listChildrenGrouped([folderId.value])
    const items = (grouped.get(folderId.value) ?? []).filter(
      (item) => item.mimeType === FOLDER_MIME,
    )
    children.value = naturalSort(
      items.map((item) => ({ id: item.id, name: item.name, modifiedTime: item.modifiedTime })),
      (child) => child.name,
    )
  } catch (e) {
    error.value = toErrorMessage(e)
  } finally {
    loading.value = false
  }
}

/** User xác nhận folder hiện tại là truyện → đánh dấu + vào danh sách chapter */
async function markCurrentAsStory(): Promise<void> {
  await storiesStore.markAsStory(folderId.value)
  void router.push({ name: 'story', params: { libId: libId.value, storyId: folderId.value } })
}

/** Card đã đánh dấu → vào chapter; chưa đánh dấu → xem sâu hơn để quyết định */
function onCardClick(child: StorySummary): void {
  if (storiesStore.marks[child.id]) {
    void router.push({
      name: 'story',
      params: { libId: libId.value, storyId: child.id },
      query: { fromFolderId: folderId.value, fromFolderName: folderName.value },
    })
    return
  }
  void router.push({
    name: 'folder',
    params: { libId: libId.value, folderId: child.id },
    query: { name: child.name },
  })
}

function markChild(child: StorySummary): void {
  void storiesStore.markAsStory(child.id)
}

async function unmarkGroup(): Promise<void> {
  await storiesStore.unmarkGroup(folderId.value)
}

onMounted(() => {
  void storiesStore.loadMarks()
  void load()
})

watch(folderId, () => {
  folderName.value = typeof route.query.name === 'string' ? route.query.name : ''
  children.value = []
  void load()
})
</script>

<template>
  <div class="folder-page">
    <div class="toolbar">
      <NSpace align="center" size="small">
        <NButton
          quaternary
          size="small"
          :disabled="!libId"
          @click="router.push({ name: 'library', params: { libId } })"
        >
          ← Kho
        </NButton>
        <NText strong class="folder-title">{{ folderName || 'Thư mục' }}</NText>
      </NSpace>
      <NSpace size="small">
        <NInput
          v-model:value="search"
          placeholder="Tìm..."
          clearable
          size="small"
          style="width: 200px"
        />
        <NButton size="small" secondary :loading="loading" @click="load()">↻ Làm mới</NButton>
      </NSpace>
    </div>

    <!-- Quyết định của user: folder này là truyện hay list truyện -->
    <NAlert
      v-if="!marked && !groupMarked"
      type="info"
      :bordered="false"
      style="margin-bottom: 14px"
    >
      <NSpace align="center" size="small">
        <span> Thư mục này là <strong>truyện</strong> hay <strong>danh sách truyện</strong>? </span>
        <NButton size="small" type="primary" secondary @click="markCurrentAsStory">
          📖 Đây là truyện — đọc ngay
        </NButton>
        <NText depth="3" style="font-size: 12px"
          >(là danh sách thì bấm vào từng truyện bên dưới)</NText
        >
      </NSpace>
    </NAlert>

    <NAlert v-else-if="groupMarked" type="success" :bordered="false" style="margin-bottom: 14px">
      <NSpace align="center" size="small">
        <span>
          Đã đánh dấu là <strong>nhóm chapter</strong> — chapter bên trong sẽ hiện cùng cấp trong
          truyện chứa nó.
        </span>
        <NButton size="tiny" secondary @click="unmarkGroup">Bỏ đánh dấu</NButton>
      </NSpace>
    </NAlert>

    <NAlert
      v-if="error"
      type="error"
      :title="error"
      style="margin-bottom: 12px"
      closable
      @close="error = ''"
    />

    <div v-if="loading && !children.length" class="center-msg">
      <NSpin />
      <NText depth="3">Đang tải...</NText>
    </div>

    <NEmpty
      v-else-if="!filteredChildren.length"
      description="Thư mục trống"
      style="margin-top: 60px"
    />

    <NGrid v-else cols="1 s:2 m:3 l:4 xl:5" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem v-for="child in filteredChildren" :key="child.id">
        <StoryCard
          :story="child"
          @click="onCardClick(child)"
          @open-folder="
            router.push({
              name: 'folder',
              params: { libId, folderId: child.id },
              query: { name: child.name },
            })
          "
          @mark-story="markChild(child)"
        />
      </NGridItem>
    </NGrid>
  </div>
</template>

<style scoped>
.folder-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.folder-title {
  font-size: 18px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50vw;
}

.center-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 60px;
}
</style>
