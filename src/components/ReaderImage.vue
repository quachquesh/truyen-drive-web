<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { NButton, NSpin, NText } from 'naive-ui'

import { ensureFileBlob } from '@/lib/blobCache'
import {
  DriveFileBlockedError,
  getFreshThumbnail,
  sizedThumbnail,
  toErrorMessage,
} from '@/lib/driveApi'
import type { ChapterFile } from '@/lib/scanner'

const props = defineProps<{ file: ChapterFile; storyKey: string }>()

const el = ref<HTMLElement | null>(null)
const state = ref<'idle' | 'loading' | 'done' | 'preview' | 'error'>('idle')
const objectUrl = ref('')
/** chế độ preview (file bị chặn tải): img src là thumbnailLink ký sẵn */
const previewUrl = ref('')
const errorText = ref('')

let observer: IntersectionObserver | null = null

async function load(): Promise<void> {
  if (state.value === 'loading' || state.value === 'done' || state.value === 'preview') return
  state.value = 'loading'
  errorText.value = ''
  try {
    const blob = await ensureFileBlob(props.file.id, props.storyKey)
    objectUrl.value = URL.createObjectURL(blob)
    state.value = 'done'
  } catch (error) {
    if (error instanceof DriveFileBlockedError) {
      await loadPreview()
      return
    }
    errorText.value = toErrorMessage(error)
    state.value = 'error'
  }
}

/** File bị chặn tải (view-only) → xem preview Google render */
async function loadPreview(): Promise<void> {
  try {
    const link = props.file.thumbnailLink ?? (await getFreshThumbnail(props.file.id))
    previewUrl.value = sizedThumbnail(link)
    state.value = 'preview'
  } catch (error) {
    errorText.value = `${toErrorMessage(error)} — không lấy được preview`
    state.value = 'error'
  }
}

/** Link preview hết hạn (vài giờ) → refresh 1 lần rồi thử lại */
async function onPreviewError(): Promise<void> {
  if (state.value !== 'preview') return
  try {
    const fresh = await getFreshThumbnail(props.file.id)
    previewUrl.value = fresh
  } catch {
    errorText.value = 'Hết hạn link preview — cuộn ra khỏi ảnh rồi vào lại'
    state.value = 'error'
  }
}

function retry(): void {
  state.value = 'idle'
  void load()
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        // prefetch cả khi còn cách viewport ~1.5 màn hình
        observer?.disconnect()
        void load()
      }
    },
    { rootMargin: '1500px 0px 1500px 0px' },
  )
  if (el.value) observer.observe(el.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
})
</script>

<template>
  <div ref="el" class="reader-image">
    <img v-if="state === 'done'" :src="objectUrl" :alt="file.name" loading="eager" />

    <!-- Preview mode: viewer không được tải xuống nhưng vẫn xem được -->
    <img
      v-else-if="state === 'preview'"
      :src="previewUrl"
      :alt="file.name"
      loading="eager"
      @error="onPreviewError"
    />

    <div v-else-if="state === 'error'" class="placeholder error">
      <NText type="error" style="font-size: 13px; text-align: center">{{ errorText }}</NText>
      <NButton size="small" secondary style="margin-top: 8px" @click="retry">Thử lại</NButton>
    </div>

    <div v-else class="placeholder">
      <NSpin />
    </div>
  </div>
</template>

<style scoped>
.reader-image {
  width: 100%;
  display: flex;
  justify-content: center;
}

.reader-image img {
  display: block;
  width: 100%;
  max-width: 900px;
  height: auto;
  background: rgba(128, 128, 128, 0.06);
}

.placeholder {
  width: 100%;
  max-width: 900px;
  min-height: 65vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(128, 128, 128, 0.05);
}

.placeholder.error {
  min-height: 200px;
}
</style>
