<template>
  <h1>電車ゲーム</h1>
  <!-- @に関してはこちらを参照：https://ja.vuejs.org/guide/essentials/event-handling.html -->
  <!-- インラインハンドラー：直接処理を書く  例：<button @click="count++">button</button> -->
  <!-- メソッドハンドラー：関数自体をかく：  例：<button @click="countUP">button</button>  -->
  <!-- function countUP(){
    count.value++;
  } -->
  <div class="game" ref="gameRoot" @contextmenu.prevent>
    <div class="sky"></div>
    <div class="ground"></div>
    <div class="track"></div>

    <!-- 駅 -->
    <!-- left:はcssプロパティ -->
    <div v-for="(st, i) in stations" :key="i" class="station" :style="{ left: (st.x - cameraX) + 'px' }" @pointerdown.prevent="onStationTap(i)" :data-active="st.active">駅</div>

    <!-- 電車 -->
    <div class="train" :style="{ transform: `translateX(${trainX - cameraX}px)` }" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <div class="car">🚃</div>
      <div class="caption" v-if="arrivedFlash">到着！</div>
    </div>

    <div class="hud">
      <div>速度: {{ speed.toFixed(1) }}</div>
      <div>位置: {{ trainX.toFixed(0) }}m</div>
      <div>操作: モード=mixed（短い右フリック=一発加速 / 長押し中=徐々に加速）</div>
    </div>
  </div>
</template>

<script lang="ts">
import { onMounted, onUnmounted, reactive, ref, toRefs } from 'vue'

// ====== 操作モード定義（mixed 固定）======
const CTRL_MODE = 'mixed' as 'flick' | 'hold' | 'mixed'
// パラメータ調整
const FLICK_PX   = 30   // フリック最小移動量(px)
const HOLD_MS    = 120  // これ未満はフリック扱い、以上は長押し加速優先
const HOLD_ACCEL = 0.20 // 長押し中のフレーム毎加速量
const STATION_INTERVAL = 600;
const STATION_COUNT = 8;
const FIRST_STATION_X = 400;

export default {
  setup() {
    // 物理ステート
    const state = reactive({
      trainX: 0,
      speed: 0,
      cameraX: 0,
      friction: 0.98,
      accelPerFlick: 2.5,
      maxSpeed: 20,
      arrivedFlash: false,
      stations: [] as { x: number; active: boolean} [],
      // 入力状態
      isHolding: false,
      lastDx: 0,
      pressTs: 0
    })

    const gameRoot = ref<HTMLElement | null>(null)

    // 入力（ポインタ）
    let pointerDown = false
    let startX = 0
    let lastPointerX = 0

    function initStations(){
      state.stations.length = 0;
      for (let i = 0; i < STATION_COUNT; i++){
        const x =FIRST_STATION_X + i * STATION_INTERVAL;
        state.stations.push({x, active: true});
      }
    }

    function recycleStations() {
      const LOOP_LENGTH = STATION_INTERVAL * STATION_COUNT;
      const recycleStations = state.cameraX - 1000;//ここでどのくらい後ろまで見切れたら送るか（適度に大きく）調節する
      
      for (const st of state.stations) {
        if(st.x < recycleStations) {
          //1週分前へ送る（必要に応じて何個でも）
          st.x += LOOP_LENGTH;
          //ループしてきた駅は再び未通過に戻す（また到着演出を出すため）
          st.active = true;
        }
      }
    }

    function onPointerDown(e: PointerEvent | TouchEvent) {
      pointerDown = true
      state.isHolding = true
      state.lastDx = 0
      state.pressTs = performance.now()

      const x =
        (e as PointerEvent).clientX ??
        (e as TouchEvent).touches?.[0]?.clientX ??
        0
      startX = x
      lastPointerX = x

      // 要素外に出ても追従（対応外ブラウザは無視）
      ;(e.target as Element | null)?.setPointerCapture?.(
        (e as PointerEvent).pointerId ?? 0
      )
    }

    function onPointerMove(e: PointerEvent | TouchEvent) {
      if (!pointerDown) return
      const x =
        (e as PointerEvent).clientX ??
        (e as TouchEvent).touches?.[0]?.clientX ??
        0
      lastPointerX = x
      state.lastDx = Math.max(0, lastPointerX - startX) // 右方向のみ

      // mixed：一定時間以上の押下なら押している間ずっと加速
      const elapsed = performance.now() - state.pressTs
      if (CTRL_MODE === 'mixed' && elapsed >= HOLD_MS && state.lastDx > 0) {
        state.speed = Math.min(state.speed + HOLD_ACCEL, state.maxSpeed)
      }
    }

    function onPointerUp() {
      if (!pointerDown) return
      pointerDown = false
      state.isHolding = false

      const dx = state.lastDx
      const elapsed = performance.now() - state.pressTs
      if (CTRL_MODE === 'mixed') {
        const treatedAsFlick = elapsed < HOLD_MS && dx > FLICK_PX
        if (treatedAsFlick) {
          state.speed = Math.min(
            state.speed + state.accelPerFlick,
            state.maxSpeed
          )
        }
        // 長押し扱いの時は move 中に加速済み
      }
    }

    // 駅タップで停車（ブレーキ演出）
    function onStationTap(index: number) {
      const st = state.stations[index]
      //短時間ブレーキさせて駅の位置にとめる
      const start = performance.now()
      const duration = 120 //100~160が体感でベスト
      const startX = state.trainX
      //現在速度から滑らかに0へ
      const initialSpeed = state.speed
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
      const anim = () => {
        const t = Math.min(1, (performance.now() - start) / duration)
        const k = easeOut(t)

        //位置を補完しながら駅へ寄せる
        state.trainX = startX + (st.x - startX) * k
        //速度も補完しながら0に
        state.speed = initialSpeed * (1 - k)

        if (t < 1) {
          requestAnimationFrame(anim)
        } else {
          //完了
          state.trainX = st.x
          state.speed = 0
          if (st.active) st.active = false
          state.arrivedFlash = true
          setTimeout(() => (state.arrivedFlash = false), 1000)
        }
      }

      requestAnimationFrame(anim)
    }

    // 駅通過時の到着フラッシュ
    function checkArrival() {
      for (const st of state.stations) {
        if (st.active && Math.abs(state.trainX - st.x) < 30) {
          st.active = false
          state.arrivedFlash = true
          setTimeout(() => (state.arrivedFlash = false), 800)
        }
      }
    }

    // メインループ
    let raf = 0
    const tick = () => {
      state.trainX += state.speed

      // 摩擦減衰＆上限
      state.speed *= state.friction
      if (state.speed < 0.05) state.speed = 0
      if (state.speed > state.maxSpeed) state.speed = state.maxSpeed

      // カメラ追従
      const desired = state.trainX - 200
      state.cameraX += (desired - state.cameraX) * 0.1

      checkArrival();
      recycleStations();
      raf = requestAnimationFrame(tick)
    }

    onMounted(() => {
      initStations();
      if (gameRoot.value) gameRoot.value.style.touchAction = 'none'
      raf = requestAnimationFrame(tick)
    })
    onUnmounted(() => cancelAnimationFrame(raf))

    return {
      ...toRefs(state),
      gameRoot,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onStationTap
    }
  }
}
</script>

<style scoped>
.game {
  position: relative;
  width: 100%;
  height: 70vh;
  overflow: hidden;
  background: #cfe9ff;
  user-select: none;
  touch-action: none;
}

.sky {
  position: absolute;
  inset: 0;
  background:
  linear-gradient(#cfe9ff, #eaf6ff 60%);
  z-index: 0;
}

.ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 35%;
  background: #e5e5c7;
  z-index: 1;
}

.track {
  position: absolute;
  left: -2000px;
  right: -2000px;
  bottom: 20%;
  height: 10px;
  background: repeating-linear-gradient(to right, #444, #444 30px, #777 30px, #777 60px);
  box-shadow: 0 4px 0 #333 inset;
  z-index: 2;
}

.station {
  position: absolute;
  bottom: 22%;
  width: 80px;
  height: 50px;
  line-height: 50px;
  text-align: center;
  font-weight: bold;
  background: #fff; border: 2px solid #444;
  border-radius: 8px;
  transform: translateX(-50%);
  z-index: 3;
  cursor: pointer;
  transition: transform 0.2s ease;
  touch-action: none;
}

.station[data-active="true"] { border-color: #2d8cf0; }
.station:active { transform: translateX(-50%) scale(0.95); }

.train {
  position: absolute; bottom: 25%;
  width: 100px; height: 60px;
  transform: translateX(0);
  transition: transform 0.05s linear;
  z-index: 4; pointer-events: auto;
}

.car {
  font-size: 48px;
  filter: drop-shadow(0 3px 0 rgba(0,0,0,0.2));
}

.caption {
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: #fffa;
  border: 1px solid #333;
  border-radius: 6px;
  animation: flash 0.8s ease;
}

@keyframes flash {
  0% { transform: translateX(-50%) scale(0.8); opacity: 0; }
  40% { opacity: 1; }
  100% { transform: translateX(-50%) scale(1.05); opacity: 0; }
}

.hud {
  position: absolute;
  left: 8px;
  top: 8px;
  background: #0008;
  color: #fff;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  z-index: 10;
}
</style>
