<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NCard, NSpin, NTag, NText, NTooltip } from 'naive-ui'

import { useStoriesStore } from '@/stores/stories'
import type { StorySummary } from '@/lib/scanner'

const props = defineProps<{ story: StorySummary }>()
const storiesStore = useStoriesStore()

const emit = defineEmits<{
  openFolder: [story: StorySummary]
  markStory: [story: StorySummary]
}>()

const marked = computed(() => Boolean(storiesStore.marks[props.story.id]))
</script>

<template>
  <NCard hoverable size="small" class="story-card">
    <div class="story-name" :title="story.name">{{ story.name }}</div>

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
      <NButton text size="tiny" class="folder-btn" title="Xem nội dung thư mục" @click.stop="emit('openFolder', story)">
        📂
      </NButton>
    </div>

    <!-- Chưa phân loại: user xem nội dung để quyết định -->
    <div v-else class="story-meta">
      <NTag size="small" :bordered="false" type="warning">Chưa phân loại</NTag>
      <div class="spacer" />
      <NButton
        text
        size="tiny"
        class="mark-btn"
        title="Đây là truyện — đọc ngay"
        @click.stop="emit('markStory', story)"
      >
        📖 Đọc truyện
      </NButton>
    </div>
  </NCard>
</template>

<style scoped>
.story-card {
  cursor: pointer;
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

.story-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
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

.folder-btn,
.mark-btn {
  opacity: 0.55;
}

.story-card:hover .folder-btn,
.story-card:hover .mark-btn {
  opacity: 1;
}
</style>
