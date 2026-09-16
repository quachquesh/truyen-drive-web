<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NSpace,
  NSwitch,
  NTag,
  NText,
  NVirtualList,
} from 'naive-ui'

import { toErrorMessage } from '@/lib/driveApi'
import { getCache, getProgress, type ProgressRecord } from '@/lib/db'
import type { ChapterRef, StorySummary } from '@/lib/scanner'
import { useStoriesStore } from '@/stores/stories'
import { useDialog } from 'naive-ui'

const ITEM_HEIGHT = 48

const route = useRoute()
const router = useRouter()
const storiesStore = useStoriesStore()
const dialog = useDialog()

const libId = computed(() => (typeof route.params.libId === 'string' ? route.params.libId : ''))
const storyId = computed(() => (typeof route.params.storyId === 'string' ? route.params.storyId : ''))
const fromFolderId = computed(() =>
  typeof route.query.fromFolderId === 'string' ? route.query.fromFolderId : '',
)
const fromFolderName = computed(() =>
  typeof route.query.fromFolderName === 'string' ? route.query.fromFolderName : '',
)
const progressKey = computed(() => `${libId.value}:${storyId.value}`)

const storyName = ref('')
const chapters = ref<ChapterRef[]>([])
const loading = ref(false)
const error = ref('')
const progress = ref<ProgressRecord | null>(null)
const search = ref('')
const newestFirst = ref(false)

async function resolveStoryName(): Promise<void> {
  let name = storiesStore.storyName(storyId.value)
  if (!name) {
    const cached = await getCache<StorySummary[]>(`stories:${libId.value}`)
    name = cached?.data.find((story) => story.id === storyId.value)?.name ?? ''
  }
  storyName.value = name || 'Truyện'
}

async function load(force: boolean): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    await resolveStoryName()
    chapters.value = await storiesStore.ensureChapters(libId.value, storyId.value, { force })
    progress.value = (await getProgress(progressKey.value)) ?? null
  } catch (e) {
    error.value = toErrorMessage(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => void load(false))

const filteredChapters = computed(() => {
  const query = search.value.trim().toLowerCase()
  let list = chapters.value
  if (query) list = list.filter((chapter) => chapter.name.toLowerCase().includes(query))
  return newestFirst.value ? [...list].reverse() : list
})

function openChapter(chapter: ChapterRef): void {
  void router.push({
    name: 'reader',
    params: { libId: libId.value, storyId: storyId.value, chapterId: chapter.id },
  })
}

function continueReading(): void {
  const chapterId = progress.value?.chapterId
  if (!chapterId) return
  const chapter = chapters.value.find((item) => item.id === chapterId)
  if (chapter) openChapter(chapter)
}

function backToPrev(): void {
  // Vào từ trang folder → quay đúng folder đó, không thì về kho
  if (fromFolderId.value) {
    void router.push({
      name: 'folder',
      params: { libId: libId.value, folderId: fromFolderId.value },
      query: { name: fromFolderName.value },
    })
    return
  }
  void router.push({ name: 'library', params: { libId: libId.value } })
}

/** Bỏ đánh dấu "là truyện" — folder về lại trạng thái chưa phân loại */
function unmark(): void {
  dialog.warning({
    title: 'Bỏ đánh dấu truyện?',
    content: 'Folder này sẽ trở lại "Chưa phân loại" (cache chapter vẫn giữ để dùng lại sau).',
    positiveText: 'Bỏ đánh dấu',
    negativeText: 'Để lại',
    onPositiveClick: async () => {
      await storiesStore.unmarkStory(storyId.value)
      backToPrev()
    },
  })
}

/** Đánh dấu dòng chapter này thực chất là NHÓM (kiểu "0-80") → đưa con lên cùng cấp */
function markGroup(chapter: ChapterRef): void {
  dialog.warning({
    title: `Đánh dấu "${chapter.name}" là nhóm chapter?`,
    content:
      'Các folder con bên trong sẽ được đưa lên thay thế nó ở cùng cấp (nhóm lồng nhau cứ đánh dấu tiếp). Danh sách sẽ quét lại sau khi đánh dấu.',
    positiveText: 'Đánh dấu nhóm',
    negativeText: 'Hủy',
    onPositiveClick: async () => {
      await storiesStore.markAsGroup(chapter.id)
      await load(true)
    },
  })
}
</script>

<template>
  <div class="story-page">
    <div class="toolbar">
      <NButton quaternary size="small" @click="backToPrev">← {{ fromFolderId ? 'Thư mục' : 'Kho truyện' }}</NButton>
      <h2 class="story-title">{{ storyName }}</h2>
      <NTag v-if="chapters.length" size="small" type="info">{{ chapters.length }} chap</NTag>
    </div>

    <NAlert
      v-if="error"
      type="error"
      :title="error"
      style="margin-bottom: 12px"
      closable
      @close="error = ''"
    >
      <NButton size="small" style="margin-top: 8px" @click="load(true)">Thử lại</NButton>
    </NAlert>

    <NSpace v-if="!error" align="center" size="small" style="margin-bottom: 12px">
      <NInput v-model:value="search" placeholder="Tìm chapter..." clearable size="small" style="width: 220px" />
      <NText depth="3" style="font-size: 13px">Mới nhất trước</NText>
      <NSwitch v-model:value="newestFirst" size="small" />
      <div style="flex: 1" />
      <NButton
        v-if="progress"
        size="small"
        type="primary"
        secondary
        @click="continueReading"
      >
        ▶ Tiếp tục: {{ progress.chapterName }}
      </NButton>
      <NButton size="small" secondary :loading="loading" title="Quét lại chapter từ Drive" @click="load(true)">
        ↻ Làm mới
      </NButton>
      <NButton
        v-if="storiesStore.marks[storyId]"
        size="small"
        quaternary
        title="Folder này không phải truyện — bỏ đánh dấu"
        @click="unmark"
      >
        Đây không phải truyện?
      </NButton>
    </NSpace>

    <div v-if="loading && !chapters.length" class="center-msg">
      <NText depth="3">Đang quét chapter...</NText>
    </div>

    <NEmpty v-else-if="!filteredChapters.length" description="Không có chapter" style="margin-top: 60px" />

    <NVirtualList
      v-else
      :items="filteredChapters"
      :item-size="ITEM_HEIGHT"
      style="max-height: calc(100vh - 210px)"
      :item-resizable="false"
    >
      <template #default="{ item }">
        <div
          :key="item.id"
          class="chapter-row"
          :class="{ current: item.id === progress?.chapterId }"
          @click="openChapter(item)"
        >
          <span class="chapter-name">{{ item.name }}</span>
          <NSpace size="small" align="center">
            <NTag v-if="item.id === progress?.chapterId" size="tiny" type="success">Đang đọc</NTag>
            <NButton
              text
              size="tiny"
              class="group-btn"
              title="Đây là NHÓM chapter (kiểu 0-80) — đưa chapter con lên cùng cấp"
              @click.stop="markGroup(item)"
            >
              ⤴ Nhóm
            </NButton>
          </NSpace>
        </div>
      </template>
    </NVirtualList>
  </div>
</template>

<style scoped>
.story-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.story-title {
  margin: 0;
  font-size: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.center-msg {
  display: flex;
  justify-content: center;
  margin-top: 60px;
}

.chapter-row {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.14);
  cursor: pointer;
}

.chapter-row:hover {
  background: rgba(128, 128, 128, 0.08);
}

.chapter-row.current {
  background: rgba(24, 160, 88, 0.1);
}

.chapter-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-count {
  font-size: 12px;
  white-space: nowrap;
}

.group-btn {
  opacity: 0;
}

.chapter-row:hover .group-btn {
  opacity: 0.75;
}
</style>
