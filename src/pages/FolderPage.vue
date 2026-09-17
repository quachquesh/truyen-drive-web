<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NAlert, NButton, NEmpty, NGrid, NGridItem, NInput, NSpin, NText } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import StoryCard from '@/components/StoryCard.vue'
import { getFileMeta, listChildrenGrouped, toErrorMessage } from '@/lib/driveApi'
import { naturalSort } from '@/lib/naturalSort'
import { FOLDER_MIME, annotateLastModified, type StorySummary } from '@/lib/scanner'
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
const listMarked = computed(() => Boolean(storiesStore.lists[folderId.value]))

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
    const folders = naturalSort(
      items.map((item) => ({ id: item.id, name: item.name, modifiedTime: item.modifiedTime })),
      (child) => child.name,
    )
    // Drive không bump ngày folder cha khi thêm con → tính ngày cập nhật hiệu dụng
    await annotateLastModified(folders, { groupMarks: storiesStore.groupMarkSet() })
    children.value = folders
    // Folder con đã đánh dấu truyện: điền số chap/mới nhất từ cache, cache cũ hơn
    // lastModified (owner vừa thêm chap) thì quét lại — như Làm mới của LibraryPage
    await storiesStore.loadMarks()
    await storiesStore.refreshMarkedChapters(folders, storiesStore.gen)
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

/** User xác nhận folder hiện tại chỉ là danh sách chứa nhiều truyện */
async function markCurrentAsList(): Promise<void> {
  await storiesStore.markAsList(folderId.value)
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

async function unmarkList(): Promise<void> {
  await storiesStore.unmarkList(folderId.value)
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
      <NButton
        secondary
        :disabled="!libId"
        @click="router.push({ name: 'library', params: { libId } })"
      >
        <template #icon>
          <AppIcon name="arrow-left" :size="16" />
        </template>
        Kho truyện
      </NButton>
      <NText strong class="folder-title">{{ folderName || 'Thư mục' }}</NText>
      <div class="spacer" />
      <NInput v-model:value="search" placeholder="Tìm..." clearable class="search-input">
        <template #prefix>
          <AppIcon name="search" :size="16" />
        </template>
      </NInput>
      <NButton secondary :loading="loading" @click="load()">
        <template #icon>
          <AppIcon name="refresh" :size="16" />
        </template>
        Làm mới
      </NButton>
    </div>

    <!-- Quyết định của user: folder này là truyện hay list truyện -->
    <div v-if="!marked && !groupMarked && !listMarked" class="classify-banner">
      <div class="classify-title">
        Thư mục này là <strong>một bộ truyện</strong> hay <strong>một danh sách truyện</strong>?
      </div>
      <div class="classify-actions">
        <NButton type="primary" @click="markCurrentAsStory">
          <template #icon>
            <AppIcon name="book-open" :size="16" />
          </template>
          Đây là một bộ truyện — đọc ngay
        </NButton>
        <NButton secondary @click="markCurrentAsList">
          <template #icon>
            <AppIcon name="layers" :size="16" />
          </template>
          Đây là danh sách nhiều truyện
        </NButton>
      </div>
      <NText depth="3" class="classify-hint">
        Chưa chắc? Bấm vào từng thư mục bên dưới để xem bên trong có gì.
      </NText>
    </div>

    <NAlert v-else-if="listMarked" type="success" :bordered="false" style="margin-bottom: 14px">
      <div class="group-marked-row">
        <span>
          Đã ghi nhớ đây là <strong>danh sách nhiều truyện</strong> — mở thư mục để xem và phân
          loại từng truyện bên trong.
        </span>
        <NButton size="small" secondary @click="unmarkList">Bỏ đánh dấu</NButton>
      </div>
    </NAlert>

    <NAlert v-else-if="groupMarked" type="success" :bordered="false" style="margin-bottom: 14px">
      <div class="group-marked-row">
        <span>
          Đã ghi nhớ đây là <strong>nhóm chapter</strong> — chapter bên trong sẽ hiện luôn trong
          truyện chứa nó.
        </span>
        <NButton size="small" secondary @click="unmarkGroup">Bỏ đánh dấu</NButton>
      </div>
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

    <NGrid v-else cols="1 s:2 m:3 l:4" responsive="screen" :x-gap="12" :y-gap="12">
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

.spacer {
  flex: 1;
}

.search-input {
  width: min(220px, 100%);
}

.classify-banner {
  background: var(--tdw-primary-soft);
  border: 1px solid rgba(24, 160, 88, 0.35);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
}

.classify-title {
  margin-bottom: 12px;
}

.classify-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.classify-hint {
  font-size: 12px;
  margin-top: 10px;
  display: block;
}

.group-marked-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.center-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 60px;
}

@media (max-width: 640px) {
  .folder-page {
    padding: 12px;
  }

  .toolbar {
    gap: 8px;
  }

  .folder-title {
    max-width: 100%;
    order: -1;
    flex-basis: 100%;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .search-input {
    flex: 1;
    width: auto;
  }
}
</style>
