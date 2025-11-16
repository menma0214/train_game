<template>
  <h1>電車ゲーム</h1>
  <!-- @に関してはこちらを参照：https://ja.vuejs.org/guide/essentials/event-handling.html -->
  <!-- インラインハンドラー：直接処理を書く  例：<button @click="count++">button</button> -->
  <!-- メソッドハンドラー：関数自体をかく：  例：<button @click="countUP">button</button>  -->
  <!-- function countUP(){
    count.value++;
  } -->
  <div class="game" ref="gameRoot" @contextmenu.prevent>
    <!-- <div class="sky" :style="skyStyle"></div> -->
    <div class="grounds">
      <div v-for="g in groundSegs" :key="g.id" class="ground-seg" :style="{left: (g.x - cameraX * groundPx) + 'px', backgroundImage: `url(${(g.idx & 1) ? groundTokyo : groundChiba})`}">
      </div>
    </div>
    <div class="track">
      <div v-for="seg in trackSegs" :key="seg.id" class="track-seg" :style="{left: (seg.x - cameraX) + 'px'}"></div>
    </div>

    <!-- 駅 -->
    <!-- left:はcssプロパティ -->
    <div v-for="(st, i) in stations" :key="st.x" class="station" :style="{ left: (st.x - cameraX) + 'px' }" @pointerdown.prevent="onStationTap(i)" :data-active="st.active">駅</div>

    <!-- 電車 -->
    <div class="train" :style="{ left: anchorPx + 'px', transform: 'translateY(-50%)' }" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp">
      <div class="car">
        <img class="train-image" :src="trainImg" alt="電車">
      </div>
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
import { onMounted, onUnmounted, reactive, ref, toRefs, computed} from 'vue'
import trainImg from '@/assets/train.png'
// import skyImg from '@/assets/sky.png'
import groundTokyo from '@/assets/ground2.png'
import groundChiba from '@/assets/ground3.png'

// ====== 操作モード定義（mixed 固定）======
const CTRL_MODE = 'mixed' as 'flick' | 'hold' | 'mixed'
// パラメータ調整
const FLICK_PX   = 30   // フリック最小移動量(px)
const HOLD_MS    = 120  // これ未満はフリック扱い、以上は長押し加速優先
const HOLD_ACCEL = 0.20 // 長押し中のフレーム毎加速量
const STATION_INTERVAL = 5000;
const STATION_COUNT = 8;
const FIRST_STATION_X = 400;
const ANCHOR_RATIO = 0.1; //電車の配置
const TRACK_SEG_W = 240;
const TRACK_BUFFER = 600;
// const SKY_TITLE_W = 512;
const GROUND_TILE_W = 813; //背景画像(ground.png)の[実ピクセル横幅]に必ず合わせる
const GROUND_BUFFER = 600; //カメラ左右の余白
const GROUND_PX = 0.30;// パララックス係数(描画と再配置で共通使用)
const GROUND_OVERLAP = 0;   // 片側の重なり(px)
const GROUND_STEP = GROUND_TILE_W - GROUND_OVERLAP; // 配置ピッチ

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
      trackSegs: [] as { id:number; x:number } [],
      groundSegs: [] as { id:number; x:number; idx:number } [],
      // 入力状態
      isHolding: false,
      lastDx: 0,
      pressTs: 0
    })
    const onResize = () => {
      viewportW.value = gameRoot.value?.clientWidth || window.innerWidth
      initTrackSegs(); //幅が変わったら線路も再配置
      initGroundSegs();
    }

    const gameRoot = ref<HTMLElement | null>(null)
    const viewportW = ref(0)
    const anchorPx = computed(() => Math.max(0, Math.round(viewportW.value * ANCHOR_RATIO)))

    const segCount = computed(() => {
      const need = Math.ceil((viewportW.value + TRACK_BUFFER * 2) / TRACK_SEG_W) + 2
      return Math.max(need, 8);
    })

    const groundSegCount = computed(() => {
      const need = Math.ceil((viewportW.value + GROUND_BUFFER * 2) / GROUND_TILE_W) + 4;
      return Math.max(need, 8);
    })

    // const skyStyle = computed(() => {
    //   const raw = -state.cameraX * 0.10
    //   const offset = ((raw % SKY_TITLE_W) + SKY_TITLE_W) % SKY_TITLE_W
    //   return {
    //     backgroundImage: `url(${skyImg})`,
    //     backgroundRepeat: `repeat-x`,
    //     backgroundPosition: `${offset}px 0`
    //   } as const
    // })

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

    function initTrackSegs() {
      state.trackSegs.length = 0;
      // カメラ左バッファ位置にグリッドスナップして開始Xを決める
      const start = Math.floor((state.cameraX - TRACK_BUFFER) / TRACK_SEG_W) * TRACK_SEG_W;
      for (let i = 0; i < segCount.value; i++) {
        state.trackSegs.push({ id: i, x: start + i * TRACK_SEG_W });
      }
    }

    function initGroundSegs() {
      state.groundSegs.length = 0;
      const camP = state.cameraX * GROUND_PX; //parallax空間のカメラ配置
      const start = Math.floor((camP - GROUND_BUFFER) / GROUND_STEP) * GROUND_STEP
      const baseIndex = Math.floor(start / GROUND_TILE_W);
      for (let i = 0; i < groundSegCount.value; i++) {
        state.groundSegs.push({ id: i, x: start + i * GROUND_STEP, idx: baseIndex + i,});
      }
    }

    function recycleGroundSegs() {
      const camP = state.cameraX * GROUND_PX;
      const leftEdge = camP - GROUND_BUFFER;
      const rightEdge = leftEdge + groundSegCount.value * GROUND_STEP;
      for (const seg of state.groundSegs) {
        if (seg.x + GROUND_TILE_W < leftEdge) {
          seg.x += groundSegCount.value * GROUND_STEP;
          seg.idx += groundSegCount.value;
        } else if (seg.x > rightEdge){
          seg.x -= groundSegCount.value * GROUND_STEP;
          seg.idx -= groundSegCount.value;
        }
      }
    }

    function recycleTrackSegs() {
      const leftEdge = state.cameraX - TRACK_BUFFER;
      const rightEdge = leftEdge + segCount.value * TRACK_SEG_W;
      for (const seg of state.trackSegs) {
        if (seg.x + TRACK_SEG_W < leftEdge) {
          seg.x += segCount.value * TRACK_SEG_W;
        } else if (seg.x > rightEdge) {
          seg.x -= segCount.value * TRACK_SEG_W;
        }
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
      const desired = state.trainX - anchorPx.value
      state.cameraX += (desired - state.cameraX) * 0.1

      checkArrival();
      recycleStations();
      recycleGroundSegs();
      recycleTrackSegs();
      raf = requestAnimationFrame(tick)
    }

    onMounted(() => {
      initStations();
      if (gameRoot.value) {
        gameRoot.value.style.touchAction = 'none'
        // 初期幅の計測
        viewportW.value = gameRoot.value.clientWidth || window.innerWidth
      }
      initTrackSegs();
      initGroundSegs();
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
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onStationTap,
      anchorPx,
      // skyStyle,
      trainImg,
      // skyImg,
      groundTokyo,
      groundChiba,
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
  height: 70vh;
  overflow: hidden;
  background: #cfe9ff;
  user-select: none;
  touch-action: none;
  --track-bottom: 20%;
  --track-height: 10px;
}

/* .sky {
  position: absolute;
  inset: 0;
  z-index: 0;
  will-change: background-position;
} */

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
  width: 813px;              /* ← GROUND_TILE_W と一致 */
  height: 100%;
  background-repeat: no-repeat;
  background-size: auto 100%;
  will-change: left;
  overflow: hidden;
}

/* 疑似要素の共通ベース：幅=重なり量、高さ=全高 */
.ground-seg::before,
.ground-seg::after {
  content: "";
  position: absolute;
  top: 0;
  height: 100%;
  width: 32px; /* ← GROUND_OVERLAP と一致させる */
  pointer-events: none;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* 左端だけに配置（left+width）*/
.ground-seg::before { left: 0;
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 100%);
          mask-image: linear-gradient(to right, transparent 0, black 100%);
}

/* 右端だけに配置（right+width）*/
.ground-seg::after  { right: 0;
  -webkit-mask-image: linear-gradient(to left, transparent 0, black 100%);
          mask-image: linear-gradient(to left, transparent 0, black 100%);
}



.track {
  position: absolute;
  inset: 0 0 0 0;
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
  position: absolute;
  bottom: calc(var(--track-bottom) - var(--track-height));
  width: 15%;
  height: 15%;
  z-index: 4;
  pointer-events: auto;
}

.car {
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

.train-image {
  display:block;
  width: 154px;
  height:auto;
  pointer-events:none;
  }
</style>
