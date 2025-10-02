import { createApp } from 'vue'
import ModalWelcome from '@/components/ModalWelcome.vue'
import '@/styles/modal.scss'

export function mountWelcomeModal() {
  const root = document.getElementById('welcome-modal-root')
  if (!root) {
    console.warn('[welcomeModal] #welcome-modal-root が見つかりません')
    return
  }

  const app = createApp(ModalWelcome, { initialOpen: true })

  // 子からのイベントをここで拾いたい場合は use/ミドルウェア等で対応
  // 例: app.config.globalProperties.$onStart = () => initTrainGame()

  app.mount(root)
  console.log('[welcomeModal] mounted')
}

// ページ読み込み時に自動で表示
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => mountWelcomeModal())
} else {
  mountWelcomeModal()
}
