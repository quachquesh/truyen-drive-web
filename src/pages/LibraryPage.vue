<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NAlert, NButton, NEmpty, NGrid, NGridItem, NInput, NSelect, NSpin, NText } from "naive-ui";

import AppIcon from "@/components/AppIcon.vue";
import StoryCard from "@/components/StoryCard.vue";
import { getAllProgress, getCache, type ProgressRecord } from "@/lib/db";
import { applyLiveProgress } from "@/lib/progress";
import type { ChapterRef } from "@/lib/scanner";
import { useLibraryStore } from "@/stores/library";
import { useStoriesStore } from "@/stores/stories";
import { useSyncStore } from "@/stores/sync";
import { sortStories, type StorySortMode } from "@/lib/storySort";

const route = useRoute();
const router = useRouter();
const libraryStore = useLibraryStore();
const storiesStore = useStoriesStore();
const syncStore = useSyncStore();

const search = ref("");

/** Kiểu sắp xếp danh sách truyện — nhớ lựa chọn của user */
const SORT_KEY = "tdw-story-sort";
const sortMode = ref<StorySortMode>(
  localStorage.getItem(SORT_KEY) === "modified" ? "modified" : "name",
);
const sortOptions = [
  { label: "Tên A→Z", value: "name" },
  { label: "Mới cập nhật", value: "modified" },
];

watch(sortMode, (mode) => {
  localStorage.setItem(SORT_KEY, mode);
});

/** Search không phân biệt dấu (gõ "khong dau" vẫn ra "không dấu") */
function deaccent(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

const filteredStories = computed(() => {
  const query = deaccent(search.value.trim());
  const base = query
    ? storiesStore.stories.filter((story) => deaccent(story.name).includes(query))
    : storiesStore.stories;
  return sortStories(base, sortMode.value);
});

const scanningAny = computed(() =>
  storiesStore.stories.some((story) => storiesStore.scanning[story.id]),
);

const libId = computed(() => (typeof route.params.libId === "string" ? route.params.libId : ""));

/** Tiến độ đọc của kho đang mở — storyId → record, cho card hiện "Đang đọc 45/100" */
const progressByStory = ref<Record<string, ProgressRecord | undefined>>({});

async function refreshProgress(): Promise<void> {
  if (!libId.value) return;
  const prefix = `${libId.value}:`;
  const map: Record<string, ProgressRecord | undefined> = {};
  for (const record of await getAllProgress()) {
    if (!record.key.startsWith(prefix)) continue;
    // Tính lại n/total theo danh sách chapter hiện tại trong cache — đánh dấu
    // nhóm sau khi đọc có thể chèn chapter làm lệch số thứ tự đã ghi
    const storyId = record.key.slice(prefix.length);
    const cached = await getCache<ChapterRef[]>(`chapters:${storyId}`);
    map[storyId] = applyLiveProgress(record, cached?.data);
  }
  progressByStory.value = map;
}

onMounted(async () => {
  await libraryStore.load();

  if (route.name === "home") {
    const target = libraryStore.activeId || libraryStore.libraries[0]?.id;
    if (target) {
      await router.replace({ name: "library", params: { libId: target } });
      return;
    }
    // chưa có kho nào — hiển thị empty state
  }
  if (libId.value) {
    libraryStore.setActive(libId.value);
    void storiesStore.openLibrary(libId.value);
    void refreshProgress();
  }
});

// Chuyển kho từ dropdown (URL đổi) → mở kho mới
watch(libId, (id) => {
  if (id && route.name === "library") {
    libraryStore.setActive(id);
    void storiesStore.openLibrary(id);
    void refreshProgress();
  }
});

// Sync đa thiết bị ghi tiến độ mới → card tự nhảy số, không cần bấm Làm mới
watch(
  () => syncStore.progressRev,
  () => void refreshProgress(),
);

/** Card đã đánh dấu → vào chapter; chưa đánh dấu → xem nội dung để quyết định */
function onCardClick(story: { id: string; name: string }): void {
  if (storiesStore.marks[story.id]) {
    void router.push({ name: "story", params: { libId: libId.value, storyId: story.id } });
    return;
  }
  void router.push({
    name: "folder",
    params: { libId: libId.value, folderId: story.id },
    query: { name: story.name },
  });
}

/** User xác nhận đây là truyện → đánh dấu + quét + vào danh sách chapter */
async function markAndRead(story: { id: string; name: string }): Promise<void> {
  await storiesStore.markAsStory(story.id);
  void router.push({ name: "story", params: { libId: libId.value, storyId: story.id } });
}
</script>

<template>
  <div class="library-page">
    <template v-if="libraryStore.loaded && !libraryStore.libraries.length && !libId">
      <div class="empty-wrap">
        <NEmpty description="Chưa có kho truyện nào — thêm một thư mục Google Drive để bắt đầu đọc">
          <template #icon>
            <AppIcon name="library" :size="36" class="empty-icon" />
          </template>
          <template #extra>
            <NButton type="primary" size="large" @click="libraryStore.openManager()">
              <template #icon>
                <AppIcon name="plus" :size="18" />
              </template>
              Thêm kho Google Drive
            </NButton>
          </template>
        </NEmpty>
      </div>
    </template>

    <template v-else-if="libId">
      <div class="toolbar">
        <NInput v-model:value="search" placeholder="Tìm truyện..." clearable class="search-input">
          <template #prefix>
            <AppIcon name="search" :size="16" />
          </template>
        </NInput>
        <NSelect v-model:value="sortMode" :options="sortOptions" class="sort-select" />
        <NSpin v-if="scanningAny" :size="16">
          <NText depth="3" style="font-size: 12px">Đang quét số chap...</NText>
        </NSpin>
        <div class="spacer" />
        <NButton
          secondary
          :loading="storiesStore.listLoading"
          title="Tải lại danh sách truyện từ Google Drive"
          @click="storiesStore.openLibrary(libId, { force: true })"
        >
          <template #icon>
            <AppIcon name="refresh" :size="16" />
          </template>
          <span class="btn-label">Làm mới</span>
        </NButton>
        <NButton secondary title="Quản lý kho truyện" @click="libraryStore.openManager()">
          <template #icon>
            <AppIcon name="library" :size="16" />
          </template>
          <span class="btn-label">Quản lý kho</span>
        </NButton>
      </div>

      <NAlert
        v-if="storiesStore.listError"
        type="error"
        :title="storiesStore.listError"
        style="margin-bottom: 16px"
        closable
        @close="storiesStore.listError = ''"
      />

      <div v-if="storiesStore.listLoading && !storiesStore.stories.length" class="center-msg">
        <NSpin />
        <NText depth="3">Đang tải danh sách truyện...</NText>
      </div>

      <NEmpty
        v-else-if="!filteredStories.length"
        :description="search ? 'Không tìm thấy truyện khớp từ khóa' : 'Kho truyện trống'"
        style="margin-top: 60px"
      />

      <NGrid v-else cols="1 s:2 m:3 l:4" responsive="screen" :x-gap="12" :y-gap="12">
        <NGridItem v-for="story in filteredStories" :key="story.id">
          <StoryCard
            :story="story"
            :progress="progressByStory[story.id]"
            @click="onCardClick(story)"
            @open-folder="
              router.push({
                name: 'folder',
                params: { libId, folderId: story.id },
                query: { name: story.name },
              })
            "
            @mark-story="markAndRead(story)"
          />
        </NGridItem>
      </NGrid>
    </template>
  </div>
</template>

<style scoped>
.library-page {
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

.search-input {
  width: min(320px, 100%);
  flex: 1 1 200px;
  max-width: 320px;
}

.sort-select {
  width: 160px;
}

.spacer {
  flex: 1;
}

.empty-icon {
  opacity: 0.4;
  margin-bottom: 8px;
}

.empty-wrap {
  display: flex;
  justify-content: center;
  padding-top: 120px;
}

.center-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 60px;
}

@media (max-width: 640px) {
  .library-page {
    padding: 12px;
  }

  .toolbar {
    gap: 8px;
  }

  .search-input {
    max-width: none;
    flex-basis: 100%;
    order: -1;
  }

  .sort-select {
    flex: 1;
  }
}
</style>
