// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/store/auth.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    redirect: '/home',
    component: () => import('@/components/layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/HomeView.vue'),
      },
      {
        path: 'ai-chat',
        name: 'AiChat',
        component: () => import('@/views/AiChatView.vue'),
        meta: { fullBleed: true },
      },
      {
        path: 'ai-history',
        name: 'AiHistory',
        component: () => import('@/views/AiHistoryView.vue'),
        meta: { fullBleed: true },
      },
      {
        path: 'article/new',
        name: 'ArticleNew',
        component: () => import('@/views/ArticleView.vue'),
        props: { mode: 'create' },
      },
      {
        path: 'article/:id',
        name: 'Article',
        component: () => import('@/views/ArticleView.vue'),
        props: route => ({ id: Number(route.params.id), mode: 'view' }),
      },
      {
        path: 'article/:id/edit',
        name: 'ArticleEdit',
        component: () => import('@/views/ArticleView.vue'),
        props: route => ({ id: Number(route.params.id), mode: 'edit' }),
      },
      {
        path: 'attachment/new',
        name: 'AttachmentNew',
        component: () => import('@/views/AttachmentView.vue'),
        props: { mode: 'create' },
      },
      {
        path: 'attachment/:id',
        name: 'Attachment',
        component: () => import('@/views/AttachmentView.vue'),
        props: route => ({ id: Number(route.params.id), mode: 'view' }),
      },
      {
        path: 'attachment/:id/edit',
        name: 'AttachmentEdit',
        component: () => import('@/views/AttachmentView.vue'),
        props: route => ({ id: Number(route.params.id), mode: 'edit' }),
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
      },
      {
        path: 'admin',
        name: 'Admin',
        component: () => import('@/views/AdminView.vue'),
        meta: { requiresAdmin: true },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/home' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Navigation guard
router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth === false) return true

  if (!auth.isLoggedIn) {
    if (!auth.token) return { name: 'Login' }
    await auth.fetchCurrentUser()
    if (!auth.isLoggedIn) return { name: 'Login' }
  }

  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'Home' }
  }

  return true
})

export default router
