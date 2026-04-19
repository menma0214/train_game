<template>
  <!-- <h1 class="gamePageTitle">電車ゲーム</h1> -->
<!-- 検証 -->
  <!-- <div class="hud">
      <div>速度: {{ speed.toFixed(1) }}</div>
      <div>位置: {{ trainX.toFixed(0) }}m</div>
      <div>操作: 右ドラッグ長押し=前進 / 左フリック=ブレーキ / 上フリック=ジャンプ</div>
  </div> -->

  <div v-if="gameOver" class="game-over-overlay">
    <div class="game-over-card">
      <p class="game-over-label">GAME OVER</p>
      <h2 class="game-over-title">🙀めんまにぶつかってしまった🙀</h2>
      <p class="game-over-text">ジャンプしてめんまをよけよう！</p>
      <button class="btn restart" type="button" @click="restartGame">
        もういちど遊ぶ
      </button>
    </div>
  </div>


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
      :data-active="st.active">
      <img
        class="station-image"
        :src="stationImg"
        alt="駅">
    </div>

    <!-- 電車 -->
    <div
      class="train"
      :style="{ left: anchorPx + 'px', '--jumpY': (-trainY) + 'px' }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp">
      <div class="car">
        <img
        class="train-image"
        :src="currentTrainImg"
        :alt="selectedTrain === 'shinkansen' ? '新幹線' : '電車'">
      </div>
      <div class="caption" v-if="arrivedFlash">到着！</div>
    </div>

    <!-- 茶トラ猫 -->
    <div
      v-if="catActive"
      class="cat"
      :style="{ left: `${catX - cameraX}px` }"
      aria-hidden="true">
      <div class="cat-figure">
        <div class="cat-tail"></div>
        <div class="cat-body">
          <span class="cat-belly"></span>
          <span class="cat-stripe cat-stripe-back"></span>
          <span class="cat-stripe cat-stripe-middle"></span>
          <span class="cat-stripe cat-stripe-front"></span>
        </div>
        <span class="cat-paw cat-paw-back"></span>
        <span class="cat-paw cat-paw-front"></span>
        <div class="cat-head">
          <span class="cat-ear cat-ear-left"></span>
          <span class="cat-ear cat-ear-right"></span>
          <span class="cat-head-stripe cat-head-stripe-left"></span>
          <span class="cat-head-stripe cat-head-stripe-center"></span>
          <span class="cat-head-stripe cat-head-stripe-right"></span>
          <span class="cat-muzzle"></span>
          <span class="cat-eye cat-eye-left"></span>
          <span class="cat-eye cat-eye-right"></span>
          <span class="cat-cheek cat-cheek-left"></span>
          <span class="cat-cheek cat-cheek-right"></span>
          <span class="cat-nose"></span>
          <span class="cat-mouth cat-mouth-left"></span>
          <span class="cat-mouth cat-mouth-right"></span>
          <span class="cat-whiskers cat-whiskers-left"></span>
          <span class="cat-whiskers cat-whiskers-right"></span>
        </div>
      </div>
    </div>

    <!-- 追加: 操作ボタン -->
    <div class="controls">
      <button class="btn skin"
        type="button"
        :disabled="gameOver"
        @click="toggleTrainImage">
        {{ selectedTrain === 'train' ? '新幹線に切り替え' : '電車に切り替え' }}
      </button>

      <button class="btn run"
        :disabled="gameOver"
        @pointerdown.prevent="onRunDown"
        @pointerup.prevent="onRunUp"
        @pointercancel.prevent="onRunUp"
        @touchstart.prevent="onRunDown"
        @touchend.prevent="onRunUp">
        走る
      </button>

      <div class="controls-right">
        <button class="btn brake"
        :disabled="gameOver"
          @pointerdown.prevent="onBrakeDown"
          @pointerup.prevent="onBrakeUp"
          @pointercancel.prevent="onBrakeUp"
          @touchstart.prevent="onBrakeDown"
          @touchend.prevent="onBrakeUp">
          ブレーキ
        </button>

        <button class="btn jump"
        :disabled="gameOver"
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
import shinkansenImg from '@/assets/shinkansen.png'
import houseImg from '@/assets/house.png'
import mallImg from '@/assets/mall.png'
import coltonImg from '@/assets/colton.png'
import stationImg from '@/assets/station.png'
import amusementParkImg from '@/assets/amusement_park.png'

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
const FIRST_STATION_X = 2000
const ANCHOR_RATIO = 0.1
const TRACK_SEG_W = 240
const TRACK_BUFFER = 600
const BG_PARALLAX_FAR = 0.12
const BG_PARALLAX_NEAR = 0.30
const SCENERY_GAP = 24
const STATION_HALF_W = 40
const CAT_SPAWN_MIN_SEC = 2
const CAT_SPAWN_MAX_SEC = 5
const CAT_SPEED_MIN = 120
const CAT_SPEED_MAX = 180
const CAT_SPAWN_MARGIN = 140
const CAT_DESPAWN_MARGIN = 220
const TRAIN_RENDER_MIN_W = 120
const TRAIN_RENDER_MAX_W = 220
const TRAIN_RENDER_RATIO = 0.15
const CAT_RENDER_MIN_W = 128
const CAT_RENDER_MAX_W = 188
const CAT_RENDER_RATIO = 0.16
const CAT_ASPECT_RATIO = 1.15


// 当たり判定
const TRAIN_HITBOX = { left: 0.18, right: 0.78, bottom: 0.05, top: 0.28}
const CAT_HITBOX = {left: 0.18, right: 0.74, bottom: 0.02, top: 0.34 }
type SceneryType = 'house' | 'mall' | 'colton' | 'amusementPark'
type SceneryItem = { id: number; type: SceneryType; x: number; width: number }
type CollisionRect = { left: number; right: number; bottom: number; top: number; }

export default {
  setup() {
    // trainSpritesに使うキーを定義
    type TrainKind = 'train' | 'shinkansen'
    //キーが train, shinkansen で値が文字列になるオブジェクトの型定義
    const trainSprites: Record<TrainKind, string> = {
      train: trainImg,
      shinkansen: shinkansenImg,
    }

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
      maxSpeed: 10,

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
      selectedTrain: 'train' as TrainKind,

      //猫
      catActive: false,
      catX: 0,
      catSpeed: 0,
      catNextSpawnIn: 0,
      gameOver: false,

      // ボタン押しっぱ用
      runHeld: false,
      brakeHeld: false,
      jumpHeld: false,
    })

    const currentTrainImg = computed(() => trainSprites[state.selectedTrain])

    function toggleTrainImage () {
      if(state.gameOver) return
      state.selectedTrain = state.selectedTrain === 'train' ? 'shinkansen' : 'train'
    }

    function tryJump() {
      if (state.gameOver) return
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

    const clampValue = (value: number, min: number, max: number) =>
      Math.min(max, Math.max(min, value))
    const getTrainRenderSize = () => {
      const width = clampValue(
         viewportW.value * TRAIN_RENDER_RATIO,
         TRAIN_RENDER_MIN_W,
         TRAIN_RENDER_MAX_W
      )
      return { width, height: width }
    }

    const getCatRenderSize = () => {
      const width = clampValue(
        viewportW.value * CAT_RENDER_RATIO,
        CAT_RENDER_MIN_W,
        CAT_RENDER_MAX_W
      )
      return { width, height: width / CAT_ASPECT_RATIO }
    }

    function getTrainCollisionRect(): CollisionRect {
      const {width, height } = getTrainRenderSize()
      return {
        left: state.trainX + width * TRAIN_HITBOX.left,
        right: state.trainX + width * TRAIN_HITBOX.right,
        bottom: state.trainY + height * TRAIN_HITBOX.bottom,
        top: state.trainY + height * TRAIN_HITBOX.top,
      }
    }

    function getCatCollisionRect(): CollisionRect {
      const { width, height } = getCatRenderSize()
      return {
        left: state.catX + width * CAT_HITBOX.left,
        right: state.catX + width * CAT_HITBOX.right,
        bottom: height * CAT_HITBOX.bottom,
        top: height * CAT_HITBOX.top,
      }
    }

    function isRectOverlap(a: CollisionRect, b: CollisionRect) {
      return (
        a.left < b.right &&
        a.right > b.left &&
        a.bottom < b.top &&
        a.top > b.bottom
      )
    }

    function triggerGameOver() {
      state.gameOver = true
      state.speed = 0
      state.vy = 0
      state.isHolding = false
      state.runHeld = false
      state.brakeHeld = false
      state.jumpHeld = false
      pointerDown = false
    }

    function checkCatCollision() {
      if (!state.catActive || state.gameOver) return false
      const collided = isRectOverlap(getTrainCollisionRect(), getCatCollisionRect())
      if (collided) triggerGameOver()
      return collided
    }

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
        { type: 'house', count: 3, width: 150 },
        { type: 'mall', count: 1, width: 230 },
        { type: 'house', count: 2, width: 150 },
        { type: 'colton', count: 1, width: 230 },
        { type: 'house', count: 3, width: 150 },
        { type: 'amusementPark', count: 1, width: 235 },
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
      if (state.gameOver) return
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
      if (state.gameOver) return
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
      if (state.gameOver) {
        pointerDown = false
        state.isHolding = false
        return
      }
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
    function onRunDown()   {
      if (state.gameOver) return
      state.runHeld = true
    }
    function onRunUp()     { state.runHeld = false }
    function onBrakeDown() {
      if (state.gameOver) return
      state.brakeHeld = true
    }
    function onBrakeUp()   { state.brakeHeld = false }
    function onJumpPress() {
      if (state.gameOver) return
      if (state.jumpHeld) return
      state.jumpHeld = true
      tryJump()
    }

    function onJumpRelease() { state.jumpHeld = false }
    // 駅タップで停車（簡易減速演出）
    function onStationTap(index: number) {
      if (state.gameOver) return
      const st = state.stations[index]
      const start = performance.now()
      const duration = 120
      const startX = state.trainX
      const initialSpeed = state.speed
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
      const anim = () => {
        if (state.gameOver) return
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

    function resetGameState() {
      pointerDown = false
      state.isHolding = false
      state.pressTs = 0
      state.startX = 0
      state.startY = 0
      state.lastX = 0
      state.lastY = 0

      state.trainX = 0
      state.speed = 0
      state.trainY = 0
      state.vy = 0
      state.onGround = true
      state.cameraX = 0

      state.arrivedFlash = false
      state.catActive = false
      state.catX = 0
      state.catSpeed = 0
      state.gameOver = false
      state.runHeld = false
      state.brakeHeld = false
      state.jumpHeld = false

      initStations()
      initTrackSegs()
      randomizeScenery()
      resetCatSpawnTimer()
    }

    function restartGame() {
      cancelAnimationFrame(raf)
      lastT = performance.now()
      resetGameState()
      raf = requestAnimationFrame(tick)
    }

    function resetCatSpawnTimer() {
      state.catNextSpawnIn =
      CAT_SPAWN_MIN_SEC + Math.random() * (CAT_SPAWN_MAX_SEC - CAT_SPAWN_MIN_SEC)
    }

    function spawnCat() {
      const width = Math.max(viewportW.value, 320)
      state.catActive = true
      state.catX = state.cameraX + width + CAT_SPAWN_MARGIN
      state.catSpeed = CAT_SPEED_MIN + Math.random() * (CAT_SPEED_MAX - CAT_SPEED_MIN)
    }

    function updateCat(dt: number) {
      if (!state.catActive) {
        state.catNextSpawnIn -= dt
        if (state.catNextSpawnIn <= 0) spawnCat()
        return
      }

      state.catX -= state.catSpeed * dt

      if (state.catX < state.cameraX - CAT_DESPAWN_MARGIN) {
        state.catActive = false
        resetCatSpawnTimer()
      }
    }
    // ループ
    let raf = 0
    let lastT = performance.now()
    const tick = () => {
      if (state.gameOver) return

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
        state.vy += GRAVITY * dt
        if (state.vy < MAX_FALL) state.vy = MAX_FALL
        state.trainY += state.vy * dt
        if (state.trainY <= 0) {
          state.trainY = 0
          state.vy = 0
          state.onGround = true
        }
      }

      // カメラ追従（簡易補間）
      const desired = state.trainX - anchorPx.value
      state.cameraX += (desired - state.cameraX) * 0.1

      updateCat(dt)
      if (checkCatCollision()) return
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
      resetCatSpawnTimer()
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
      toggleTrainImage,
      restartGame,
      currentTrainImg,
      anchorPx,
      trainImg,
      stationImg,
      scenerySprites: {
        house: houseImg,
        mall: mallImg,
        colton: coltonImg,
        amusementPark: amusementParkImg,
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
  height: 100vh;
  height: 100svh;
  height: 100dvh;
  overflow: hidden;
  background:
    radial-gradient(110% 70% at 50% 0%, #fff4cc 0%, #d6ebff 45%, #b7dbff 100%);
  user-select: none;
  touch-action: none;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
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
  bottom: calc(var(--track-bottom) + var(--track-height) - 6%);
  height: auto;
  filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.2));
  transform-origin: bottom center;
}

.scenery-mall {
  bottom: calc(var(--track-bottom) + var(--track-height) - 8.5%);
}

.scenery-colton {
  bottom: calc(var(--track-bottom) + var(--track-height) - 1%);
}

.scenery-amusementPark {
  bottom: calc(var(--track-bottom) + var(--track-height) - 12%);
}

.station {
  position: absolute;
  bottom: calc(var(--track-bottom) + var(--track-height) - 23%);
  width: 105%;
  height: 105%;
  line-height: 50px;
  transform: translateX(-50%);
  z-index: 3;
  cursor: pointer;
  transition: transform 0.2s ease;
  touch-action: none;
}
.station-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
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

.cat {
  position: absolute;
  left: 0;
  bottom: calc(var(--track-bottom) + var(--track-height));
  width: clamp(128px, 16vw, 188px);
  aspect-ratio: 1.15;
  z-index: 5;
  pointer-events: none;
  filter: drop-shadow(0 10px 10px rgba(0, 0, 0, 0.16));
}

.cat,
.cat * {
  box-sizing: border-box;
  width: 8%;
}

.cat-figure {
  position: relative;
  width: 100%;
  height: 100%;
  transform: scaleX(-1);
  transform-origin: center;
  animation: cat-bob 4.2s ease-in-out infinite;
}

.cat::after {
  content: "";
  position: absolute;
  left: 18%;
  right: 10%;
  bottom: 4%;
  height: 10%;
  background: rgba(90, 60, 36, 0.22);
  border-radius: 50%;
  filter: blur(4px);
  z-index: 0;
}

.cat-tail,
.cat-body,
.cat-head,
.cat-belly,
.cat-stripe,
.cat-paw,
.cat-ear,
.cat-head-stripe,
.cat-muzzle,
.cat-eye,
.cat-cheek,
.cat-nose,
.cat-mouth,
.cat-whiskers {
  position: absolute;
}

.cat-tail {
  left: 7%;
  bottom: 24%;
  width: 18%;
  height: 48%;
  border: 3px solid #6e441f;
  border-radius: 999px;
  background:
    repeating-linear-gradient(
      to bottom,
      #e3a154 0 14px,
      #e3a154 14px 18px,
      #be6421 18px 26px
    );
  transform-origin: bottom center;
  transform: rotate(-26deg);
  z-index: 1;
  animation: cat-tail-swish 3.5s ease-in-out infinite;
}

.cat-body {
  left: 18%;
  bottom: 7%;
  width: 47%;
  height: 42%;
  border: 3px solid #6e441f;
  border-radius: 50% 50% 42% 42%;
  background: linear-gradient(180deg, #eca655 0%, #db8433 100%);
  overflow: hidden;
  transform: rotate(-6deg);
  z-index: 2;
}

.cat-belly {
  left: 22%;
  bottom: 2%;
  width: 56%;
  height: 60%;
  border-radius: 50%;
  background: #fff0db;
  z-index: 1;
}

.cat-stripe {
  top: 8%;
  width: 15%;
  height: 58%;
  border-radius: 999px;
  background: #b85d1d;
  z-index: 2;
}

.cat-stripe-back {
  left: 16%;
  transform: rotate(-16deg);
}

.cat-stripe-middle {
  left: 42%;
}

.cat-stripe-front {
  left: 67%;
  transform: rotate(12deg);
}

.cat-paw {
  bottom: -4%;
  width: 19%;
  height: 23%;
  border: 3px solid #6e441f;
  border-radius: 48% 48% 38% 38%;
  background: #fff4e5;
  z-index: 3;
  transform-origin: center 10%;
  animation: cat-paw-step 0.95s ease-in-out infinite;
}

.cat-paw::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: 26%;
  width: 2px;
  height: 30%;
  background: rgba(110, 68, 31, 0.4);
  transform: translateX(-50%);
  box-shadow:
    -10px 2px 0 rgba(110, 68, 31, 0.28),
    10px 2px 0 rgba(110, 68, 31, 0.28);
}

.cat-paw-back {
  left: 17%;
  animation-delay: -0.48s;
}

.cat-paw-front {
  left: 43%;
}

.cat-head {
  right: 2%;
  top: 23%;
  width: 50%;
  height: 48%;
  border: 3px solid #6e441f;
  border-radius: 50%;
  background: linear-gradient(180deg, #efab5b 0%, #de8e3d 100%);
  z-index: 4;
}

.cat-ear {
  top: -13%;
  width: 28%;
  height: 31%;
  border: 3px solid #6e441f;
  background: #eea659;
  overflow: hidden;
}

.cat-ear::after {
  content: "";
  position: absolute;
  inset: 28% 20% 10%;
  background: #f6c1b3;
}

.cat-ear-left {
  left: 8%;
  border-radius: 70% 12% 14% 22%;
  transform: rotate(-24deg);
}

.cat-ear-right {
  right: 8%;
  border-radius: 12% 70% 22% 14%;
  transform: rotate(24deg);
}

.cat-head-stripe {
  top: 12%;
  width: 13%;
  height: 24%;
  border-radius: 999px;
  background: #b85d1d;
  z-index: 1;
}

.cat-head-stripe-left {
  left: 28%;
  transform: rotate(-20deg);
}

.cat-head-stripe-center {
  left: 44%;
}

.cat-head-stripe-right {
  left: 60%;
  transform: rotate(20deg);
}

.cat-muzzle {
  left: 28%;
  top: 48%;
  width: 44%;
  height: 27%;
  border-radius: 48% 48% 56% 56%;
  background: #fff2e2;
  z-index: 2;
}

.cat-eye {
  top: 41%;
  width: 10%;
  height: 16%;
  border-radius: 50%;
  background: #2d2621;
  z-index: 3;
  transform-origin: center 65%;
  animation: cat-blink 4.8s infinite;
}

.cat-eye-left {
  left: 32%;
}

.cat-eye-right {
  right: 32%;
}

.cat-cheek {
  top: 60%;
  width: 10%;
  height: 8%;
  border-radius: 50%;
  background: rgba(248, 170, 160, 0.7);
  z-index: 3;
}

.cat-cheek-left {
  left: 24%;
}

.cat-cheek-right {
  right: 24%;
}

.cat-nose {
  left: 46%;
  top: 57%;
  width: 8%;
  height: 7%;
  background: #ef8f8a;
  clip-path: polygon(50% 100%, 0 0, 100% 0);
  z-index: 4;
}

.cat-mouth {
  top: 61%;
  width: 10%;
  height: 11%;
  border-bottom: 2px solid #6e441f;
  z-index: 4;
}

.cat-mouth-left {
  left: 40%;
  border-left: 2px solid #6e441f;
  border-radius: 0 0 0 12px;
  transform: rotate(-8deg);
}

.cat-mouth-right {
  right: 40%;
  border-right: 2px solid #6e441f;
  border-radius: 0 0 12px 0;
  transform: rotate(8deg);
}

.cat-whiskers {
  top: 60%;
  width: 30%;
  height: 2px;
  background: rgba(110, 68, 31, 0.7);
  z-index: 2;
}

.cat-whiskers::before,
.cat-whiskers::after {
  content: "";
  position: absolute;
  width: 100%;
  height: 2px;
  background: rgba(110, 68, 31, 0.7);
}

.cat-whiskers-left {
  left: -2%;
  /* transform: rotate(8deg); */
}

.cat-whiskers-left::before {
  top: -5px;
  transform: rotate(8deg);
}

.cat-whiskers-left::after {
  top: 4px;
  transform: rotate(-15deg);
}

.cat-whiskers-right {
  right: -2%;
  /* transform: rotate(-8deg); */
}

.cat-whiskers-right::before {
  top: -5px;
  transform: rotate(-4deg);
}

.cat-whiskers-right::after {
  top: 5px;
  transform: rotate(15deg);
}

@keyframes cat-tail-swish {
  0%, 100% { transform: rotate(-26deg); }
  50% { transform: rotate(10deg); }
}

@keyframes cat-blink {
  0%, 44%, 48%, 100% { transform: scaleY(1); }
  45%, 47% { transform: scaleY(0.12); }
}

@keyframes cat-paw-step {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-4px) rotate(-8deg); }
  50% { transform: translateY(3px) rotate(7deg); }
  75% { transform: translateY(-2px) rotate(-4deg); }
}

@keyframes cat-bob {
  0%, 100% { transform: translateY(0) scaleX(-1); }
  50% { transform: translateY(-3px) scaleX(-1); }
}

.gamePageTitle {
  padding-left: 1%;
}

.game-over-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding:
    calc(var(--safe-top) + 20px)
    calc(var(--safe-right) + 20px)
    calc(var(--safe-bottom) + 20px)
    calc(var(--safe-left) + 20px);
  background: rgba(10, 18, 30, 0.52);
  backdrop-filter: blur(6px);
}

.game-over-card {
  width: min(92vw, 360px);
  padding: 22px 20px 18px;
  border-radius: 18px;
  background: rgba(255, 250, 244, 0.95);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.22);
  text-align: center;
}

.game-over-label {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: #d35400;
}

.game-over-title {
  margin: 0;
  font-size: clamp(20px, 5vw, 20px);
  color: #1f2937;
}

.game-over-text {
  margin: 10px 0 0;
  color: #4b5563;
}

.hud {
  position: absolute;
  left: calc(var(--safe-left) + 12px);
  top: calc(var(--safe-top) + 12px);
  background: #0008;
  color: #fff;
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 6px;
  z-index: 10;
}

/* ボタン */
.controls{
  position: absolute;
  left: calc(var(--safe-left) + 12px);
  right: calc(var(--safe-right) + 12px);
  bottom: calc(var(--safe-bottom) + 8px);
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
.controls .btn:disabled {
  opacity: 0.55;
}

.game-over-card .btn.restart {
  min-width: 180px;
  min-height: 44px;
  margin-top: 14px;
  border: none;
  border-radius: 999px;
  font-weight: 800;
  background: linear-gradient(180deg, #ff9b4a, #ff6b2f);
  color: #fff;
}
/* 画面が狭い時は右側を横並びにする */
@media (max-width: 480px){
  .controls-right{
    flex-direction: row;
    align-items: center;
  }
}
</style>
