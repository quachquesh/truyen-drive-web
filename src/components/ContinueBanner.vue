<script setup lang="ts">
import { computed } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import { formatRelative } from '@/lib/dates'
import { displayProgress } from '@/lib/progress'
import type { ProgressRecord } from '@/lib/db'

const props = defineProps<{ storyName: string; progress: ProgressRecord }>()

const emit = defineEmits<{ open: [record: ProgressRecord] }>()

/** n/total đã re-anchor theo danh sách chapter hiện tại (applyLiveProgress) */
const display = computed(() => displayProgress(props.progress))
const relative = computed(() => formatRelative(props.progress.updatedAt))

/** Vệt đọc — % vị trí cuộn trong chapter, kẹp vào 0..100 cho an toàn */
const railPct = computed(() =>
  Math.round(Math.min(Math.max(props.progress.scrollPct, 0), 1) * 100),
)
</script>

<template>
  <button
    type="button"
    class="continue-banner"
    :aria-label="`Đọc tiếp ${storyName}`"
    @click="emit('open', progress)"
  >
    <span class="banner-text">
      <span class="eyebrow">Tiếp tục đọc</span>
      <span class="story-name" :title="storyName">{{ storyName }}</span>
      <span class="meta" :title="`Đang đọc: ${progress.chapterName}`">
        {{ progress.chapterName }}<template v-if="display"> · </template><b v-if="display" class="meta-pos">{{ display.no }}/{{ display.total }}</b><template v-if="relative"> · {{ relative }}</template>
      </span>
    </span>
    <span class="play-chip" aria-hidden="true">
      <AppIcon name="play" :size="18" />
    </span>
    <span class="rail" aria-hidden="true" :title="`Đang ở ${railPct}% chapter`">
      <span class="rail-fill" :style="{ width: `${railPct}%` }" />
    </span>
  </button>
</template>

<style scoped>
/* Cả thẻ là 1 nút resume — accent trái "đang đọc" cùng ngôn ngữ với row chapter
 * hiện tại ở StoryPage (inset 3px primary). */
.continue-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 10px 14px 13px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--tdw-bg-soft);
  border: 1px solid var(--tdw-border);
  border-radius: 8px;
  cursor: pointer;
  box-shadow: inset 3px 0 0 var(--tdw-primary);
  overflow: hidden; /* vệt đọc chạy hết mép, ăn theo bo góc */
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.continue-banner:focus-visible {
  outline: 2px solid var(--tdw-primary);
  outline-offset: 2px;
}

.banner-text {
  flex: 1;
  min-width: 0; /* để con ellipsis được trong flex */
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tdw-text-muted);
}

.story-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--tdw-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta {
  font-size: 13px;
  line-height: 1.35;
  color: var(--tdw-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* n/total nổi bật theo precedent dòng "Đang đọc" của StoryCard */
.meta-pos {
  font-weight: 600;
  color: var(--tdw-primary);
}

.play-chip {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px; /* touch target ≥ 40px, cả thẻ bấm được nên 40 là đủ */
  border-radius: 50%;
  background: var(--tdw-primary);
  color: #fff;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.play-chip svg {
  transition: transform 0.15s ease;
}

/* Nhịp "thở" nhẹ vòng quanh nút resume — tín hiệu ambient cho mobile (không có
 * hover), nhịp chậm 2.4s để không làm ồn phần còn lại của banner. */
.play-chip::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  animation: chip-pulse 2.4s ease-out infinite;
  pointer-events: none;
}

@keyframes chip-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--tdw-primary) 45%, transparent);
  }

  70%,
  100% {
    box-shadow: 0 0 0 12px transparent;
  }
}

/* Bấm (touch lẫn chuột) → chip nhận xuống như nút vật lý */
.continue-banner:active .play-chip {
  transform: scale(0.92);
}

/* Vệt đọc: vị trí cuộn thật trong chapter — chuyển width khi sync đa thiết bị
 * kéo vị trí mới về (watch progressRev → refreshProgress thay record). */
.rail {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--tdw-border);
}

.rail-fill {
  display: block;
  height: 100%;
  background: var(--tdw-primary);
  transition: width 0.4s ease;
}

/* Hover chỉ là enhancement trên desktop; guard tránh sticky-hover khi tap mobile */
@media (hover: hover) and (pointer: fine) {
  .continue-banner:hover {
    transform: translateY(-1px);
    border-color: var(--tdw-primary);
    box-shadow:
      inset 3px 0 0 var(--tdw-primary),
      0 6px 16px rgba(0, 0, 0, 0.12);
  }

  .continue-banner:hover .play-chip {
    transform: scale(1.08);
    box-shadow: 0 0 0 4px var(--tdw-primary-soft);
  }

  /* Icon nhích theo chiều "phát" */
  .continue-banner:hover .play-chip svg {
    transform: translateX(1px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .continue-banner,
  .rail-fill,
  .play-chip,
  .play-chip svg {
    transition: none;
  }

  .play-chip::after {
    animation: none;
  }
}

@media (max-width: 640px) {
  .continue-banner {
    gap: 10px;
    padding: 10px 12px 13px;
  }

  .meta {
    font-size: 12px;
  }
}
</style>
