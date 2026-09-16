<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  darkTheme,
  dateViVN,
  viVN,
  type GlobalThemeOverrides,
} from 'naive-ui'

import AppHeader from '@/components/AppHeader.vue'

const route = useRoute()
const showChrome = computed(() => route.meta.chrome !== false)

const THEME_KEY = 'tdw-theme'

const FONT_STACK =
  "'Be Vietnam Pro', 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"

const themeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: FONT_STACK,
    borderRadius: '8px',
  },
}

const themePref = ref<'dark' | 'light'>(readTheme())
const naiveTheme = computed(() => (themePref.value === 'dark' ? darkTheme : null))

function readTheme(): 'dark' | 'light' {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // private mode — dùng tuỳ chọn hệ thống bên dưới
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function toggleTheme(): void {
  themePref.value = themePref.value === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_KEY, themePref.value)
  } catch {
    // private mode — bỏ qua
  }
}

watch(
  themePref,
  (pref) => {
    const dark = pref === 'dark'
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101014' : '#ffffff')
  },
  { immediate: true },
)
</script>

<template>
  <n-config-provider
    :theme="naiveTheme"
    :theme-overrides="themeOverrides"
    :locale="viVN"
    :date-locale="dateViVN"
    class="app-shell"
  >
    <n-message-provider placement="bottom-right">
      <n-dialog-provider>
        <AppHeader v-if="showChrome" :dark="themePref === 'dark'" @toggle-theme="toggleTheme" />
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

:root {
  --tdw-bg: #ffffff;
  --tdw-bg-soft: #f5f7f5;
  --tdw-text: rgba(31, 35, 37, 0.88);
  --tdw-text-muted: rgba(31, 35, 37, 0.55);
  --tdw-border: rgba(128, 128, 128, 0.22);
  --tdw-header-bg: rgba(255, 255, 255, 0.85);
  --tdw-hover: rgba(128, 128, 128, 0.08);
  --tdw-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  --tdw-primary: #18a058;
  --tdw-primary-soft: rgba(24, 160, 88, 0.1);
}

html.dark {
  --tdw-bg: #101014;
  --tdw-bg-soft: #18181c;
  --tdw-text: rgba(255, 255, 255, 0.82);
  --tdw-text-muted: rgba(255, 255, 255, 0.45);
  --tdw-border: rgba(255, 255, 255, 0.1);
  --tdw-header-bg: rgba(16, 16, 20, 0.85);
  --tdw-hover: rgba(255, 255, 255, 0.06);
  --tdw-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family:
    'Be Vietnam Pro',
    'Segoe UI',
    system-ui,
    -apple-system,
    'Helvetica Neue',
    Arial,
    sans-serif;
  background: var(--tdw-bg);
  color: var(--tdw-text);
}

#app {
  height: 100%;
}

.app-shell {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
