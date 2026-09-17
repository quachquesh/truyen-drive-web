<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCard, NSpin, NTag, NText, NTooltip } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import { useStoriesStore } from '@/stores/stories'
import { formatDate } from '@/lib/dates'
import type { ProgressRecord } from '@/lib/db'
import type { StorySummary } from '@/lib/scanner'

const props = defineProps<{ story: StorySummary; progress?: ProgressRecord }>()
const storiesStore = useStoriesStore()

const emit = defineEmits<{
  openFolder: [story: StorySummary]
  markStory: [story: StorySummary]
}>()

const marked = computed(() => Boolean(storiesStore.marks[props.story.id]))
const listMarked = computed(() => Boolean(storiesStore.lists[props.story.id]))
const groupMarked = computed(() => Boolean(storiesStore.groups[props.story.id]))

/** "Tên chương (45/100)" khi biết số thứ tự, không thì chỉ tên chương */
const progressText = computed(() => {
  const record = props.progress
  if (!record) return ''
  return record.chapterNo && record.chapterTotal
    ? `${record.chapterName} (${record.chapterNo}/${record.chapterTotal})`
    : record.chapterName
})

/** dd/MM/yyyy từ ngày cập nhật gần nhất; rỗng nếu không có (cache cũ) hoặc lỗi parse */
const modifiedText = computed(() => formatDate(props.story.lastModified ?? props.story.modifiedTime))
</script>

<template>
  <NCard size="small" class="story-card">
    <div class="story-name" :title="story.name">{{ story.name }}</div>
    <NText
      v-if="modifiedText"
      style="margin-top: 6px"
      depth="3"
      class="modified"
      title="Ngày cập nhật gần nhất (tính cả chap mới)"
    >
      <AppIcon name="calendar" :size="12" class="modified-icon" />
      {{ modifiedText }}
    </NText>

    <!-- Tiến độ đọc gần nhất (đồng bộ qua các thiết bị) -->
    <div
      v-if="progress"
      class="reading-progress"
      :title="`Đang đọc: ${progress.chapterName}`"
    >
      <AppIcon name="bookmark" :size="13" />
      <span>Đang đọc: <b>{{ progressText }}</b></span>
    </div>

    <!-- Đã xác nhận là truyện: hiện số chap + mới nhất -->
    <div v-if="marked" class="story-meta">
      <NSpin v-if="storiesStore.scanning[story.id]" :size="14" />
      <template v-else-if="storiesStore.scanErrors[story.id]">
        <NTooltip>
          <template #trigger>
            <NTag size="small" type="error">Lỗi</NTag>
          </template>
          {{ storiesStore.scanErrors[story.id] }}
        </NTooltip>
      </template>
      <template v-else-if="storiesStore.counts[story.id] !== undefined">
        <NText depth="2" class="count">{{ storiesStore.counts[story.id] }} chap</NText>
        <NText
          v-if="storiesStore.latest[story.id]"
          depth="3"
          class="latest"
          :title="storiesStore.latest[story.id]"
        >
          · mới nhất {{ storiesStore.latest[story.id] }}
        </NText>
      </template>
      <NText v-else depth="3" class="count">…</NText>
      <div class="spacer" />
      <NButton
        text
        size="small"
        class="folder-btn"
        title="Xem nội dung thư mục"
        @click.stop="emit('openFolder', story)"
      >
        <template #icon>
          <AppIcon name="folder" :size="15" />
        </template>
      </NButton>
    </div>

    <!-- Đã phân loại là danh sách truyện / nhóm chapter: hiện nhãn đúng trạng thái -->
    <div v-else-if="listMarked || groupMarked" class="story-meta">
      <NTooltip>
        <template #trigger>
          <NTag v-if="listMarked" size="small" :bordered="false" type="info">
            Danh sách truyện
          </NTag>
          <NTag v-else size="small" :bordered="false" type="success">Nhóm chapter</NTag>
        </template>
        <template v-if="listMarked">
          Đã ghi nhớ đây là danh sách nhiều truyện — bấm vào thẻ để mở danh sách bên trong.
        </template>
        <template v-else>
          Đã ghi nhớ đây là nhóm chapter — chapter bên trong hiện trong truyện chứa nó.
        </template>
      </NTooltip>
      <div class="spacer" />
      <NButton
        text
        size="small"
        class="folder-btn"
        title="Xem nội dung thư mục"
        @click.stop="emit('openFolder', story)"
      >
        <template #icon>
          <AppIcon name="folder" :size="15" />
        </template>
      </NButton>
    </div>

    <!-- Chưa phân loại: user xem nội dung để quyết định -->
    <div v-else class="story-meta">
      <NTooltip>
        <template #trigger>
          <NTag size="small" :bordered="false" type="warning">Chưa phân loại</NTag>
        </template>
        Bấm vào thẻ để xem bên trong, rồi chọn đây là một bộ truyện hay một danh sách truyện.
      </NTooltip>
      <div class="spacer" />
      <NButton
        text
        size="small"
        class="mark-btn"
        title="Đây là truyện — đọc ngay"
        @click.stop="emit('markStory', story)"
      >
        <template #icon>
          <AppIcon name="book-open" :size="15" />
        </template>
        Đọc truyện
      </NButton>
    </div>
  </NCard>
</template>

<style scoped>
.story-card {
  cursor: pointer;
  height: 100%;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

/* Hover chỉ là enhancement trên desktop; media guard tránh sticky-hover khi tap mobile */
@media (hover: hover) and (pointer: fine) {
  .story-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    border-color: var(--tdw-primary);
  }
}

/* Card cao bằng nhau theo hàng grid → content dãn dọc, meta pin xuống đáy.
 * Class content của NCard là n-card-content (gạch đơn, không phải __) — sai tên
 * thì rule chết và margin-top:auto không bao giờ pin được. */
.story-card :deep(.n-card-content) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.story-name {
  font-weight: 600;
  font-size: 15px;
  line-height: 1.35;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.7em;
  word-break: break-word;
}

.modified {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  font-size: 12px;
  white-space: nowrap;
}

.reading-progress {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--tdw-primary);
  white-space: nowrap;
}

.reading-progress span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.story-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: auto;
  padding-top: 8px;
  min-height: 22px;
}

.spacer {
  flex: 1;
}

.count {
  font-size: 13px;
  white-space: nowrap;
}

.latest {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 50%;
}

/* Luôn hiển thị rõ — touch không có hover */
.folder-btn,
.mark-btn {
  opacity: 0.7;
}

.folder-btn:hover,
.mark-btn:hover {
  opacity: 1;
}
</style>
