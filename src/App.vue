<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  darkTheme,
  dateViVN,
  viVN,
} from 'naive-ui'

import AppHeader from '@/components/AppHeader.vue'

const route = useRoute()
const showChrome = computed(() => route.meta.chrome !== false)

const THEME_KEY = 'tdw-theme'

const themePref = ref<null | 'dark'>(readTheme())
const naiveTheme = computed(() => (themePref.value === 'dark' ? darkTheme : null))

function readTheme(): 'dark' | null {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : null
  } catch {
    return null
  }
}

function toggleTheme(): void {
  themePref.value = themePref.value === 'dark' ? null : 'dark'
  try {
    if (themePref.value) localStorage.setItem(THEME_KEY, themePref.value)
    else localStorage.removeItem(THEME_KEY)
  } catch {
    // private mode — bỏ qua
  }
}
</script>

<template>
  <n-config-provider
    :theme="naiveTheme"
    :locale="viVN"
    :date-locale="dateViVN"
    style="height: 100vh; display: flex; flex-direction: column"
  >
    <n-message-provider placement="bottom-right">
      <n-dialog-provider>
        <AppHeader v-if="showChrome" @toggle-theme="toggleTheme" />
        <main class="app-main">
          <RouterView />
        </main>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family:
    'Inter',
    'Segoe UI',
    system-ui,
    -apple-system,
    'Helvetica Neue',
    Arial,
    sans-serif;
}

#app {
  height: 100%;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
