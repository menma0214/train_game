<template>
  <teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="close">
      <div class="modal">
        <h2>ようこそ！</h2>
        <p>電車ひっぱってあそぼう！！🚃</p>
        <button @click="close">あそぶ</button>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { useWelcomeModal } from './useWelcomeModal';
const { visible, close } = useWelcomeModal();


</script>

<style scoped>
/* 最小の調整。ベースの見た目はSCSSに寄せます */
.modal {
  background: #fff;
  padding: 20px 24px;
  border-radius: 12px;
  min-width: 280px;
  max-width: min(92vw, 480px);
  box-shadow: 0 10px 28px rgba(0,0,0,.2);
}
button {
  margin-top: 12px;
}
</style>
