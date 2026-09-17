<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NButton, NCard, NConfigProvider, NEmpty, NSelect, NSpace, NSpin, NText } from "naive-ui";
import { darkTheme } from "naive-ui";

import PdfReader from "@/components/PdfReader.vue";
import ReaderImage from "@/components/ReaderImage.vue";
import AppIcon from "@/components/AppIcon.vue";
import { toErrorMessage } from "@/lib/driveApi";
import { getProgress, putProgress } from "@/lib/db";
import {
  ensureChapterFiles,
  type ChapterFile,
  type ChapterRef,
  type ChapterWithFiles,
} from "@/lib/scanner";
import { useStoriesStore } from "@/stores/stories";
import { useSyncStore } from "@/stores/sync";

const route = useRoute();
const router = useRouter();
const storiesStore = useStoriesStore();
const syncStore = useSyncStore();

const libId = computed(() => (typeof route.params.libId === "string" ? route.params.libId : ""));
const storyId = computed(() =>
  typeof route.params.storyId === "string" ? route.params.storyId : "",
);
const chapterId = computed(() =>
  typeof route.params.chapterId === "string" ? route.params.chapterId : "",
);
const progressKey = computed(() => `${libId.value}:${storyId.value}`);

const chapters = ref<ChapterRef[]>([]);
const chapterFiles = ref<ChapterWithFiles | null>(null);
const filesLoading = ref(false);
const loading = ref(false);
const loadError = ref("");
const pdfLoading = ref(false);
const toolbarVisible = ref(true);

const scrollEl = ref<HTMLElement | null>(null);
let lastScrollTop = 0;
let saveTimer: number | undefined;
let triedRescan = false;

const chapter = computed(() => chapters.value.find((item) => item.id === chapterId.value));
const chapterIndex = computed(() =>
  chapters.value.findIndex((item) => item.id === chapterId.value),
);
const prevChapter = computed(() => chapters.value[chapterIndex.value - 1]);
const nextChapter = computed(() => chapters.value[chapterIndex.value + 1]);

/** Bộ chọn chapter nhanh trên toolbar — gõ tên/số trong tên chapter là nhảy được */
const chapterOptions = computed(() =>
  chapters.value.map((item) => ({ label: item.name, value: item.id })),
);

/** Kiểu đọc chapter có cả ảnh lẫn PDF trọn bộ — nhớ lựa chọn của user */
const READER_MODE_KEY = "tdw-reader-mode";
type ReaderMode = "images" | "pdf";
const readerMode = ref<ReaderMode>(
  localStorage.getItem(READER_MODE_KEY) === "pdf" ? "pdf" : "images",
);
watch(readerMode, (mode) => {
  localStorage.setItem(READER_MODE_KEY, mode);
});

/** Chapter có ảnh + PDF đi kèm → cho chọn kiểu đọc (chapter PDF-only thì luôn PDF) */
const hasPdfOption = computed(
  () => chapterFiles.value?.isPdf === false && Boolean(chapterFiles.value?.pdfFile),
);
const usePdf = computed(
  () => chapterFiles.value?.isPdf === true || (hasPdfOption.value && readerMode.value === "pdf"),
);
const pdfToRender = computed<ChapterFile | null>(() => {
  const current = chapterFiles.value;
  if (!current) return null;
  if (current.isPdf) return current.files[0] ?? null;
  return current.pdfFile;
});

async function loadChapter(force: boolean): Promise<void> {
  loading.value = true;
  loadError.value = "";
  try {
    const result = await storiesStore.ensureChapters(libId.value, storyId.value, { force });
    chapters.value = result;

    const exists = result.some((item) => item.id === chapterId.value);
    if (!exists && !force && !triedRescan) {
      // Chapter không có trong cache — có thể Drive vừa thêm mới, quét lại
      triedRescan = true;
      await loadChapter(true);
      return;
    }
    if (!exists) {
      loadError.value = "Không tìm thấy chapter này (có thể đã bị xóa khỏi Google Drive)";
      return;
    }

    await loadChapterFiles();
    await recordOpenChapter();
  } catch (error) {
    loadError.value = toErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

/** Danh sách ảnh/PDF chỉ lấy khi mở chapter (cache IndexedDB trước) */
async function loadChapterFiles(force = false): Promise<void> {
  const current = chapter.value;
  if (!current) return;
  filesLoading.value = true;
  try {
    chapterFiles.value = await ensureChapterFiles(current.id, current.name, { force });
  } finally {
    filesLoading.value = false;
  }
}

/** Mở chapter → cập nhật tiến trình; F5 cùng chapter → khôi phục vị trí cuộn */
async function recordOpenChapter(): Promise<void> {
  const current = chapter.value;
  if (!current) return;

  const existing = await getProgress(progressKey.value);
  if (existing && existing.chapterId === current.id && existing.scrollPct > 0.01) {
    await nextTick();
    const el = scrollEl.value;
    if (el) {
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = existing.scrollPct * max;
    }
    return;
  }

  await putProgress({
    key: progressKey.value,
    chapterId: current.id,
    chapterName: current.name,
    scrollPct: 0,
    chapterNo: chapterIndex.value >= 0 ? chapterIndex.value + 1 : undefined,
    chapterTotal: chapters.value.length || undefined,
    updatedAt: Date.now(),
  });
  syncStore.schedulePush();
}

function onScroll(): void {
  const el = scrollEl.value;
  if (!el) return;
  const scrollTop = el.scrollTop;

  if (scrollTop > lastScrollTop + 6 && scrollTop > 60) toolbarVisible.value = false;
  else if (scrollTop < lastScrollTop - 6 || scrollTop < 40) toolbarVisible.value = true;
  lastScrollTop = scrollTop;

  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveProgress(), 600);
}

async function saveProgress(): Promise<void> {
  const el = scrollEl.value;
  const current = chapter.value;
  if (!el || !current) return;
  const max = el.scrollHeight - el.clientHeight;
  const scrollPct = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
  await putProgress({
    key: progressKey.value,
    chapterId: current.id,
    chapterName: current.name,
    scrollPct,
    chapterNo: chapterIndex.value >= 0 ? chapterIndex.value + 1 : undefined,
    chapterTotal: chapters.value.length || undefined,
    updatedAt: Date.now(),
  });
  syncStore.schedulePush();
}

function goToChapter(target: ChapterRef | undefined): void {
  if (!target) return;
  void router.push({
    name: "reader",
    params: { libId: libId.value, storyId: storyId.value, chapterId: target.id },
  });
}

function jumpToChapter(id: string): void {
  goToChapter(chapters.value.find((item) => item.id === id));
}

function backToChapters(): void {
  void saveProgress();
  void router.push({ name: "story", params: { libId: libId.value, storyId: storyId.value } });
}

/** Folder này thực ra là nhóm chapter → đánh dấu + về danh sách (quét lại) */
async function markGroupAndBack(): Promise<void> {
  const current = chapter.value;
  if (!current) return;
  await storiesStore.markAsGroup(current.id);
  await router.replace({
    name: "story",
    params: { libId: libId.value, storyId: storyId.value },
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowLeft") goToChapter(prevChapter.value);
  else if (event.key === "ArrowRight") goToChapter(nextChapter.value);
}

onMounted(() => {
  void loadChapter(false);
  window.addEventListener("keydown", onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.clearTimeout(saveTimer);
  void saveProgress();
});

// Điều hướng next/prev trong cùng component → nạp chapter mới, cuộn lên đầu
watch(chapterId, () => {
  triedRescan = false;
  toolbarVisible.value = true;
  lastScrollTop = 0;
  chapterFiles.value = null;
  void nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = 0;
  });
  void loadChapter(false);
});
</script>

<template>
  <div ref="scrollEl" class="reader-root" @scroll.passive="onScroll">
    <!-- Bọc toàn bộ reader trong theme tối: component Naive trong reader luôn tối ở cả 2 chế độ -->
    <NConfigProvider :theme="darkTheme" class="reader-provider">
      <!-- Toolbar tự ẩn khi cuộn xuống -->
      <div class="reader-toolbar" :class="{ hidden: !toolbarVisible }">
        <div class="reader-toolbar-inner">
          <NButton quaternary size="medium" class="tb-btn" @click="backToChapters">
            <template #icon>
              <AppIcon name="arrow-left" :size="16" />
            </template>
            <span class="tb-label">Danh sách</span>
          </NButton>
          <NSelect
            v-if="chapters.length"
            :value="chapterId"
            :options="chapterOptions"
            :consistent-menu-width="false"
            filterable
            size="medium"
            class="tb-jump"
            title="Chọn chapter (gõ tên hoặc số)"
            @update:value="jumpToChapter"
          />
          <NSpin v-if="pdfLoading" :size="14" />
          <div class="tb-spacer" />
          <span v-if="hasPdfOption" class="tb-modes">
            <NButton
              size="medium"
              secondary
              :type="readerMode === 'images' ? 'primary' : 'default'"
              title="Đọc từng ảnh (tải nhanh hơn)"
              @click="readerMode = 'images'"
            >
              <template #icon>
                <AppIcon name="image" :size="14" />
              </template>
              <span class="tb-label">Ảnh</span>
            </NButton>
            <NButton
              size="medium"
              secondary
              :type="readerMode === 'pdf' ? 'primary' : 'default'"
              title="Đọc file PDF trọn bộ của chapter"
              @click="readerMode = 'pdf'"
            >
              <template #icon>
                <AppIcon name="file-text" :size="14" />
              </template>
              <span class="tb-label">PDF</span>
            </NButton>
          </span>
          <NButton
            class="tb-btn"
            size="medium"
            secondary
            :disabled="!prevChapter"
            title="Chap trước (phím ←)"
            @click="goToChapter(prevChapter)"
          >
            <template #icon>
              <AppIcon name="chevron-left" :size="16" />
            </template>
            <span class="tb-label">Trước</span>
          </NButton>
          <NButton
            class="tb-btn"
            size="medium"
            secondary
            :disabled="!nextChapter"
            title="Chap sau (phím →)"
            @click="goToChapter(nextChapter)"
          >
            <span class="tb-label">Sau</span>
            <template #icon>
              <AppIcon name="chevron-right" :size="16" />
            </template>
          </NButton>
        </div>
      </div>

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
              <NButton size="medium" @click="loadChapter(true)">Quét lại</NButton>
              <NButton size="medium" secondary @click="backToChapters">Về danh sách</NButton>
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
            <NSpace vertical align="center">
              <NButton size="medium" type="primary" @click="markGroupAndBack">
                <template #icon>
                  <AppIcon name="corner-up-left" :size="15" />
                </template>
                Đây là nhóm chapter — đưa con lên
              </NButton>
              <NSpace justify="center">
                <NButton size="medium" @click="loadChapterFiles(true)">Thử lại</NButton>
                <NButton size="medium" secondary @click="backToChapters">Về danh sách</NButton>
              </NSpace>
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
          <NSpace vertical align="center" size="medium">
            <NText depth="3">Hết {{ chapterFiles.name }}</NText>
            <NButton
              v-if="nextChapter"
              type="primary"
              size="large"
              @click="goToChapter(nextChapter)"
            >
              Chap tiếp: {{ nextChapter.name }}
            </NButton>
            <NText v-else depth="3">Bạn đã đọc hết truyện</NText>
            <NButton quaternary size="medium" @click="backToChapters">Về danh sách chapter</NButton>
          </NSpace>
        </NCard>
      </template>
    </NConfigProvider>
  </div>
</template>

<style scoped>
.reader-root {
  height: 100%;
  overflow-y: auto;
  position: relative;
  background: rgba(0, 0, 0, 0.85);
}

.reader-provider {
  min-height: 100%;
}

.reader-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(20, 20, 20, 0.92);
  backdrop-filter: blur(8px);
  transition: transform 0.25s ease;
  color: #eee;
}

.reader-toolbar.hidden {
  transform: translateY(-100%);
}

/* Nội dung toolbar nằm trong container 1200px — đồng bộ với AppHeader */
.reader-toolbar-inner {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 16px;
}

.tb-btn {
  flex-shrink: 0;
}

.tb-jump {
  flex: 1 1 180px;
  max-width: 260px;
  min-width: 0;
}

.tb-spacer {
  flex: 1;
}

.tb-modes {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}

.reader-msg {
  min-height: 100vh;
  min-height: 100dvh;
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

@media (max-width: 640px) {
  .reader-toolbar-inner {
    gap: 6px;
    padding: 6px 8px;
  }

  /* Thu gọn nhãn nút — giữ icon, đủ to để bấm bằng ngón tay */
  .tb-label {
    display: none;
  }

  /* Icon-only: naive-ui chừa margin 6px giữa icon và label (đã ẩn ở trên)
     ở cả 2 thứ tự icon-trước/in-sau-label — bỏ hết để icon về giữa nút */
  .reader-toolbar :deep(.n-button .n-button__icon) {
    margin: 0;
  }

  /* Select chiếm chỗ trống còn lại, co lại khi chật */
  .tb-jump {
    max-width: none;
  }

  .tb-modes {
    gap: 4px;
  }
}
</style>
