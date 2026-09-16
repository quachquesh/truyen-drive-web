<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NList,
  NListItem,
  NModal,
  NSpace,
  NText,
  useDialog,
  useMessage,
} from 'naive-ui'

import AppIcon from '@/components/AppIcon.vue'
import DriveFolderPicker from '@/components/DriveFolderPicker.vue'
import { useLibraryStore } from '@/stores/library'
import { toErrorMessage } from '@/lib/driveApi'

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const libraryStore = useLibraryStore()

const newName = ref('')
const newFolder = ref('')
const adding = ref(false)
const addError = ref('')
/** true → hiện form dán URL/ID thay vì duyệt Drive (folder share link-only không hiện trong list) */
const showManual = ref(false)

const editingId = ref('')
const editingName = ref('')

/** Chọn folder từ picker → thêm kho ngay (tên kho = tên folder nếu chưa đặt tên) */
async function onPick(folder: { id: string; name: string }): Promise<void> {
  if (adding.value) return
  newFolder.value = folder.id
  if (!newName.value.trim()) newName.value = folder.name
  await addLibrary()
}

async function addLibrary(): Promise<void> {
  addError.value = ''
  if (!newFolder.value.trim()) {
    addError.value = 'Dán URL hoặc ID folder Google Drive của kho'
    return
  }
  adding.value = true
  try {
    const lib = await libraryStore.add(newName.value, newFolder.value)
    message.success(`Đã thêm kho "${lib.name}"`)
    newName.value = ''
    newFolder.value = ''
    libraryStore.closeManager()
    // Từ trang chủ / trang kho → mở luôn kho vừa thêm
    const routeName = router.currentRoute.value.name
    if (routeName === 'home' || routeName === 'library') {
      await router.push({ name: 'library', params: { libId: lib.id } })
    }
  } catch (error) {
    addError.value = toErrorMessage(error)
  } finally {
    adding.value = false
  }
}

function startRename(id: string, name: string): void {
  editingId.value = id
  editingName.value = name
}

async function commitRename(id: string): Promise<void> {
  if (editingName.value.trim()) await libraryStore.rename(id, editingName.value)
  editingId.value = ''
}

function removeLibrary(id: string, name: string): void {
  dialog.warning({
    title: 'Xóa kho truyện?',
    content: `Xóa "${name}" khỏi danh sách? (Không xóa dữ liệu trên Google Drive)`,
    positiveText: 'Xóa',
    negativeText: 'Để lại',
    onPositiveClick: async () => {
      await libraryStore.remove(id)
      message.success('Đã xóa kho')
      // Nếu kho đang mở bị xóa thì về đúng kho active mới
      if (router.currentRoute.value.params.libId) {
        const activeId = libraryStore.activeId
        void router.push(
          activeId ? { name: 'library', params: { libId: activeId } } : { name: 'home' },
        )
      }
    },
  })
}
</script>

<template>
  <NModal
    :show="libraryStore.managerVisible"
    preset="card"
    title="Quản lý kho truyện"
    style="width: min(560px, 94vw)"
    @update:show="(v: boolean) => (v ? libraryStore.openManager() : libraryStore.closeManager())"
  >
    <NSpace vertical size="large">
      <!-- Thêm kho: duyệt Drive chọn folder, hoặc dán URL thủ công -->
      <div>
        <NText depth="2" style="font-size: 13px">Thêm kho từ Google Drive</NText>

        <DriveFolderPicker v-if="!showManual" style="margin-top: 8px" @select="onPick" />
        <NButton
          v-if="!showManual"
          text
          size="small"
          style="margin-top: 8px"
          @click="showManual = true"
        >
          <template #icon>
            <AppIcon name="link" :size="14" />
          </template>
          Không thấy folder? Dán link Drive thủ công
        </NButton>

        <template v-else>
          <NForm label-placement="top" :show-feedback="false" style="margin-top: 8px">
            <NFormItem label="Tên kho (tuỳ chọn)">
              <NInput v-model:value="newName" placeholder="VD: Kho chính" />
            </NFormItem>
            <NFormItem label="Link (URL) folder Google Drive">
              <NInput
                v-model:value="newFolder"
                placeholder="https://drive.google.com/drive/folders/..."
                @keydown.enter="addLibrary"
              />
            </NFormItem>
            <NButton
              type="primary"
              style="margin-top: 8px; float: right"
              :loading="adding"
              @click="addLibrary"
              >Thêm kho</NButton
            >
          </NForm>
          <NButton text size="small" style="margin-top: 20px" @click="showManual = false">
            <template #icon>
              <AppIcon name="arrow-left" :size="14" />
            </template>
            Chọn trực tiếp từ Drive
          </NButton>
        </template>

        <NAlert
          v-if="addError"
          type="error"
          style="margin-top: 12px"
          closable
          @close="addError = ''"
        >
          {{ addError }}
        </NAlert>
      </div>

      <div v-if="libraryStore.libraries.length">
        <NText depth="2" style="font-size: 13px">Các kho đã thêm</NText>
        <NList bordered style="margin-top: 8px">
          <NListItem v-for="lib in libraryStore.libraries" :key="lib.id">
            <div class="lib-row">
              <template v-if="editingId === lib.id">
                <NInput
                  v-model:value="editingName"
                  size="small"
                  style="max-width: 220px"
                  @keydown.enter="commitRename(lib.id)"
                  @blur="commitRename(lib.id)"
                />
              </template>
              <div v-else class="lib-info">
                <span class="lib-name">{{ lib.name }}</span>
                <NText depth="3" class="lib-folder" :title="lib.folderId">
                  {{ lib.folderId }}
                </NText>
              </div>
              <span class="lib-actions">
                <NButton size="small" quaternary @click="startRename(lib.id, lib.name)">
                  <template #icon>
                    <AppIcon name="pencil" :size="14" />
                  </template>
                  Đổi tên
                </NButton>
                <NButton
                  size="small"
                  quaternary
                  type="error"
                  @click="removeLibrary(lib.id, lib.name)"
                >
                  <template #icon>
                    <AppIcon name="trash" :size="14" />
                  </template>
                  Xóa
                </NButton>
              </span>
            </div>
          </NListItem>
        </NList>
      </div>
    </NSpace>
  </NModal>
</template>

<style scoped>
.lib-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.lib-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.lib-name {
  font-weight: 500;
}

.lib-folder {
  font-size: 12px;
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-actions {
  display: inline-flex;
  gap: 4px;
  flex-shrink: 0;
}

@media (max-width: 640px) {
  .lib-folder {
    max-width: 140px;
  }
}
</style>
