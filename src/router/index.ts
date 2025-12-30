// src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import TitleView from '@/views/TitleView.vue'
import PlayView from '@/views/PlayView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: TitleView },
    { path: '/play', component: PlayView },
    { path: '/:pathMatch(.*)*', redirect: '/' },  // 404 はトップへ
  ],
})
