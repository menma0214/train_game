<template>
  <h1>電車ゲーム</h1>

  <div class="game" ref="gameRoot" @contextmenu.prevent>
    <div class="grounds">
      <div
        v-for="g in groundSegs"
        :key="g.id"
        class="ground-seg"
        :style="{ left: (g.x - cameraX * groundPx) + 'px',
                  backgroundImage: `url(${(g.idx & 1) ? groundTokyo : groundChiba})` }">
      </div>
    </div>

    <div class="track">
      <div
        v-for="seg in trackSegs"
        :key="seg.id"
        class="track-seg"
        :style="{ left: (seg.x - cameraX) + 'px' }">
      </div>
    </div>

    <!-- 駅 -->
    <div
      v-for="(st, i) in stations"
      :key="st.x"
      class="station"
      :style="{ left: (st.x - cameraX) + 'px' }"
      @pointerdown.prevent="onStationTap(i)"
      :data-active="st.active">駅</div>

    <!-- 電車 -->
    <div
      class="train"
      :style="{ left: anchorPx + 'px', '--jumpY': (-trainY) + 'px' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp">
      <div class="car">
        <img class="train-image" :src="trainImg" alt="電車">
      </div>
      <div class="caption" v-if="arrivedFlash">到着！</div>
    </div>

    <div class="hud">
      <div>速度: {{ speed.toFixed(1) }}</div>
      <div>位置: {{ trainX.toFixed(0) }}m</div>
      <div>操作: 右ドラッグ長押し=前進 / 左フリック=ブレーキ / 上フリック=ジャンプ</div>
    </div>

    <!-- 追加: 操作ボタン -->
    <div class="controls">
      <button class="btn run"
        @pointerdown.prevent="onRunDown"
        @pointerup.prevent="onRunUp"
        @pointercancel.prevent="onRunUp"
        @touchstart.prevent="onRunDown"
        @touchend.prevent="onRunUp">
        走る
      </button>
      <div class="controls-right">
        <button class="btn brake"
          @pointerdown.prevent="onBrakeDown"
          @pointerup.prevent="onBrakeUp"
          @pointercancel.prevent="onBrakeUp"
          @touchstart.prevent="onBrakeDown"
          @touchend.prevent="onBrakeUp">
          ブレーキ
        </button>
  
        <button class="btn jump"
          @pointerdown.prevent="onJumpPress"
          @pointerup.prevent="onJumpRelease"
          @pointercancel.prevent="onJumpRelease"
          @touchstart.prevent="onJumpPress"
          @touchend.prevent="onJumpRelease">
          ジャンプ
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { onMounted, onUnmounted, reactive, ref, toRefs, computed } from 'vue'
import trainImg from '@/assets/train.png'
import groundTokyo from '@/assets/ground2.png'
import groundChiba from '@/assets/ground3.png'

// ====== 操作パラメータ ======
const FLICK_TIME = 220
const FLICK_X = 32
const FLICK_Y = 28
const HOLD_RIGHT_MIN = 8
const HOLD_ACCEL = 0.20
const HOLD_MS = 120

// 押しっぱなしボタン用（秒基準）
const RUN_ACCEL_PER_SEC = 120   // 加速 (px/s^2)
const BRAKE_PER_SEC     = 200   // 減速 (px/s^2)

// ジャンプ物理
const GRAVITY    = -1200   // 下向き加速度（負）
const JUMP_SPEED = 520
const MAX_FALL   = -1400

// シーン定数
const STATION_INTERVAL = 5000
const STATION_COUNT = 8
const FIRST_STATION_X = 400
const ANCHOR_RATIO = 0.1
const TRACK_SEG_W = 240
const TRACK_BUFFER = 600
const GROUND_TILE_W = 813
const GROUND_BUFFER = 600
const GROUND_PX = 0.30
const GROUND_OVERLAP = 0
const GROUND_STEP = GROUND_TILE_W - GROUND_OVERLAP

export default {
  setup() {
    const state = reactive({
      // 入力
      isHolding: false,
      pressTs: 0,
      startX: 0, startY: 0,
      lastX: 0,  lastY: 0,

      // 走行
      trainX: 0,
      speed: 0,
      friction: 0.98,
      accelPerFlick: 2.5,
      maxSpeed: 20,

      // ジャンプ
      trainY: 0,
      vy: 0,
      onGround: true,

      // カメラ
      cameraX: 0,

      // UIなど
      arrivedFlash: false,
      stations: [] as { x: number; active: boolean }[],
      trackSegs: [] as { id: number; x: number }[],
      groundSegs: [] as { id: number; x: number; idx: number }[],

      // ボタン押しっぱ用
      runHeld: false,
      brakeHeld: false,
      jumpHeld: false,
    })

    function tryJump() {
      if (!state.onGround) return
      state.onGround = false
      state.vy = JUMP_SPEED
    }
    function applyBrakeImpulse() {
      const IMPULSE = 6.0
      state.speed = Math.max(0, state.speed - IMPULSE)
    }

    const gameRoot = ref<HTMLElement | null>(null)
    const viewportW = ref(0)
    const anchorPx = computed(() => Math.max(0, Math.round(viewportW.value * ANCHOR_RATIO)))

    const segCount = computed(() => {
      const need = Math.ceil((viewportW.value + TRACK_BUFFER * 2) / TRACK_SEG_W) + 2
      return Math.max(need, 8)
    })
    const groundSegCount = computed(() => {
      const need = Math.ceil((viewportW.value + GROUND_BUFFER * 2) / GROUND_TILE_W) + 4
      return Math.max(need, 8)
    })

    function initStations() {
      state.stations.length = 0
      for (let i = 0; i < STATION_COUNT; i++) {
        const x = FIRST_STATION_X + i * STATION_INTERVAL
        state.stations.push({ x, active: true })
      }
    }
    function initTrackSegs() {
      state.trackSegs.length = 0
      const start = Math.floor((state.cameraX - TRACK_BUFFER) / TRACK_SEG_W) * TRACK_SEG_W
      for (let i = 0; i < segCount.value; i++) {
        state.trackSegs.push({ id: i, x: start + i * TRACK_SEG_W })
      }
    }
    function initGroundSegs() {
      state.groundSegs.length = 0
      const camP = state.cameraX * GROUND_PX
      const start = Math.floor((camP - GROUND_BUFFER) / GROUND_STEP) * GROUND_STEP
      const baseIndex = Math.floor(start / GROUND_TILE_W)
      for (let i = 0; i < groundSegCount.value; i++) {
        state.groundSegs.push({ id: i, x: start + i * GROUND_STEP, idx: baseIndex + i })
      }
    }
    function recycleGroundSegs() {
      const camP = state.cameraX * GROUND_PX
      const leftEdge = camP - GROUND_BUFFER
      const rightEdge = leftEdge + groundSegCount.value * GROUND_STEP
      for (const seg of state.groundSegs) {
        if (seg.x + GROUND_TILE_W < leftEdge) {
          seg.x += groundSegCount.value * GROUND_STEP
          seg.idx += groundSegCount.value
        } else if (seg.x > rightEdge) {
          seg.x -= groundSegCount.value * GROUND_STEP
          seg.idx -= groundSegCount.value
        }
      }
    }
    function recycleTrackSegs() {
      const leftEdge = state.cameraX - TRACK_BUFFER
      const rightEdge = leftEdge + segCount.value * TRACK_SEG_W
      for (const seg of state.trackSegs) {
        if (seg.x + TRACK_SEG_W < leftEdge) {
          seg.x += segCount.value * TRACK_SEG_W
        } else if (seg.x > rightEdge) {
          seg.x -= segCount.value * TRACK_SEG_W
        }
      }
    }
    function recycleStations() {
      const LOOP_LENGTH = STATION_INTERVAL * STATION_COUNT
      const recycleStations = state.cameraX - 1000
      for (const st of state.stations) {
        if (st.x < recycleStations) {
          st.x += LOOP_LENGTH
          st.active = true
        }
      }
    }

    // --- Pointer 操作（ドラッグ/フリック） ---
    let pointerDown = false
    function onPointerDown(e: PointerEvent | TouchEvent) {
      pointerDown = true
      state.isHolding = true
      state.pressTs = performance.now()
      const x = (e as PointerEvent).clientX ?? (e as TouchEvent).touches?.[0]?.clientX ?? 0
      const y = (e as PointerEvent).clientY ?? (e as TouchEvent).touches?.[0]?.clientY ?? 0
      state.startX = state.lastX = x
      state.startY = state.lastY = y
      ;(e.target as Element | null)?.setPointerCapture?.((e as PointerEvent).pointerId ?? 0)
    }
    function onPointerMove(e: PointerEvent | TouchEvent) {
      if (!pointerDown) return
      const x = (e as PointerEvent).clientX ?? (e as TouchEvent).touches?.[0]?.clientX ?? 0
      const y = (e as PointerEvent).clientY ?? (e as TouchEvent).touches?.[0]?.clientY ?? 0
      state.lastX = x
      state.lastY = y

      const dx = x - state.startX
      const elapsed = performance.now() - state.pressTs
      if (dx > HOLD_RIGHT_MIN && elapsed >= HOLD_MS) {
        state.speed = Math.min(state.speed + HOLD_ACCEL, state.maxSpeed)
      }
    }
    function onPointerUp() {
      if (!pointerDown) return
      pointerDown = false
      state.isHolding = false
      const elapsed = performance.now() - state.pressTs
      const dx = state.lastX - state.startX
      const dy = state.lastY - state.startY
      const isFlick = elapsed <= FLICK_TIME
      if (isFlick) {
        if (Math.abs(dy) > Math.abs(dx) && -dy >= FLICK_Y) { tryJump(); return }
        if (dx <= -FLICK_X) { applyBrakeImpulse(); return }
        if (dx >=  FLICK_X) { state.speed = Math.min(state.speed + state.accelPerFlick, state.maxSpeed); return }
      }
    }

    // --- ボタン操作 ---
    function onRunDown()   { state.runHeld = true }
    function onRunUp()     { state.runHeld = false }
    function onBrakeDown() { state.brakeHeld = true }
    function onBrakeUp()   { state.brakeHeld = false }
    function onJumpPress() {
      if (state.jumpHeld) return
      state.jumpHeld = true
      tryJump()
    }
    function onJumpRelease() { state.jumpHeld = false }

    // 駅タップで停車（簡易減速演出）
    function onStationTap(index: number) {
      const st = state.stations[index]
      const start = performance.now()
      const duration = 120
      const startX = state.trainX
      const initialSpeed = state.speed
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
      const anim = () => {
        const t = Math.min(1, (performance.now() - start) / duration)
        const k = easeOut(t)
        state.trainX = startX + (st.x - startX) * k
        state.speed = initialSpeed * (1 - k)
        if (t < 1) requestAnimationFrame(anim)
        else {
          state.trainX = st.x
          state.speed = 0
          if (st.active) st.active = false
          state.arrivedFlash = true
          setTimeout(() => (state.arrivedFlash = false), 1000)
        }
      }
      requestAnimationFrame(anim)
    }

    function checkArrival() {
      for (const st of state.stations) {
        if (st.active && Math.abs(state.trainX - st.x) < 30) {
          st.active = false
          state.arrivedFlash = true
          setTimeout(() => (state.arrivedFlash = false), 800)
        }
      }
    }

    // ループ
    let raf = 0
    let lastT = performance.now()
    const tick = () => {
      const now = performance.now()
      let dt = (now - lastT) / 1000
      lastT = now
      if (dt > 0.05) dt = 0.05

      // 押しっぱなし加減速（時間基準）
      if (state.runHeld)   state.speed += RUN_ACCEL_PER_SEC * dt
      if (state.brakeHeld) state.speed = Math.max(0, state.speed - BRAKE_PER_SEC * dt)

      // 走行と摩擦
      state.trainX += state.speed
      state.speed *= state.friction
      if (state.speed < 0.05) state.speed = 0
      if (state.speed > state.maxSpeed) state.speed = state.maxSpeed

      // ジャンプ物理（修正: vy に重力を加え、y は vy で積分）
      if (!state.onGround) {
        state.vy += GRAVITY * dt                 // ← 修正
        if (state.vy < MAX_FALL) state.vy = MAX_FALL
        state.trainY += state.vy * dt            // ← 修正
        if (state.trainY <= 0) {
          state.trainY = 0
          state.vy = 0
          state.onGround = true
        }
      }

      // カメラ追従（簡易補間）
      const desired = state.trainX - anchorPx.value
      state.cameraX += (desired - state.cameraX) * 0.1

      checkArrival()
      recycleStations()
      recycleGroundSegs()
      recycleTrackSegs()
      raf = requestAnimationFrame(tick)
    }

    const onResize = () => {
      viewportW.value = gameRoot.value?.clientWidth || window.innerWidth
      initTrackSegs()
      initGroundSegs()
    }

    onMounted(() => {
      lastT = performance.now()
      initStations()
      if (gameRoot.value) {
        gameRoot.value.style.touchAction = 'none'
        viewportW.value = gameRoot.value.clientWidth || window.innerWidth
      }
      initTrackSegs()
      initGroundSegs()
      window.addEventListener('resize', onResize)
      raf = requestAnimationFrame(tick)
    })
    onUnmounted(() => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    })

    return {
      ...toRefs(state),
      gameRoot,
      onPointerDown, onPointerMove, onPointerUp,
      onStationTap,
      onRunDown, onRunUp, onBrakeDown, onBrakeUp,
      onJumpPress, onJumpRelease,
      anchorPx,
      trainImg,
      groundTokyo, groundChiba,
      trackSegs: state.trackSegs,
      groundSegs: state.groundSegs,
      groundPx: GROUND_PX,
    }
  }
}
</script>

<style scoped>
.game {
  position: relative;
  width: 100%;
  height: 70dvh;
  overflow: hidden;
  background: #cfe9ff;
  user-select: none;
  touch-action: none;
  --track-bottom: 20%;
  --track-height: 10px;
}

.grounds {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}
.ground-seg {
  position: absolute;
  bottom: 0;
  width: 813px;
  height: 100%;
  background-repeat: no-repeat;
  background-size: auto 100%;
  will-change: left;
  overflow: hidden;
}

/* 端のぼかし（必要なら残す） */
.ground-seg::before,
.ground-seg::after {
  content: "";
  position: absolute;
  top: 0;
  height: 100%;
  width: 32px;
  pointer-events: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.ground-seg::before {
  left: 0;
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 100%);
          mask-image: linear-gradient(to right, transparent 0, black 100%);
}
.ground-seg::after  {
  right: 0;
  -webkit-mask-image: linear-gradient(to left, transparent 0, black 100%);
          mask-image: linear-gradient(to left, transparent 0, black 100%);
}

.track {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.track-seg {
  position: absolute;
  bottom: var(--track-bottom);
  width: 240px;
  height: var(--track-height);
  background: repeating-linear-gradient(
    to right,
    #444, #444 30px,
    #777 30px, #777 60px
  );
  box-shadow: 0 4px 0 #333 inset;
}

.station {
  position: absolute;
  bottom: calc(var(--track-bottom) + var(--track-height) + 8px);
  width: 80px;
  height: 50px;
  line-height: 50px;
  text-align: center;
  font-weight: bold;
  background: #fff;
  border: 2px solid #444;
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
  position: absolute;
  /* 線路の上端 + 少しのすき間（clearance）を基準にする */
  bottom: calc(var(--track-bottom) + var(--track-height) + var(--clearance, -40px));
  width: auto;   /* 画像サイズに任せる or 下の .train-image で制御 */
  height: auto;
  z-index: 4;
  pointer-events: auto;
  transform: translateY(var(--jumpY, 0px));
}

.train-image {
  display:block;
  /* 端末に合わせてほどよく可変。 */
  width: clamp(120px, 15vw, 220px);
  height:auto;
  pointer-events:none;
}
.car { filter: drop-shadow(0 3px 0 rgba(0,0,0,0.2)); }

.caption {
  position: absolute;
  top: -40px; left: 50%;
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
  left: 8px; top: 8px;
  background: #0008; color: #fff;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  z-index: 10;
}


/* 追加: ボタン群 */
.controls{
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 12px;
  display: flex;
  justify-content: space-around;
  align-items: flex-end;
  gap: 8px;
  z-index: 20;
  pointer-events: none;
}

.controls-right{
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
}

.controls .btn{
  min-width: 88px;
  min-height: 44px;
  border: none;
  border-radius: 10px;
  font-weight: 700;
  background: #fff8;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.controls .btn.run   { background: #4caf50cc; color: #fff; }
.controls .btn.brake { background: #f44336cc; color: #fff; }
.controls .btn.jump  { grid-column: span 2; background: #2196f3cc; color: #fff; }

/* 画面が狭い時は右側を横並びにする例 */
@media (max-width: 480px){
  .controls-right{
    flex-direction: row;
    align-items: center;
  }
}
</style>
