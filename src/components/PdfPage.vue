<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

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

let observer: IntersectionObserver | null = null

async function render(): Promise<void> {
  if (state.value === 'rendering' || state.value === 'done') return
  state.value = 'rendering'
  try {
    const page = await props.pdf.getPage(props.pageNumber)
    const base = page.getViewport({ scale: 1 })
    const containerWidth = el.value?.clientWidth || 800
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const scale = (containerWidth * dpr) / base.width
    const viewport = page.getViewport({ scale })

    const canvas = canvasEl.value
    if (!canvas) return
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    canvas.style.aspectRatio = `${base.width} / ${base.height}`

    await page.render({ canvas, viewport }).promise
    state.value = 'done'
    page.cleanup()
  } catch {
    state.value = 'error'
  }
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
})
</script>

<template>
  <div ref="el" class="pdf-page" :style="{ aspectRatio: aspectRatio }">
    <canvas v-show="state === 'done' || state === 'rendering'" ref="canvasEl" />
    <div v-if="state !== 'done'" class="pdf-overlay">Trang {{ pageNumber }}</div>
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
  width: 100%;
  height: 100%;
}

.pdf-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(128, 128, 128, 0.6);
  font-size: 14px;
}
</style>
