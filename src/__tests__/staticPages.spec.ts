import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { Component } from 'vue'

import router from '@/router'
import GuidePage from '@/pages/GuidePage.vue'
import PrivacyPage from '@/pages/PrivacyPage.vue'
import TermsPage from '@/pages/TermsPage.vue'

let testRouter: Router | undefined

/** Router tối giản để RouterLink trong StaticShell resolve được khi mount. */
async function getTestRouter(): Promise<Router> {
  if (!testRouter) {
    testRouter = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'home', component: { template: '<div />' } }],
    })
    await testRouter.push('/')
    await testRouter.isReady()
  }
  return testRouter
}

async function mountPage(component: Component) {
  return mount(component, {
    global: { plugins: [createPinia(), await getTestRouter()] },
  })
}

describe('trang tĩnh (public, không cần đăng nhập)', () => {
  it('route guide/privacy/terms là public và ẩn header app', () => {
    for (const name of ['guide', 'privacy', 'terms']) {
      const route = router.getRoutes().find((r) => r.name === name)
      expect(route, `thiếu route ${name}`).toBeTruthy()
      expect(route?.meta.public).toBe(true)
      expect(route?.meta.chrome).toBe(false)
    }
  })

  it('PrivacyPage render nội dung chính sách', async () => {
    const wrapper = await mountPage(PrivacyPage)
    expect(wrapper.text()).toContain('Chính sách bảo mật')
    expect(wrapper.text()).toContain('drive.readonly')
    expect(wrapper.text()).toContain('github.com/quachquesh/truyen-drive-web/issues')
  })

  it('TermsPage render nội dung điều khoản', async () => {
    const wrapper = await mountPage(TermsPage)
    expect(wrapper.text()).toContain('Điều khoản sử dụng')
    expect(wrapper.text()).toContain('MIT')
  })

  it('GuidePage render đủ 9 mục hướng dẫn + mục lục khớp anchor', async () => {
    const wrapper = await mountPage(GuidePage)
    expect(wrapper.text()).toContain('Hướng dẫn sử dụng')

    const tocLinks = wrapper.findAll('.toc a')
    expect(tocLinks.length).toBe(9)

    for (const link of tocLinks) {
      const href = link.attributes('href') ?? ''
      expect(href.startsWith('#')).toBe(true)
      // Mỗi anchor trong mục lục phải có section tương ứng
      expect(wrapper.find(href).exists()).toBe(true)
    }
  })
})
