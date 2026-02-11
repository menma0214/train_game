<template>
  <h1>電車ゲーム</h1>

  <div
    class="game"
    ref="gameRoot"
    :style="{ '--bg-far-x': `${cameraX * BG_PARALLAX_FAR}px`, '--bg-near-x': `${cameraX * BG_PARALLAX_NEAR}px` }"
    @contextmenu.prevent>

    <div class="track">
      <div
        v-for="seg in trackSegs"
        :key="seg.id"
        class="track-seg"
        :style="{ left: (seg.x - cameraX) + 'px' }">
      </div>
    </div>

    <div class="scenery-layer">
      <img
        v-for="item in sceneryItems"
        :key="item.id"
        class="scenery"
        :class="`scenery-${item.type}`"
        :src="scenerySprites[item.type]"
        :alt="item.type"
        :style="{ left: `${item.x - cameraX}px`, width: `${item.width}px`, transform: 'translateX(-50%)' }">
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
import houseImg from '@/assets/house.png'
import mallImg from '@/assets/mall.png'
import coltonImg from '@/assets/colton.png'

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
const BG_PARALLAX_FAR = 0.12
const BG_PARALLAX_NEAR = 0.30
const SCENERY_GAP = 24
const STATION_HALF_W = 40
type SceneryType = 'house' | 'mall' | 'colton'
type SceneryItem = { id: number; type: SceneryType; x: number; width: number }

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
      sceneryItems: [] as SceneryItem[],

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

    function randomizeScenery() {
      const width = Math.max(viewportW.value, 320)
      const margin = 80
      const base = state.cameraX
      const specs: Array<{ type: SceneryType; count: number; width: number }> = [
        { type: 'house', count: 3, width: 120 },
        { type: 'mall', count: 1, width: 148 },
        { type: 'colton', count: 1, width: 132 },
      ]
      const entries: Array<{ type: SceneryType; width: number }> = []
      for (const spec of specs) {
        for (let i = 0; i < spec.count; i++) entries.push({ type: spec.type, width: spec.width })
      }

      state.sceneryItems.length = 0
      const leftBound = base + margin
      const rightBound = base + width - margin
      let cursor = leftBound
      let id = 1
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const half = entry.width / 2
        let remainingWidth = 0
        for (let j = i + 1; j < entries.length; j++) remainingWidth += entries[j].width
        const remainingGaps = Math.max(0, entries.length - i - 1) * SCENERY_GAP

        const minCenter = cursor + half
        const maxCenter = rightBound - (remainingWidth + remainingGaps + half)
        let x = maxCenter > minCenter
          ? minCenter + Math.random() * (maxCenter - minCenter)
          : minCenter
        x = pushRightIfStationOverlaps(x, half)

        state.sceneryItems.push({ id: id++, type: entry.type, x, width: entry.width })
        cursor = x + half + SCENERY_GAP
      }
      state.sceneryItems.sort((a, b) => a.x - b.x)
    }

    function pushRightIfStationOverlaps(centerX: number, half: number) {
      let x = centerX
      for (let i = 0; i < 24; i++) {
        const blocker = state.stations.find((st) =>
          Math.abs(st.x - x) < (half + STATION_HALF_W + SCENERY_GAP)
        )
        if (!blocker) break
        x = blocker.x + half + STATION_HALF_W + SCENERY_GAP
      }
      return x
    }

    function recycleScenery() {
      const width = Math.max(viewportW.value, 320)
      const leftEdge = state.cameraX - 120
      for (const item of state.sceneryItems) {
        const half = item.width / 2
        if (item.x + half < leftEdge) {
          const rightMostEdge = state.sceneryItems.reduce(
            (m, cur) => Math.max(m, cur.x + cur.width / 2),
            state.cameraX + width
          )
          const minCenter = rightMostEdge + SCENERY_GAP + half
          item.x = minCenter + Math.random() * Math.max(60, width * 0.2)
        }
        item.x = pushRightIfStationOverlaps(item.x, half)
      }

      // 画像同士の非重複を再保証（駅回避で右へ寄せた後の衝突を防ぐ）
      state.sceneryItems.sort((a, b) => a.x - b.x)
      for (let i = 1; i < state.sceneryItems.length; i++) {
        const prev = state.sceneryItems[i - 1]
        const cur = state.sceneryItems[i]
        const minX = prev.x + prev.width / 2 + cur.width / 2 + SCENERY_GAP
        if (cur.x < minX) cur.x = minX
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
      recycleScenery()
      recycleTrackSegs()
      raf = requestAnimationFrame(tick)
    }

    const onResize = () => {
      viewportW.value = gameRoot.value?.clientWidth || window.innerWidth
      initTrackSegs()
      randomizeScenery()
    }

    onMounted(() => {
      lastT = performance.now()
      initStations()
      if (gameRoot.value) {
        gameRoot.value.style.touchAction = 'none'
        viewportW.value = gameRoot.value.clientWidth || window.innerWidth
      }
      initTrackSegs()
      randomizeScenery()
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
      scenerySprites: {
        house: houseImg,
        mall: mallImg,
        colton: coltonImg,
      } as Record<SceneryType, string>,
      BG_PARALLAX_FAR,
      BG_PARALLAX_NEAR,
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
  background:
    radial-gradient(110% 70% at 50% 0%, #fff4cc 0%, #d6ebff 45%, #b7dbff 100%);
  user-select: none;
  touch-action: none;
  --track-bottom: 20%;
  --track-height: 10px;
}

.game::before,
.game::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
  z-index: 1;
  pointer-events: none;
}

.game::before {
  background:
    radial-gradient(ellipse at 20% 38%, #ffffffcc 0 22%, transparent 24%) 0 0 / 320px 130px repeat-x,
    radial-gradient(ellipse at 72% 35%, #ffffffaa 0 20%, transparent 22%) 160px 8px / 360px 130px repeat-x,
    linear-gradient(to top, #80b18a 0 22%, transparent 22%),
    radial-gradient(150% 90% at 0% 100%, #7ca78b 0 38%, transparent 39%) 0 100% / 520px 45% repeat-x;
  background-position:
    calc(var(--bg-far-x, 0px) * -0.3) 5%,
    calc(var(--bg-far-x, 0px) * -0.2) 12%,
    0 100%,
    calc(var(--bg-far-x, 0px) * -1) 100%;
}

.game::after {
  background:
    repeating-linear-gradient(
      to right,
      #8bb26c 0 26px,
      #95bd72 26px 52px,
      #7fa45f 52px 78px
    ) 0 100% / 420px 22% repeat-x,
    repeating-linear-gradient(
      to right,
      #c18f52 0 10px,
      #b47f48 10px 20px
    ) 0 calc(100% - 22%) / 120px 6% repeat-x;
  background-position:
    calc(var(--bg-near-x, 0px) * -1) 100%,
    calc(var(--bg-near-x, 0px) * -1.35) calc(100% - 22%);
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

.scenery-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

.scenery {
  position: absolute;
  bottom: calc(var(--track-bottom) + var(--track-height) - 4%);
  height: auto;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.2));
  transform-origin: bottom center;
}

.scenery-mall {
  bottom: calc(var(--track-bottom) + var(--track-height) - 5%);
}

.scenery-colton {
  bottom: calc(var(--track-bottom) + var(--track-height));
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
  bottom: 4px;
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
