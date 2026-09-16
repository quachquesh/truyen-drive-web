import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const LoginPage = () => import('@/pages/LoginPage.vue')
const LibraryPage = () => import('@/pages/LibraryPage.vue')
const StoryPage = () => import('@/pages/StoryPage.vue')
const ReaderPage = () => import('@/pages/ReaderPage.vue')
const SettingsPage = () => import('@/pages/SettingsPage.vue')
const GuidePage = () => import('@/pages/GuidePage.vue')
const PrivacyPage = () => import('@/pages/PrivacyPage.vue')
const TermsPage = () => import('@/pages/TermsPage.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginPage,
      meta: { public: true, chrome: false },
    },
    {
      path: '/',
      name: 'home',
      component: LibraryPage,
    },
    {
      path: '/lib/:libId',
      name: 'library',
      component: LibraryPage,
    },
    {
      // Mở 1 folder bên trong kho như danh sách truyện (VD: folder truyện drop)
      path: '/lib/:libId/folder/:folderId',
      name: 'folder',
      component: () => import('@/pages/FolderPage.vue'),
    },
    {
      path: '/story/:libId/:storyId',
      name: 'story',
      component: StoryPage,
    },
    {
      // Reader toàn màn hình, không có header app
      path: '/read/:libId/:storyId/:chapterId',
      name: 'reader',
      component: ReaderPage,
      meta: { chrome: false },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsPage,
    },
    {
      // Trang tĩnh — xem được cả khi chưa đăng nhập (Google OAuth review cần /privacy)
      path: '/guide',
      name: 'guide',
      component: GuidePage,
      meta: { public: true, chrome: false },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: PrivacyPage,
      meta: { public: true, chrome: false },
    },
    {
      path: '/terms',
      name: 'terms',
      component: TermsPage,
      meta: { public: true, chrome: false },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) {
    // Đã đăng nhập rồi thì khỏi xem lại trang login
    if (to.name === 'login') {
      await auth.boot()
      if (auth.authed) return { path: '/' }
    }
    return true
  }

  // Refresh trang → mất token trong memory → boot() xin lại silent
  await auth.boot()
  if (!auth.authed) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router
