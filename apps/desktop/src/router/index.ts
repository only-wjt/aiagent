import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/chat/:sessionId?',
      name: 'chat',
      component: () => import('../views/Chat.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/Settings.vue'),
      children: [
        {
          path: '',
          name: 'settings-providers',
          component: () => import('../views/settings/ProviderSettings.vue'),
        },
        {
          path: 'skills',
          name: 'settings-skills',
          component: () => import('../views/settings/SkillSettings.vue'),
        },
        {
          path: 'mcp',
          name: 'settings-mcp',
          component: () => import('../views/settings/McpSettings.vue'),
        },
        {
          path: 'bots',
          name: 'settings-bots',
          component: () => import('../views/settings/BotSettings.vue'),
        },
        {
          path: 'general',
          name: 'settings-general',
          component: () => import('../views/settings/GeneralSettings.vue'),
        },
        {
          path: 'stats',
          name: 'settings-stats',
          component: () => import('../views/settings/StatsPanel.vue'),
        },
      ],
    },
  ],
})

export default router
