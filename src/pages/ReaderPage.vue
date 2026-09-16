<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NConfigProvider, NEmpty, NSpace, NSpin, NTag, NText } from 'naive-ui'
import { darkTheme } from 'naive-ui'

import PdfReader from '@/components/PdfReader.vue'
import ReaderImage from '@/components/ReaderImage.vue'
import { toErrorMessage } from '@/lib/driveApi'
import { getProgress, putProgress } from '@/lib/db'
import {
  ensureChapterFiles,
  type ChapterFile,
  type ChapterRef,
  type ChapterWithFiles,
} from '@/lib/scanner'
import { useStoriesStore } from '@/stores/stories'

const route = useRoute()
const router = useRouter()
const storiesStore = useStoriesStore()

const libId = computed(() => (typeof route.params.libId === 'string' ? route.params.libId : ''))
const storyId = computed(() => (typeof route.params.storyId === 'string' ? route.params.storyId : ''))
const chapterId = computed(() =>
  typeof route.params.chapterId === 'string' ? route.params.chapterId : '',
)
const progressKey = computed(() => `${libId.value}:${storyId.value}`)

const chapters = ref<ChapterRef[]>([])
const chapterFiles = ref<ChapterWithFiles | null>(null)
const filesLoading = ref(false)
const loading = ref(false)
const loadError = ref('')
const pdfLoading = ref(false)
const toolbarVisible = ref(true)

const scrollEl = ref<HTMLElement | null>(null)
let lastScrollTop = 0
let saveTimer: number | undefined
let triedRescan = false

const chapter = computed(() => chapters.value.find((item) => item.id === chapterId.value))
const chapterIndex = computed(() =>
  chapters.value.findIndex((item) => item.id === chapterId.value),
)
const prevChapter = computed(() => chapters.value[chapterIndex.value - 1])
const nextChapter = computed(() => chapters.value[chapterIndex.value + 1])

/** Kiểu đọc chapter có cả ảnh lẫn PDF trọn bộ — nhớ lựa chọn của user */
const READER_MODE_KEY = 'tdw-reader-mode'
type ReaderMode = 'images' | 'pdf'
const readerMode = ref<ReaderMode>(
  localStorage.getItem(READER_MODE_KEY) === 'pdf' ? 'pdf' : 'images',
)
watch(readerMode, (mode) => {
  localStorage.setItem(READER_MODE_KEY, mode)
})

/** Chapter có ảnh + PDF đi kèm → cho chọn kiểu đọc (chapter PDF-only thì luôn PDF) */
const hasPdfOption = computed(
  () => chapterFiles.value?.isPdf === false && Boolean(chapterFiles.value?.pdfFile),
)
const usePdf = computed(
  () => chapterFiles.value?.isPdf === true || (hasPdfOption.value && readerMode.value === 'pdf'),
)
const pdfToRender = computed<ChapterFile | null>(() => {
  const current = chapterFiles.value
  if (!current) return null
  if (current.isPdf) return current.files[0] ?? null
  return current.pdfFile
})

async function loadChapter(force: boolean): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const result = await storiesStore.ensureChapters(libId.value, storyId.value, { force })
    chapters.value = result

    const exists = result.some((item) => item.id === chapterId.value)
    if (!exists && !force && !triedRescan) {
      // Chapter không có trong cache — có thể Drive vừa thêm mới, quét lại
      triedRescan = true
      await loadChapter(true)
      return
    }
    if (!exists) {
      loadError.value = 'Không tìm thấy chapter này (có thể đã bị xóa khỏi Google Drive)'
      return
    }

    await loadChapterFiles()
    await recordOpenChapter()
  } catch (error) {
    loadError.value = toErrorMessage(error)
  } finally {
    loading.value = false
  }
}

/** Danh sách ảnh/PDF chỉ lấy khi mở chapter (cache IndexedDB trước) */
async function loadChapterFiles(force = false): Promise<void> {
  const current = chapter.value
  if (!current) return
  filesLoading.value = true
  try {
    chapterFiles.value = await ensureChapterFiles(current.id, current.name, { force })
  } finally {
    filesLoading.value = false
  }
}

/** Mở chapter → cập nhật tiến trình; F5 cùng chapter → khôi phục vị trí cuộn */
async function recordOpenChapter(): Promise<void> {
  const current = chapter.value
  if (!current) return

  const existing = await getProgress(progressKey.value)
  if (existing && existing.chapterId === current.id && existing.scrollPct > 0.01) {
    await nextTick()
    const el = scrollEl.value
    if (el) {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = existing.scrollPct * max
    }
    return
  }

  await putProgress({
    key: progressKey.value,
    chapterId: current.id,
    chapterName: current.name,
    scrollPct: 0,
    updatedAt: Date.now(),
  })
}

function onScroll(): void {
  const el = scrollEl.value
  if (!el) return
  const scrollTop = el.scrollTop

  if (scrollTop > lastScrollTop + 6 && scrollTop > 60) toolbarVisible.value = false
  else if (scrollTop < lastScrollTop - 6 || scrollTop < 40) toolbarVisible.value = true
  lastScrollTop = scrollTop

  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void saveProgress(), 600)
}

async function saveProgress(): Promise<void> {
  const el = scrollEl.value
  const current = chapter.value
  if (!el || !current) return
  const max = el.scrollHeight - el.clientHeight
  const scrollPct = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0
  await putProgress({
    key: progressKey.value,
    chapterId: current.id,
    chapterName: current.name,
    scrollPct,
    updatedAt: Date.now(),
  })
}

function goToChapter(target: ChapterRef | undefined): void {
  if (!target) return
  void router.push({
    name: 'reader',
    params: { libId: libId.value, storyId: storyId.value, chapterId: target.id },
  })
}

function backToChapters(): void {
  void saveProgress()
  void router.push({ name: 'story', params: { libId: libId.value, storyId: storyId.value } })
}

/** Folder này thực ra là nhóm chapter → đánh dấu + về danh sách (quét lại) */
async function markGroupAndBack(): Promise<void> {
  const current = chapter.value
  if (!current) return
  await storiesStore.markAsGroup(current.id)
  await router.replace({
    name: 'story',
    params: { libId: libId.value, storyId: storyId.value },
  })
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') goToChapter(prevChapter.value)
  else if (event.key === 'ArrowRight') goToChapter(nextChapter.value)
}

onMounted(() => {
  void loadChapter(false)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.clearTimeout(saveTimer)
  void saveProgress()
})

// Điều hướng next/prev trong cùng component → nạp chapter mới, cuộn lên đầu
watch(chapterId, () => {
  triedRescan = false
  toolbarVisible.value = true
  lastScrollTop = 0
  chapterFiles.value = null
  void nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0
  })
  void loadChapter(false)
})
</script>

<template>
  <div ref="scrollEl" class="reader-root" @scroll.passive="onScroll">
    <!-- Toolbar tự ẩn khi cuộn xuống -->
    <NConfigProvider :theme="darkTheme" class="toolbar-provider">
      <div class="reader-toolbar" :class="{ hidden: !toolbarVisible }">
      <NSpace align="center" size="small">
        <NButton quaternary size="small" @click="backToChapters">← Danh sách</NButton>
        <NText strong style="font-size: 14px">{{ chapter?.name ?? '...' }}</NText>
        <NTag v-if="chapterIndex >= 0" size="small" :bordered="false">
          {{ chapterIndex + 1 }}/{{ chapters.length }}
        </NTag>
        <NSpin v-if="pdfLoading" :size="14" />
        <NSpace v-if="hasPdfOption" size="small" :wrap="false">
          <NButton
            size="tiny"
            secondary
            :type="readerMode === 'images' ? 'primary' : 'default'"
            title="Đọc từng ảnh (lazy-load nhanh)"
            @click="readerMode = 'images'"
          >
            🖼 Ảnh
          </NButton>
          <NButton
            size="tiny"
            secondary
            :type="readerMode === 'pdf' ? 'primary' : 'default'"
            title="Đọc file PDF trọn bộ của chapter"
            @click="readerMode = 'pdf'"
          >
            📄 PDF
          </NButton>
        </NSpace>
      </NSpace>
      <NSpace size="small">
        <NButton
          size="small"
          secondary
          :disabled="!prevChapter"
          title="Chap trước (←)"
          @click="goToChapter(prevChapter)"
        >
          ‹ Trước
        </NButton>
        <NButton
          size="small"
          secondary
          :disabled="!nextChapter"
          title="Chap sau (→)"
          @click="goToChapter(nextChapter)"
        >
          Sau ›
        </NButton>
      </NSpace>
      </div>
    </NConfigProvider>

    <div v-if="loading && !chapters.length" class="reader-msg">
      <NSpin />
      <NText depth="3">
        Đang quét chapter...
        <template v-if="storiesStore.counts[storyId]">
          (tìm được {{ storiesStore.counts[storyId] }})
        </template>
      </NText>
    </div>

    <div v-else-if="loadError" class="reader-msg">
      <NEmpty :description="loadError">
        <template #extra>
          <NSpace>
            <NButton size="small" @click="loadChapter(true)">Quét lại</NButton>
            <NButton size="small" secondary @click="backToChapters">Về danh sách</NButton>
          </NSpace>
        </template>
      </NEmpty>
    </div>

    <div v-else-if="filesLoading || !chapterFiles" class="reader-msg">
      <NSpin />
      <NText depth="3">Đang tải chapter...</NText>
    </div>

    <div v-else-if="!chapterFiles.files.length" class="reader-msg">
      <NEmpty description="Chapter trống (không có ảnh / PDF trong folder)">
        <template #extra>
          <NSpace>
            <NButton size="small" type="primary" @click="markGroupAndBack">
              ⤴ Đây là nhóm chapter — đưa con lên
            </NButton>
            <NButton size="small" @click="loadChapterFiles(true)">Thử lại</NButton>
            <NButton size="small" secondary @click="backToChapters">Về danh sách</NButton>
          </NSpace>
        </template>
      </NEmpty>
    </div>

    <template v-else>
      <!-- Chapter dạng PDF (PDF-only hoặc user chọn PDF trong chapter ảnh+PDF) -->
      <PdfReader
        v-if="usePdf && pdfToRender"
        :key="pdfToRender.id"
        :file="pdfToRender"
        :story-key="progressKey"
        @loading="(v: boolean) => (pdfLoading = v)"
      />

      <!-- Chapter dạng ảnh, cuộn dọc liên tục -->
      <template v-else>
        <ReaderImage
          v-for="file in chapterFiles.files"
          :key="file.id"
          :file="file"
          :story-key="progressKey"
        />
      </template>

      <!-- Cuối chapter -->
      <NCard class="end-card" :bordered="false">
        <NSpace vertical align="center" size="small">
          <NText depth="3">Hết {{ chapterFiles.name }}</NText>
          <NButton
            v-if="nextChapter"
            type="primary"
            size="large"
            @click="goToChapter(nextChapter)"
          >
            Chap tiếp: {{ nextChapter.name }}
          </NButton>
          <NText v-else depth="3">Bạn đã đọc hết truyện 🎉</NText>
          <NButton quaternary size="small" @click="backToChapters">Về danh sách chapter</NButton>
        </NSpace>
      </NCard>
    </template>
  </div>
</template>

<style scoped>
.reader-root {
  height: 100%;
  overflow-y: auto;
  position: relative;
  background: rgba(0, 0, 0, 0.85);
}

.toolbar-provider {
  position: sticky;
  top: 0;
  z-index: 10;
}

.reader-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(20, 20, 20, 0.92);
  backdrop-filter: blur(8px);
  transition: transform 0.25s ease;
  color: #eee;
}

.reader-toolbar.hidden {
  transform: translateY(-100%);
}

.reader-msg {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #eee;
}

.end-card {
  max-width: 520px;
  margin: 32px auto;
  border-radius: 12px;
}
</style>
