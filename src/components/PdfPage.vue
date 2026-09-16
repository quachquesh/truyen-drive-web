<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NText } from 'naive-ui'

import type { PdfDocument } from '@/lib/pdfDoc'

const props = defineProps<{
  pdf: PdfDocument
  pageNumber: number
  /** tỉ lệ width/height mặc định (lấy từ trang 1) để giữ placeholder đúng chỗ */
  aspectRatio: number
}>()

const el = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)
const state = ref<'idle' | 'rendering' | 'done' | 'error'>('idle')
const errorText = ref('')
/** Tỉ lệ thật của chính trang này (mỗi trang có thể khác trang 1) — biết khi bắt đầu render */
const pageRatio = ref<number | null>(null)

let observer: IntersectionObserver | null = null
let watchdog: ReturnType<typeof setTimeout> | undefined

/** Nếu worker treo im lặng → promise không settle và không có lỗi nào; ép lộ ra sau 30s */
function armWatchdog(): void {
  clearTimeout(watchdog)
  watchdog = setTimeout(() => {
    if (state.value === 'rendering') {
      errorText.value = 'Quá lâu không phản hồi — tiến trình vẽ có thể bị treo'
      state.value = 'error'
    }
  }, 30000)
}

async function render(): Promise<void> {
  if (state.value === 'rendering' || state.value === 'done') return
  state.value = 'rendering'
  errorText.value = ''
  armWatchdog()
  try {
    const page = await props.pdf.getPage(props.pageNumber)
    const base = page.getViewport({ scale: 1 })
    // Placeholder dùng tỉ lệ trang 1; trang này có thể khác → chỉnh đúng tỉ lệ của nó
    pageRatio.value = base.width / base.height
    const containerWidth = el.value?.clientWidth || 800
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (containerWidth * dpr) / base.width
    const viewport = page.getViewport({ scale })

    const canvas = canvasEl.value
    if (!canvas) {
      // chưa có canvas — quay lại idle để lần quan sát sau vẽ lại
      state.value = 'idle'
      return
    }
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)

    await page.render({ canvas, viewport }).promise
    clearTimeout(watchdog)
    state.value = 'done'
    page.cleanup()
  } catch (error) {
    clearTimeout(watchdog)
    console.error(`[PdfPage] Lỗi render trang ${props.pageNumber}:`, error)
    errorText.value = error instanceof Error ? error.message : String(error)
    state.value = 'error'
  }
}

function retry(): void {
  state.value = 'idle'
  void render()
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect()
        void render()
      }
    },
    { rootMargin: '1200px 0px 1200px 0px' },
  )
  if (el.value) observer.observe(el.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  clearTimeout(watchdog)
})
</script>

<template>
  <div ref="el" class="pdf-page" :style="{ aspectRatio: pageRatio ?? aspectRatio }">
    <canvas v-show="state === 'done' || state === 'rendering'" ref="canvasEl" />

    <!-- Lỗi render: hiện nguyên văn để chẩn đoán + thử lại -->
    <div v-if="state === 'error'" class="pdf-overlay error">
      <NText type="error" style="font-weight: 600">Trang {{ pageNumber }} không vẽ được</NText>
      <NText class="pdf-error-detail">{{ errorText || 'Không rõ nguyên nhân' }}</NText>
      <NButton size="small" secondary style="margin-top: 8px" @click="retry">Thử lại</NButton>
    </div>

    <div v-else-if="state !== 'done'" class="pdf-overlay">Trang {{ pageNumber }}</div>
  </div>
</template>

<style scoped>
.pdf-page {
  position: relative;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  background: rgba(128, 128, 128, 0.05);
  min-height: 300px;
}

.pdf-page canvas {
  display: block;
  /* height auto giữ đúng tỉ lệ gốc của trang — không bẹp theo hộp placeholder */
  width: 100%;
  height: auto;
}

.pdf-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* reader luôn nền tối — chữ overlay dùng trắng mờ cho dễ thấy */
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}

.pdf-overlay.error {
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  text-align: center;
}

.pdf-error-detail {
  font-size: 12px;
  opacity: 0.75;
  word-break: break-word;
  max-width: 100%;
}
</style>
