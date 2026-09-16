<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { NButton, NSpace, NSpin, NText } from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import PdfPage from '@/components/PdfPage.vue'
import { ensureFileBlob } from '@/lib/blobCache'
import { DriveFileBlockedError, toErrorMessage } from '@/lib/driveApi'
import type { PdfDocument } from '@/lib/pdfDoc'
import type { ChapterFile } from '@/lib/scanner'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const props = defineProps<{
  file: ChapterFile
  storyKey: string
}>()

const emit = defineEmits<{ loading: [value: boolean] }>()

// shallowRef: ref() thường sẽ deep-wrap document pdfjs bằng reactive proxy,
// làm class pdfjs truy cập private field (#pagesNumber...) qua proxy → TypeError.
const pdf = shallowRef<PdfDocument | null>(null)
const numPages = ref(0)
const aspectRatio = ref(0.7071)
const state = ref<'loading' | 'ready' | 'error'>('loading')
const errorText = ref('')
const blocked = ref(false)

let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null

async function load(): Promise<void> {
  state.value = 'loading'
  errorText.value = ''
  blocked.value = false
  emit('loading', true)
  try {
    const blob = await ensureFileBlob(props.file.id, props.storyKey)
    const data = new Uint8Array(await blob.arrayBuffer())
    // Tắt WebCodecs ImageDecoder: đường decode cổ điển (canvas) đã được verify
    // render 19/19 trang file MuPDF mẫu ngoài browser; đường ImageDecoder chưa
    // kiểm chứng — nếu treo, watchdog PdfPage sẽ lộ sau 30s.
    loadingTask = pdfjsLib.getDocument({ data, isImageDecoderSupported: false })
    // pdfjs v6 types lỗi danh tính — cast về interface dùng chung của app
    const doc = (await loadingTask.promise) as PdfDocument
    pdf.value = doc
    numPages.value = doc.numPages

    // Lấy tỉ lệ trang 1 làm placeholder cho mọi trang
    const firstPage = await doc.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1 })
    aspectRatio.value = viewport.width / viewport.height
    firstPage.cleanup()

    state.value = 'ready'
  } catch (error) {
    if (error instanceof DriveFileBlockedError) {
      // PDF bị chặn tải: preview chỉ có trang 1 → phải xem trực tiếp trên Drive
      blocked.value = true
      errorText.value =
        'File này chỉ xem được trên Drive (không cho tải về). Ảnh xem trước chỉ có trang 1 nên không đọc được trong ứng dụng — bấm nút bên dưới để xem trực tiếp trên Drive.'
    } else {
      errorText.value = toErrorMessage(error)
    }
    state.value = 'error'
  } finally {
    emit('loading', false)
  }
}

onMounted(() => void load())

function openDrivePreview(): void {
  window.open(`https://drive.google.com/file/d/${props.file.id}/preview`, '_blank', 'noopener')
}

onBeforeUnmount(() => {
  // destroy loadingTask sẽ hủy cả document + worker
  void loadingTask?.destroy()
  loadingTask = null
  pdf.value = null
})
</script>

<template>
  <div class="pdf-reader">
    <div v-if="state === 'loading'" class="pdf-loading">
      <NSpin size="large" />
      <NText depth="3">Đang tải PDF ({{ file.name }})...</NText>
    </div>

    <div v-else-if="state === 'error'" class="pdf-loading">
      <NText type="error" style="text-align: center; max-width: 480px">{{ errorText }}</NText>
      <NSpace size="small" style="margin-top: 8px">
        <NButton v-if="blocked" size="medium" type="primary" secondary @click="openDrivePreview">
          <template #icon>
            <AppIcon name="external" :size="15" />
          </template>
          Xem trên Drive
        </NButton>
        <NButton size="medium" secondary @click="load">Thử lại</NButton>
      </NSpace>
    </div>

    <template v-else-if="pdf">
      <PdfPage
        v-for="page in numPages"
        :key="page"
        :pdf="pdf"
        :page-number="page"
        :aspect-ratio="aspectRatio"
      />
    </template>
  </div>
</template>

<style scoped>
.pdf-reader {
  width: 100%;
}

.pdf-loading {
  min-height: 60vh;
  min-height: 60dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 16px;
}
</style>
