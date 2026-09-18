<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NEmpty,
  NInput,
  NSwitch,
  NTag,
  NText,
  NVirtualList,
  useDialog,
} from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import { toErrorMessage } from '@/lib/driveApi'
import { formatDate } from '@/lib/dates'
import { getCache, getProgress, type ProgressRecord } from '@/lib/db'
import { displayProgress } from '@/lib/progress'
import type { ChapterRef, StorySummary } from '@/lib/scanner'
import { useStoriesStore } from '@/stores/stories'
import { useSyncStore } from '@/stores/sync'

const ITEM_HEIGHT = 48

const route = useRoute()
const router = useRouter()
const storiesStore = useStoriesStore()
const syncStore = useSyncStore()
const dialog = useDialog()

const libId = computed(() => (typeof route.params.libId === 'string' ? route.params.libId : ''))
const storyId = computed(() =>
  typeof route.params.storyId === 'string' ? route.params.storyId : '',
)
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

/** Thứ tự chapter (mới nhất trước) — nhớ lựa chọn của user */
const SORT_KEY = 'tdw-chapter-sort'
const newestFirst = ref(localStorage.getItem(SORT_KEY) === 'newest')
watch(newestFirst, (value) => {
  localStorage.setItem(SORT_KEY, value ? 'newest' : 'oldest')
})

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
    await refreshProgress()
  } catch (e) {
    error.value = toErrorMessage(e)
  } finally {
    loading.value = false
  }
}

/** Đọc lại tiến độ — gọi cả khi sync đa thiết bị vừa ghi record mới */
async function refreshProgress(): Promise<void> {
  progress.value = (await getProgress(progressKey.value)) ?? null
}

onMounted(() => void load(false))

// Sync ghi progress mới (đọc tiếp trên máy khác) → "Tiếp tục" tự nhảy theo, khỏi bấm Làm mới
watch(
  () => syncStore.progressRev,
  () => void refreshProgress(),
)

const filteredChapters = computed(() => {
  const query = search.value.trim().toLowerCase()
  let list = chapters.value
  if (query) list = list.filter((chapter) => chapter.name.toLowerCase().includes(query))
  return newestFirst.value ? [...list].reverse() : list
})

/** Nhãn nút Tiếp tục: kèm "45/100" — vị trí tính theo danh sách chapter HIỆN TẠI
 * (đánh dấu nhóm / chap mới làm đổi danh sách), fallback số ghi lúc đọc */
const continueText = computed(() => {
  const record = progress.value
  if (!record) return ''
  const index = chapters.value.findIndex((chapter) => chapter.id === record.chapterId)
  const display = displayProgress(record, { index, total: chapters.value.length })
  return display ? `${record.chapterName} (${display.no}/${display.total})` : record.chapterName
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
    content: 'Thư mục này sẽ trở lại trạng thái "Chưa phân loại". Danh sách chapter đã quét vẫn được giữ lại.',
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
      await storiesStore.markAsGroup(chapter.id, storyId.value)
      await load(true)
    },
  })
}

/** Các nhóm đã đánh dấu của truyện (thu được khi quét subtree) */
const storyGroups = computed(() => storiesStore.groupsByStory[storyId.value] ?? [])

/** Hủy toàn bộ nhóm đã đánh dấu → folder nhóm hiện lại thành chapter như ban đầu */
function unmarkAllGroups(): void {
  const groups = storyGroups.value
  if (!groups.length) return
  // Liệt kê tối đa 5 tên rồi rút gọn — dialog không cao tràn màn hình nhỏ
  const shown = groups.slice(0, 5).map((group) => `"${group.name}"`).join(', ')
  const hidden = groups.length - 5
  const nameList = hidden > 0 ? `${shown}… và ${hidden} nhóm khác` : shown
  dialog.warning({
    title: `Hủy ${groups.length} nhóm đã đánh dấu?`,
    content: `Các nhóm ${nameList} sẽ bị bỏ đánh dấu — folder nhóm hiện lại thành chapter như ban đầu. Danh sách sẽ quét lại sau khi hủy.`,
    positiveText: 'Hủy nhóm',
    negativeText: 'Để lại',
    onPositiveClick: async () => {
      await storiesStore.unmarkGroups(
        groups.map((group) => group.id),
        storyId.value,
      )
      await load(true)
    },
  })
}
</script>

<template>
  <div class="story-page">
    <div class="toolbar">
      <NButton secondary @click="backToPrev">
        <template #icon>
          <AppIcon name="arrow-left" :size="16" />
        </template>
        {{ fromFolderId ? 'Thư mục' : 'Kho truyện' }}
      </NButton>
      <h2 class="story-title">{{ storyName }}</h2>
      <NTag v-if="chapters.length" size="small" type="info" class="chap-count">{{
        chapters.length
      }} chap</NTag>
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

    <div v-if="!error" class="actions">
      <NInput v-model:value="search" placeholder="Tìm chapter..." clearable class="search-input">
        <template #prefix>
          <AppIcon name="search" :size="16" />
        </template>
      </NInput>
      <label class="sort-toggle">
        <NText depth="3" style="font-size: 13px">Mới nhất trước</NText>
        <NSwitch v-model:value="newestFirst" size="small" />
      </label>
      <div class="spacer" />
      <NButton v-if="progress" size="small" type="primary" secondary @click="continueReading">
        <template #icon>
          <AppIcon name="play" :size="14" />
        </template>
        Tiếp tục: {{ continueText }}
      </NButton>
      <NButton
        size="small"
        secondary
        :loading="loading"
        title="Quét lại chapter từ Drive"
        @click="load(true)"
      >
        <template #icon>
          <AppIcon name="refresh" :size="14" />
        </template>
        Làm mới
      </NButton>
      <NButton
        v-if="storyGroups.length"
        size="small"
        quaternary
        title="Bỏ đánh dấu tất cả nhóm chapter — folder nhóm hiện lại thành chapter"
        @click="unmarkAllGroups"
      >
        <template #icon>
          <AppIcon name="layers" :size="14" />
        </template>
        Hủy nhóm ({{ storyGroups.length }})
      </NButton>
      <NButton
        v-if="storiesStore.marks[storyId]"
        size="small"
        quaternary
        title="Thư mục này không phải truyện — bỏ đánh dấu"
        @click="unmark"
      >
        Đây không phải truyện?
      </NButton>
    </div>

    <div v-if="loading && !chapters.length" class="center-msg">
      <NText depth="3">Đang quét chapter...</NText>
    </div>

    <NEmpty
      v-else-if="!filteredChapters.length"
      description="Không có chapter"
      style="margin-top: 60px"
    />

    <NVirtualList
      v-else
      class="chapter-list"
      :items="filteredChapters"
      :item-size="ITEM_HEIGHT"
      :item-resizable="false"
    >
      <template #default="{ item }">
        <div
          :key="item.id"
          class="chapter-row"
          :class="{ current: item.id === progress?.chapterId }"
          role="link"
          :tabindex="0"
          @click="openChapter(item)"
          @keydown.enter="openChapter(item)"
        >
          <span class="chapter-main">
            <span class="chapter-name">{{ item.name }}</span>
            <NText v-if="item.modifiedTime" depth="3" class="chapter-date">
              {{ formatDate(item.modifiedTime) }}
            </NText>
          </span>
          <span class="chapter-side">
            <NTag v-if="item.id === progress?.chapterId" size="tiny" type="success">Đang đọc</NTag>
            <NButton
              text
              size="tiny"
              class="group-btn"
              title="Đây là NHÓM chapter (kiểu 0-80) — đưa chapter con lên cùng cấp"
              @click.stop="markGroup(item)"
            >
              <template #icon>
                <AppIcon name="corner-up-left" :size="13" />
              </template>
              Nhóm
            </NButton>
          </span>
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

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.search-input {
  width: min(220px, 100%);
}

.sort-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.spacer {
  flex: 1;
}

.center-msg {
  display: flex;
  justify-content: center;
  margin-top: 60px;
}

.chapter-list {
  max-height: calc(100vh - 220px);
  max-height: calc(100dvh - 220px);
}

.chapter-row {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  border-bottom: 1px solid var(--tdw-border);
  cursor: pointer;
}

.chapter-row:hover {
  background: var(--tdw-hover);
}

.chapter-row:focus-visible {
  outline: 2px solid var(--tdw-primary);
  outline-offset: -2px;
}

/* Ribbon bookmark đánh dấu chapter đang đọc */
.chapter-row.current {
  background: var(--tdw-primary-soft);
  box-shadow: inset 3px 0 0 var(--tdw-primary);
}

/* Cột trái của row: tên + ngày — min-width:0 để tên vẫn ellipsis trong flex row */
.chapter-main {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.chapter-name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-date {
  font-size: 12px;
  white-space: nowrap;
}

.chapter-side {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Luôn hiển thị — không phụ thuộc hover (touch không có hover) */
.group-btn {
  opacity: 0.55;
}

.group-btn:hover {
  opacity: 1;
}

@media (max-width: 640px) {
  .story-page {
    padding: 12px;
  }

  .toolbar {
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Title chiếm nguyên hàng riêng — không còn bị kẹp giữa nút back và tag chap */
  .story-title {
    order: 3;
    flex: 1 1 100%;
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.3;
  }

  .chap-count {
    margin-left: auto;
  }

  .search-input {
    flex: 1 1 100%;
    order: -1;
  }

  .actions {
    gap: 8px;
  }
}
</style>
