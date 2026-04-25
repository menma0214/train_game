<!-- 背景にデモ動画を実装予定 -->
<template>
  <div
    class="title-root"
    :style="{ backgroundImage: `url(${titleBgImg})` }">
    <video class="bg-video" :src="demoSrc" autoplay muted loop playsinline preload="auto"></video>

    <header class="hero">
      <h1 class="title">電車ゲーム</h1>
    </header>

    <div class="modal">
      <p class="modal-desc"><span style="color: blue; font-weight: bold;">画面を横にしてから</span>「あそぶ!」を押して<br>ゲームスタート！</p>
      <button
        class="btn-primary"
        type="button"
        :disabled="isStarting"
        @click="goPlay"
        >
        {{ isStarting ? '読み込み中...' : 'あそぶ！' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import demoSrc from '@/assets/train.png' // 動画を用意していないため画像で仮配置
import titleBgImg from '@/assets/top_pre_bg_image.png'

type FsElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

type FsDocument = Document & {
  webkitFullscreenElement?: Element | null
}

const router = useRouter()
const isStarting = ref(false)

async function enterFullscreenOnStart() {
  const doc = document as FsDocument
  const root = document.documentElement as FsElement

  if (doc.fullscreenElement || doc.webkitFullscreenElement) return

  if (root.requestFullscreen) {
    await root.requestFullscreen()
    return
  }

  if (root.webkitRequestFullscreen) {
    await root.webkitRequestFullscreen()
  }
}

async function goPlay() {
  if (isStarting.value) return
  isStarting.value = true

  try {
    await enterFullscreenOnStart()
  } catch (error) {
    console.warn('全画面表示にできませんでした。', error)
  }finally {
    await router.push('/play')
    isStarting.value = false
  }
}
</script>

<style>
  .title-root{
    position: fixed;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    inset: 0;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    height: 100svh;
    overflow: hidden;
    padding: env(safe-area-inset-top)
             env(safe-area-inset-right)
             env(safe-area-inset-bottom)
             env(safe-area-inset-left);
  }

  .bg-video{
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
    filter: brightness(.9)
            contrast(1.05);
  }

  .hero{
  position: absolute; 
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  color: #000;
  text-shadow: 0 2px 12px rgba(0,0,0,.45);
  }

  .title{ font-size: clamp(20px, 4vw, 40px); margin: 0 0 4px; }

  .modal{
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%,-50%);
    width: min(92vw, 520px);
    padding: 20px 24px;
    color: #fff;
    background: color-mix(in oklab, white 18%, transparent);
    border: 1px solid rgba(255,255,255,.35);
    border-radius: 16px;
    box-shadow: 0 10px 40px rgba(0,0,0,.35);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    text-align: center;
  }
  .modal-desc{
    margin: 0 0 12px; 
    color: #000;}

  .btn-primary{
    min-width: 180px;
    min-height: 44px;
    padding: 10px 18px;
    border: none;
    border-radius: 999px;
    font-weight: 800;
    font-size: 16px;
    color: #0d1b0f;
    cursor: pointer;
    background: linear-gradient(180deg, #82ffa8, #39e07a);
    box-shadow: 0 10px 20px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.6);
  }

  .btn-primary:active{ transform: translateY(1px) scale(.98); }
  .btn-primary:disabled{ opacity: .7; cursor: default; }
</style>
