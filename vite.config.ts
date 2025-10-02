import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true, //Dockerから外へ公開
    port: 5173,
    // strictPort: true,
    watch: {usePolling: true} //コンテナ越しの監視を安定化
    // hmr: { clientPort: 5173 } //HMRが不安定な場合のみ有効化
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})