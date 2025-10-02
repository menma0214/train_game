<template>
  <div v-if="open" class="modal-overlay" @click.self="close">
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div class="modal-header" id="welcome-title">こんにちは！</div>
      <div class="modal-body">
        <p>今日も電車ゲームであそぼう！</p>
        <p>フリックで電車が進むよ🚃</p>
      </div>
      <div class="modal-footer">
        <button class="modal-button" @click="close">閉じる</button>
        <button class="modal-button modal-button--primary" @click="start">スタート！</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{ initialOpen?: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'start'): void }>()

const open = ref(!!props.initialOpen)

function close() {
  open.value = false
  emit('close')
}
function start() {
  open.value = false
  emit('start')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
/* 最小の調整。ベースの見た目はSCSSに寄せます */
</style>
