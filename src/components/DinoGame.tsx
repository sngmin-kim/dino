import { useEffect, useRef, useCallback, useState } from 'react'
import { ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import { startGame, finishGame, listenTokenRefresh } from '../api/gameApi'

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 480
let H = 400
let GROUND_Y = 330
const GRAVITY = 0.6
const JUMP_VY = -13
const JUMP_HOLD_GRAVITY = 0.4
const MAX_JUMP_HOLD_FRAMES = 6
const INITIAL_SPEED = 3.5
const MAX_SPEED = 11
const SCORE_INCREMENT = 0.025
const TUTORIAL_SPEED = 3.0

type TutorialPhase = 'none' | 'intro' | 'scrolling' | 'obstacle' | 'jumping' | 'success' | 'scrolling2' | 'ptero' | 'ducking' | 'duckSuccess' | 'ready' | 'done'
const DAY_HOLD_FRAMES   = 800   // ~13s 낮 유지
const NIGHT_HOLD_FRAMES = 800   // ~13s 밤 유지
const NIGHT_FADE_FRAMES = 60    // ~1s 페이드

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dino {
  x: number; y: number; vy: number
  onGround: boolean; ducking: boolean
  frame: number; frameTick: number; dead: boolean
}
interface Obstacle {
  type: 'cactus' | 'ptero'
  x: number; y: number; w: number; h: number
  variant: number; frame: number; frameTick: number
}
interface Cloud { x: number; y: number; w: number }
interface Star  { x: number; y: number; size: number }
interface GroundBump { x: number; y: number; w: number }

interface GameState {
  dino: Dino; obstacles: Obstacle[]; clouds: Cloud[]
  stars: Star[]; ground: GroundBump[]
  speed: number; score: number; hiScore: number; scoreTick: number
  running: boolean; started: boolean; gameOver: boolean
  nightFactor: number   // 0=낮, 1=밤
  nightPhase: 'day' | 'toNight' | 'night' | 'toDay'
  nightTimer: number
  lastObstacleX: number; userId: string | null
  flashScore: boolean; flashTick: number; nextObstacleDist: number
  tutorialPhase: TutorialPhase; tutorialTimer: number
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function lerpC(day: string, night: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ]
  const [dr, dg, db] = parse(day)
  const [nr, ng, nb] = parse(night)
  const r = Math.round(dr + (nr - dr) * t)
  const g = Math.round(dg + (ng - dg) * t)
  const b = Math.round(db + (nb - db) * t)
  return `rgb(${r},${g},${b})`
}

// ─── Theme ────────────────────────────────────────────────────────────────────
function theme(f: number) {
  return {
    bg:     lerpC('#f7f7f7', '#1a1a1a', f),
    main:   lerpC('#535353', '#cccccc', f),
    eye:    lerpC('#f7f7f7', '#1a1a1a', f),
    pupil:  lerpC('#222222', '#999999', f),
    cloud:  lerpC('#d0d0d0', '#444444', f),
    bump:   lerpC('#aaaaaa', '#666666', f),
    hi:     lerpC('#bbbbbb', '#777777', f),
    score:  lerpC('#535353', '#cccccc', f),
    hint:   lerpC('#757575', '#aaaaaa', f),
    starA:  f,
  }
}

function px(n: number) { return Math.round(n) }

// ─── Drawing ──────────────────────────────────────────────────────────────────
function drawDino(ctx: CanvasRenderingContext2D, dino: Dino, t: { main: string; eye: string; pupil: string }) {
  const x = px(dino.x)
  const y = px(dino.y)
  ctx.fillStyle = t.main

  if (dino.ducking) {
    // shift down 12px so feet touch ground (GROUND_Y = dino.y + 50)
    const by = y + 32
    ctx.fillRect(x + 2, by, 38, 12)           // body
    ctx.fillRect(x + 26, by - 12, 18, 14)     // head
    ctx.fillStyle = t.eye
    ctx.fillRect(x + 32, by - 10, 6, 6)       // eye white
    ctx.fillStyle = t.pupil
    ctx.fillRect(x + 34, by - 9, 3, 3)        // pupil
    ctx.fillStyle = t.main
    if (dino.frame === 0) {
      ctx.fillRect(x + 6, by + 12, 10, 6)
      ctx.fillRect(x + 22, by + 12, 10, 4)
    } else {
      ctx.fillRect(x + 6, by + 12, 10, 4)
      ctx.fillRect(x + 22, by + 12, 10, 6)
    }
    return
  }

  ctx.fillRect(x, y + 22, 10, 8)         // tail
  ctx.fillRect(x + 8, y + 16, 34, 20)    // body
  ctx.fillRect(x + 30, y + 8, 14, 12)    // neck
  ctx.fillRect(x + 24, y, 22, 14)        // head
  ctx.fillStyle = t.eye
  ctx.fillRect(x + 34, y + 2, 7, 7)      // eye white
  ctx.fillStyle = t.pupil
  ctx.fillRect(x + 37, y + 3, 3, 3)      // pupil
  ctx.fillStyle = t.main
  if (!dino.onGround) {
    ctx.fillRect(x + 10, y + 36, 10, 8)
    ctx.fillRect(x + 26, y + 36, 10, 6)
  } else if (dino.frame === 0) {
    ctx.fillRect(x + 10, y + 36, 10, 14)
    ctx.fillRect(x + 26, y + 36, 10, 7)
  } else {
    ctx.fillRect(x + 10, y + 36, 10, 7)
    ctx.fillRect(x + 26, y + 36, 10, 14)
  }
}

function drawDeadDino(ctx: CanvasRenderingContext2D, dino: Dino, t: { main: string; eye: string; pupil: string }) {
  drawDino(ctx, { ...dino, frame: 0, ducking: false }, t)
  const x = px(dino.x)
  const y = px(dino.y)
  ctx.fillStyle = t.eye
  ctx.fillRect(x + 34, y + 2, 7, 7)
  ctx.fillStyle = t.main
  ctx.fillRect(x + 34, y + 2, 2, 2)
  ctx.fillRect(x + 39, y + 2, 2, 2)
  ctx.fillRect(x + 36, y + 4, 3, 2)
  ctx.fillRect(x + 34, y + 7, 2, 2)
  ctx.fillRect(x + 39, y + 7, 2, 2)
}

const CACTUS_VARIANTS = [
  { bw: 14, bh: 50, lax: -16, lay: 14, law: 16, lah: 20, rax: 14, ray: 20, raw: 16, rah: 16 },
  { bw: 14, bh: 58, lax: -18, lay: 10, law: 18, lah: 24, rax: 14, ray: 16, raw: 18, rah: 20 },
  { bw: 26, bh: 50, lax: -16, lay: 14, law: 16, lah: 20, rax: 26, ray: 20, raw: 16, rah: 16 },
]

function drawCactus(ctx: CanvasRenderingContext2D, obs: Obstacle, col: string) {
  ctx.fillStyle = col
  const v = CACTUS_VARIANTS[obs.variant % CACTUS_VARIANTS.length]
  const x = px(obs.x); const y = px(obs.y)
  ctx.fillRect(x, y, v.bw, v.bh)
  ctx.fillRect(x + v.lax, y + v.lay, v.law, v.lah)
  ctx.fillRect(x + v.lax, y + v.lay, v.law + 4, 6)
  ctx.fillRect(x + v.rax, y + v.ray, v.raw, v.rah)
  ctx.fillRect(x + v.rax - 4, y + v.ray, v.raw + 4, 6)
  ctx.fillRect(x - 2, y + v.bh, v.bw + 4, 4)
}

function drawCactusGroup(ctx: CanvasRenderingContext2D, obs: Obstacle, col: string) {
  drawCactus(ctx, obs, col)
  if (obs.variant >= 3) drawCactus(ctx, { ...obs, x: obs.x + 20, variant: (obs.variant + 1) % 3 }, col)
  if (obs.variant >= 6) drawCactus(ctx, { ...obs, x: obs.x + 40, variant: (obs.variant + 2) % 3 }, col)
}

function drawPtero(ctx: CanvasRenderingContext2D, obs: Obstacle, t: { main: string; eye: string; pupil: string }) {
  ctx.fillStyle = t.main
  const x = px(obs.x); const y = px(obs.y)
  ctx.fillRect(x + 8, y + 8, 30, 12)
  ctx.fillRect(x + 34, y + 4, 14, 10)
  ctx.fillRect(x + 48, y + 6, 8, 4)
  ctx.fillStyle = t.eye
  ctx.fillRect(x + 40, y + 5, 4, 4)
  ctx.fillStyle = t.pupil
  ctx.fillRect(x + 41, y + 6, 2, 2)
  ctx.fillStyle = t.main
  ctx.fillRect(x, y + 10, 10, 6)
  ctx.fillRect(x - 4, y + 12, 6, 4)
  if (obs.frame === 0) {
    ctx.fillRect(x + 4, y, 28, 8)
    ctx.fillRect(x + 8, y - 6, 16, 6)
  } else {
    ctx.fillRect(x + 4, y + 20, 28, 8)
    ctx.fillRect(x + 8, y + 28, 16, 6)
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud, col: string) {
  ctx.fillStyle = col
  const x = px(cloud.x); const y = px(cloud.y); const w = cloud.w
  ctx.fillRect(x, y + 8, w, 8)
  ctx.fillRect(x + 4, y + 4, w - 16, 4)
  ctx.fillRect(x + 8, y, w - 24, 4)
  ctx.fillRect(x + 4, y + 12, 8, 4)
  ctx.fillRect(x + w - 12, y + 12, 8, 4)
}

function drawGround(ctx: CanvasRenderingContext2D, bumps: GroundBump[], t: { main: string; bump: string }) {
  ctx.fillStyle = t.main
  ctx.fillRect(0, GROUND_Y, W, 2)
  ctx.fillStyle = t.bump
  for (const b of bumps) ctx.fillRect(px(b.x), GROUND_Y + 4, b.w, b.y)
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], alpha: number) {
  if (alpha <= 0) return
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#535353'
  for (const s of stars) ctx.fillRect(px(s.x), px(s.y), s.size, s.size)
  ctx.globalAlpha = 1
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  score: number, hiScore: number, flash: boolean,
  t: { hi: string; score: string },
) {
  if (flash) return
  const cx = W / 2
  const topY = Math.round(H * 0.065 + H * 0.04)

  ctx.textAlign = 'center'
  ctx.font = '33px Galmuri11'
  ctx.fillStyle = t.hi
  ctx.fillText('최고 점수', cx, topY)
  ctx.font = 'bold 45px Galmuri11'
  ctx.fillStyle = t.hi
  ctx.fillText(String(Math.floor(hiScore)).padStart(5, '0'), cx, topY + 51)

  ctx.font = '33px Galmuri11'
  ctx.fillStyle = t.score
  ctx.fillText('현재 점수', cx, topY + 114)
  ctx.font = 'bold 60px Galmuri11'
  ctx.fillStyle = t.score
  ctx.fillText(String(Math.floor(score)).padStart(5, '0'), cx, topY + 180)
}

// ─── Collision ────────────────────────────────────────────────────────────────
function getDinoBox(dino: Dino) {
  if (dino.ducking) return { x: dino.x + 4, y: dino.y + 20, w: 38, h: 30 }
  return { x: dino.x + 8, y: dino.y + 2, w: 36, h: 46 }
}
function getObsBox(obs: Obstacle) {
  if (obs.type === 'ptero') return { x: obs.x + 6, y: obs.y + 4, w: 44, h: 16 }
  const v = CACTUS_VARIANTS[obs.variant % CACTUS_VARIANTS.length]
  return { x: obs.x + 2, y: obs.y + 4, w: v.bw - 2, h: v.bh - 4 }
}
function collides(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.random() * (max - min) + min }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)) }

function makeObstacle(score: number): Obstacle {
  // 점수 구간별 새 등장 확률
  const pteroChance = score > 500 ? 0.35 : score > 300 ? 0.25 : score > 150 ? 0.15 : 0
  const isPtero = Math.random() < pteroChance
  if (isPtero) {
    const heights = [GROUND_Y - 80, GROUND_Y - 50, GROUND_Y - 100]
    return { type: 'ptero', x: W + 20, y: heights[randInt(0, 2)], w: 56, h: 36, variant: 0, frame: 0, frameTick: 0 }
  }
  // 점수 구간별 선인장 종류 제한
  const maxVariant = score > 500 ? 8 : score > 300 ? 5 : score > 150 ? 5 : 2
  const variant = randInt(0, maxVariant)
  const v = CACTUS_VARIANTS[variant % CACTUS_VARIANTS.length]
  return { type: 'cactus', x: W + 20, y: GROUND_Y - v.bh - 2,
    w: variant >= 6 ? 54 : variant >= 3 ? 34 : v.bw, h: v.bh, variant, frame: 0, frameTick: 0 }
}
function makeGroundBumps(): GroundBump[] {
  return Array.from({ length: 25 }, () => ({ x: rand(0, W * 2), y: randInt(1, 3), w: randInt(2, 8) }))
}
function makeClouds(): Cloud[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: rand(i * 100, i * 100 + 100), y: rand(GROUND_Y * 0.05, GROUND_Y * 0.65), w: randInt(50, 90),
  }))
}
function makeStars(): Star[] {
  return Array.from({ length: 20 }, () => ({
    x: rand(0, W), y: rand(10, GROUND_Y * 0.75), size: Math.random() < 0.4 ? 2 : 1,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const rafRef = useRef<number>(0)
  const keysRef = useRef({ duck: false, jumpPressed: false })
  const jumpHeldRef = useRef(false)
  const jumpHoldFramesRef = useRef(0)

  const [isGameOver, setIsGameOver] = useState(false)
  const [currentScore, setCurrentScore] = useState(0)
  const [nightFactor, setNightFactor] = useState(0)

  const platformRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const gameIdRef = useRef<string | null>(null)
  const gameHistoryIdRef = useRef<number | null>(null)

  const setIsGameOverRef = useRef(setIsGameOver)
  const setCurrentScoreRef = useRef(setCurrentScore)
  const [tutorialPhase, setTutorialPhase] = useState<TutorialPhase>('none')

  const setNightFactorRef = useRef(setNightFactor)
  const setTutorialPhaseRef = useRef(setTutorialPhase)
  setIsGameOverRef.current = setIsGameOver
  setCurrentScoreRef.current = setCurrentScore
  setNightFactorRef.current = setNightFactor
  setTutorialPhaseRef.current = setTutorialPhase

  const initState = useCallback((): GameState => {
    const prev = stateRef.current
    return {
      dino: { x: 60, y: GROUND_Y - 50, vy: 0, onGround: true, ducking: false, frame: 0, frameTick: 0, dead: false },
      obstacles: [], clouds: makeClouds(), stars: makeStars(), ground: makeGroundBumps(),
      speed: INITIAL_SPEED, score: 0, hiScore: prev?.hiScore ?? 0,
      scoreTick: 0, running: false, started: false, gameOver: false,
      nightFactor: 0, nightPhase: 'day', nightTimer: DAY_HOLD_FRAMES,
      lastObstacleX: W, userId: prev?.userId ?? null,
      flashScore: false, flashTick: 0, nextObstacleDist: rand(0, 50),
      tutorialPhase: 'none', tutorialTimer: 0,
    }
  }, [])

  const doJump = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    jumpHeldRef.current = true
    jumpHoldFramesRef.current = 0
    const tp = s.tutorialPhase
    if (tp !== 'none' && tp !== 'done') {
      if (tp === 'obstacle' || tp === 'jumping') {
        if (s.dino.onGround && !s.dino.ducking) {
          s.dino.vy = JUMP_VY
          s.dino.onGround = false
        }
        if (tp === 'obstacle') {
          s.tutorialPhase = 'jumping'
          setTutorialPhaseRef.current('jumping')
        }
      }
      return
    }
    if (s.gameOver) {
      setIsGameOverRef.current(false)
      const next = initState()
      next.running = true
      next.started = true
      stateRef.current = next
      if (platformRef.current === 'cocoya' && userIdRef.current && gameIdRef.current) {
        gameHistoryIdRef.current = null
        startGame(userIdRef.current, gameIdRef.current).then(r => {
          if (r) gameHistoryIdRef.current = r.gameHistoryId
        })
      }
      return
    }
    if (!s.started) {
      s.running = true; s.started = true
      if (platformRef.current === 'cocoya' && userIdRef.current && gameIdRef.current) {
        gameHistoryIdRef.current = null
        startGame(userIdRef.current, gameIdRef.current).then(r => {
          if (r) gameHistoryIdRef.current = r.gameHistoryId
        })
      }
      return
    }
    if (s.dino.onGround && !s.dino.ducking) {
      s.dino.vy = JUMP_VY
      s.dino.onGround = false
    }
  }, [initState])

  const jumpEnd = useCallback(() => {
    jumpHeldRef.current = false
  }, [])

  const duckStart = useCallback(() => {
    const s = stateRef.current
    if (s) {
      const tp = s.tutorialPhase
      if (tp === 'ptero') {
        s.dino.ducking = true
        s.tutorialPhase = 'ducking'
        setTutorialPhaseRef.current('ducking')
      } else if (tp !== 'none' && tp !== 'done' && tp !== 'ducking') {
        return
      }
    }
    keysRef.current.duck = true
  }, [])
  const duckEnd   = useCallback(() => { keysRef.current.duck = false }, [])

  const handleTutorialNext = useCallback(() => {
    const s = stateRef.current
    if (!s || s.tutorialPhase !== 'intro') return
    s.tutorialPhase = 'scrolling'
    s.tutorialTimer = 120
    setTutorialPhaseRef.current('scrolling')
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isJump = e.code === 'Space' || e.code === 'ArrowUp'
      const isDuck = e.code === 'ArrowDown'
      if (e.type === 'keydown') {
        if (isJump && !keysRef.current.jumpPressed) { keysRef.current.jumpPressed = true; doJump() }
        if (isDuck) duckStart()
      } else {
        if (isJump) { keysRef.current.jumpPressed = false; jumpHeldRef.current = false }
        if (isDuck) keysRef.current.duck = false
      }
      if (isJump || isDuck) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey) }
  }, [doJump, duckStart])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'GAME_INIT' && typeof e.data.payload?.userId === 'string') {
        if (stateRef.current) stateRef.current.userId = e.data.payload.userId
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false

    function bootstrap() {
      if (cancelled) return
      const gameArea = canvas!.parentElement!
      const cssW = gameArea.clientWidth
      const cssH = gameArea.clientHeight
      const dpr = window.devicePixelRatio || 1
      H = Math.round(W * cssH / cssW)
      GROUND_Y = Math.round(H * 0.45)
      canvas!.width = Math.round(cssW * dpr)
      canvas!.height = Math.round(cssH * dpr)
      const ctx = canvas!.getContext('2d')!
      ctx.scale(canvas!.width / W, canvas!.height / H)
      stateRef.current = initState()

      const params = new URLSearchParams(window.location.search)
      const platform = params.get('platform')
      platformRef.current = platform
      userIdRef.current = params.get('user-id')
      gameIdRef.current = params.get('game-id')
      if (platform === 'cocoya') listenTokenRefresh()

      if (platform === 'cocoya' && !localStorage.getItem('dino_tutorial_done')) {
        stateRef.current!.tutorialPhase = 'intro'
        setTutorialPhaseRef.current('intro')
      }

      let lastNightNotify = -1

    function updateTutorial(s: GameState) {
      const tp = s.tutorialPhase
      if (tp === 'none' || tp === 'done' || tp === 'intro') return

      if (++s.dino.frameTick > 6) { s.dino.frameTick = 0; s.dino.frame = s.dino.frame === 0 ? 1 : 0 }

      for (const b of s.ground) {
        b.x -= TUTORIAL_SPEED
        if (b.x + b.w < 0) { b.x = W + rand(0, 40); b.w = randInt(2, 8); b.y = randInt(1, 3) }
      }
      for (const c of s.clouds) {
        c.x -= TUTORIAL_SPEED * 0.15
        if (c.x + c.w < 0) { c.x = W + rand(0, 80); c.y = rand(GROUND_Y * 0.05, GROUND_Y * 0.65); c.w = randInt(50, 90) }
      }

      if (!s.dino.onGround) {
        if (jumpHeldRef.current && s.dino.vy < 0 && jumpHoldFramesRef.current < MAX_JUMP_HOLD_FRAMES) {
          s.dino.vy += JUMP_HOLD_GRAVITY
          jumpHoldFramesRef.current++
        } else {
          s.dino.vy += GRAVITY
        }
        s.dino.y += s.dino.vy
        if (s.dino.y >= GROUND_Y - 50) { s.dino.y = GROUND_Y - 50; s.dino.vy = 0; s.dino.onGround = true }
      }

      if (tp === 'scrolling') {
        s.tutorialTimer--
        if (s.tutorialTimer <= 0) {
          const v = CACTUS_VARIANTS[0]
          s.obstacles = [{
            type: 'cactus', x: W + 20, y: GROUND_Y - v.bh - 2,
            w: v.bw, h: v.bh, variant: 0, frame: 0, frameTick: 0
          }]
          s.tutorialPhase = 'obstacle'
          setTutorialPhaseRef.current('obstacle')
        }
      } else if (tp === 'obstacle') {
        for (const obs of s.obstacles) obs.x -= TUTORIAL_SPEED
        if (s.obstacles.length > 0 && s.obstacles[0].x < -100) {
          const v = CACTUS_VARIANTS[0]
          s.obstacles[0].x = W + 20
          s.obstacles[0].y = GROUND_Y - v.bh - 2
        }
      } else if (tp === 'jumping') {
        for (const obs of s.obstacles) obs.x -= TUTORIAL_SPEED
        if (s.obstacles.length > 0 && collides(getDinoBox(s.dino), getObsBox(s.obstacles[0]))) {
          // 충돌 → 공룡 착지 + 장애물 재생성, obstacle 단계로 되돌림
          s.dino.y = GROUND_Y - 50; s.dino.vy = 0; s.dino.onGround = true
          const v = CACTUS_VARIANTS[0]
          s.obstacles[0].x = W + 20
          s.obstacles[0].y = GROUND_Y - v.bh - 2
          s.tutorialPhase = 'obstacle'
          setTutorialPhaseRef.current('obstacle')
        } else if (s.obstacles.length > 0 && s.obstacles[0].x + s.obstacles[0].w < s.dino.x) {
          s.tutorialPhase = 'success'
          s.tutorialTimer = 120
          s.obstacles = []
          setTutorialPhaseRef.current('success')
        } else if (s.obstacles.length > 0 && s.obstacles[0].x < -100) {
          const v = CACTUS_VARIANTS[0]
          s.obstacles[0].x = W + 20
          s.obstacles[0].y = GROUND_Y - v.bh - 2
          s.tutorialPhase = 'obstacle'
          setTutorialPhaseRef.current('obstacle')
        }
      } else if (tp === 'success') {
        s.tutorialTimer--
        if (s.tutorialTimer <= 0) {
          s.tutorialPhase = 'scrolling2'
          s.tutorialTimer = 120
          setTutorialPhaseRef.current('scrolling2')
        }
      } else if (tp === 'scrolling2') {
        s.tutorialTimer--
        if (s.tutorialTimer <= 0) {
          s.obstacles = [{
            type: 'ptero', x: W + 20, y: GROUND_Y - 50,
            w: 56, h: 36, variant: 0, frame: 0, frameTick: 0
          }]
          s.tutorialPhase = 'ptero'
          setTutorialPhaseRef.current('ptero')
        }
      } else if (tp === 'ptero') {
        for (const obs of s.obstacles) {
          obs.x -= TUTORIAL_SPEED
          if (++obs.frameTick > 8) { obs.frameTick = 0; obs.frame = obs.frame === 0 ? 1 : 0 }
        }
        if (s.obstacles.length > 0 && s.obstacles[0].x < -100) {
          s.obstacles[0].x = W + 20
          s.obstacles[0].y = GROUND_Y - 50
        }
      } else if (tp === 'ducking') {
        s.dino.ducking = keysRef.current.duck
        for (const obs of s.obstacles) {
          obs.x -= TUTORIAL_SPEED
          if (++obs.frameTick > 8) { obs.frameTick = 0; obs.frame = obs.frame === 0 ? 1 : 0 }
        }
        if (s.obstacles.length > 0) {
          const obs = s.obstacles[0]
          if (collides(getDinoBox(s.dino), getObsBox(obs))) {
            s.dino.ducking = false
            keysRef.current.duck = false
            obs.x = W + 20
            obs.y = GROUND_Y - 50
            s.tutorialPhase = 'ptero'
            setTutorialPhaseRef.current('ptero')
          } else if (obs.x + obs.w < s.dino.x) {
            s.dino.ducking = false
            keysRef.current.duck = false
            s.tutorialPhase = 'duckSuccess'
            s.tutorialTimer = 120
            s.obstacles = []
            setTutorialPhaseRef.current('duckSuccess')
          }
        }
      } else if (tp === 'duckSuccess') {
        s.tutorialTimer--
        if (s.tutorialTimer <= 0) {
          s.tutorialPhase = 'ready'
          s.tutorialTimer = 120
          setTutorialPhaseRef.current('ready')
        }
      } else if (tp === 'ready') {
        s.tutorialTimer--
        if (s.tutorialTimer <= 0) {
          localStorage.setItem('dino_tutorial_done', '1')
          s.tutorialPhase = 'done'
          s.obstacles = []
          s.dino = { x: 60, y: GROUND_Y - 50, vy: 0, onGround: true, ducking: false, frame: 0, frameTick: 0, dead: false }
          s.running = true
          s.started = true
          s.speed = INITIAL_SPEED
          s.score = 0
          setTutorialPhaseRef.current('done')
          if (platformRef.current === 'cocoya' && userIdRef.current && gameIdRef.current) {
            gameHistoryIdRef.current = null
            startGame(userIdRef.current, gameIdRef.current).then(r => {
              if (r) gameHistoryIdRef.current = r.gameHistoryId
            })
          }
        }
      }
    }

    function update(s: GameState) {
      if (s.tutorialPhase !== 'none' && s.tutorialPhase !== 'done') {
        updateTutorial(s)
        return
      }
      if (!s.running) return
      s.speed = Math.min(MAX_SPEED, 3.5 + Math.log2(1 + s.score / 50))
      s.scoreTick += s.speed * SCORE_INCREMENT
      s.score += s.scoreTick * 0.016
      s.scoreTick *= 0.98

      if (Math.floor(s.score) % 100 === 0 && Math.floor(s.score) > 0 && !s.flashScore) {
        s.flashScore = true; s.flashTick = 30
      }
      if (s.flashTick > 0 && (--s.flashTick === 0)) s.flashScore = false

      // 낮밤 phase 기반 전환
      s.nightTimer--
      if (s.nightTimer <= 0) {
        if (s.nightPhase === 'day')      { s.nightPhase = 'toNight'; s.nightTimer = NIGHT_FADE_FRAMES }
        else if (s.nightPhase === 'toNight') { s.nightPhase = 'night'; s.nightTimer = NIGHT_HOLD_FRAMES }
        else if (s.nightPhase === 'night')   { s.nightPhase = 'toDay'; s.nightTimer = NIGHT_FADE_FRAMES }
        else                                 { s.nightPhase = 'day';   s.nightTimer = DAY_HOLD_FRAMES }
      }
      if (s.nightPhase === 'toNight')     s.nightFactor = 1 - s.nightTimer / NIGHT_FADE_FRAMES
      else if (s.nightPhase === 'toDay')  s.nightFactor = s.nightTimer / NIGHT_FADE_FRAMES
      else if (s.nightPhase === 'night')  s.nightFactor = 1
      else                                s.nightFactor = 0

      const rounded = Math.round(s.nightFactor * 20) / 20
      if (rounded !== lastNightNotify) {
        lastNightNotify = rounded
        setNightFactorRef.current(s.nightFactor)
      }

      const { dino } = s
      dino.ducking = keysRef.current.duck && dino.onGround
      if (!dino.onGround) {
        if (jumpHeldRef.current && dino.vy < 0 && jumpHoldFramesRef.current < MAX_JUMP_HOLD_FRAMES) {
          dino.vy += JUMP_HOLD_GRAVITY
          jumpHoldFramesRef.current++
        } else {
          dino.vy += GRAVITY
        }
        dino.y += dino.vy
        if (dino.y >= GROUND_Y - 50) { dino.y = GROUND_Y - 50; dino.vy = 0; dino.onGround = true }
      }
      if (++dino.frameTick > 6) { dino.frameTick = 0; dino.frame = dino.frame === 0 ? 1 : 0 }

      s.lastObstacleX -= s.speed
      if (s.lastObstacleX < s.nextObstacleDist) {
        s.obstacles.push(makeObstacle(s.score))
        s.lastObstacleX = W + 20
        const minDist = Math.min(200, s.score * 0.25)
        const maxDist = Math.min(300, 80 + s.score * 0.3)
        s.nextObstacleDist = rand(minDist, maxDist)
      }

      for (const obs of s.obstacles) {
        obs.x -= s.speed
        if (obs.type === 'ptero' && ++obs.frameTick > 8) {
          obs.frameTick = 0; obs.frame = obs.frame === 0 ? 1 : 0
        }
        if (!dino.dead && collides(getDinoBox(dino), getObsBox(obs))) {
          dino.dead = true; s.running = false; s.gameOver = true
          if (s.score > s.hiScore) s.hiScore = s.score
          const finalScore = Math.floor(s.score)
          const payload = { type: 'GAME_SCORE', payload: { score: finalScore } }
          window.parent.postMessage(payload, '*')
          if (platformRef.current === 'cocoya' && userIdRef.current && gameIdRef.current && gameHistoryIdRef.current != null) {
            finishGame(userIdRef.current, gameIdRef.current, finalScore, gameHistoryIdRef.current)
          }
          setIsGameOverRef.current(true)
          setCurrentScoreRef.current(s.score)
          setNightFactorRef.current(s.nightFactor)
        }
      }
      s.obstacles = s.obstacles.filter(o => o.x > -100)

      for (const c of s.clouds) {
        c.x -= s.speed * 0.15
        if (c.x + c.w < 0) { c.x = W + rand(0, 80); c.y = rand(GROUND_Y * 0.05, GROUND_Y * 0.65); c.w = randInt(50, 90) }
      }
      for (const b of s.ground) {
        b.x -= s.speed
        if (b.x + b.w < 0) { b.x = W + rand(0, 40); b.w = randInt(2, 8); b.y = randInt(1, 3) }
      }
    }

    function render(s: GameState) {
      const th = theme(s.nightFactor)
      const dino3 = { main: th.main, eye: th.eye, pupil: th.pupil }
      ctx.fillStyle = th.bg
      ctx.fillRect(0, 0, W, H)

      drawStars(ctx, s.stars, th.starA)
      drawGround(ctx, s.ground, { main: th.main, bump: th.bump })
      for (const c of s.clouds) drawCloud(ctx, c, th.cloud)
      for (const obs of s.obstacles) {
        if (obs.type === 'cactus') drawCactusGroup(ctx, obs, th.main)
        else drawPtero(ctx, obs, dino3)
      }
      if (s.dino.dead) drawDeadDino(ctx, s.dino, dino3)
      else drawDino(ctx, s.dino, dino3)

      const inTutorial = s.tutorialPhase !== 'none' && s.tutorialPhase !== 'done'
      if (!s.gameOver && !inTutorial) {
        drawScore(ctx, s.score, s.hiScore, s.flashScore && s.flashTick % 8 < 4, { hi: th.hi, score: th.score })
      }

      if (!s.started && !inTutorial) {
        ctx.fillStyle = th.hint
        ctx.font = '42px Galmuri11'
        ctx.textAlign = 'center'
        ctx.fillText('↑ 버튼으로 시작', W / 2, GROUND_Y - 70)
      }
    }

    const FIXED_DT = 1000 / 60  // 60fps 기준 고정 timestep
    let lastTime = 0
    let accumulator = 0

    function loop(now: number) {
      if (lastTime === 0) lastTime = now
      const elapsed = Math.min(now - lastTime, 200) // 200ms cap (탭 전환 등 방지)
      lastTime = now
      accumulator += elapsed

      const s = stateRef.current!
      while (accumulator >= FIXED_DT) {
        update(s)
        accumulator -= FIXED_DT
      }
      render(s)
      rafRef.current = requestAnimationFrame(loop)
    }
      rafRef.current = requestAnimationFrame(loop)
    } // end bootstrap

    if (document.readyState === 'complete') {
      bootstrap()
    } else {
      window.addEventListener('load', bootstrap)
    }
    return () => {
      cancelled = true
      window.removeEventListener('load', bootstrap)
      cancelAnimationFrame(rafRef.current)
    }
  }, [initState])

  const scoreStr = String(Math.floor(currentScore)).padStart(5, '0')
  const th = theme(nightFactor)
  const inTutorial = tutorialPhase !== 'none' && tutorialPhase !== 'done'

  return (
    <div className="game-wrapper">
      <div className="game-area">
        <canvas ref={canvasRef} className="game-canvas" />

        {isGameOver && (
          <div className="gameover-overlay">
            <div className="gameover-title" style={{ color: th.score }}>게임 오버</div>
            <div className="gameover-score">
              {scoreStr.split('').map((ch, i) => (
                <span key={i} className="score-digit" style={{ color: th.score }}>{ch}</span>
              ))}
            </div>
            <button
              className="btn-restart"
              onPointerDown={doJump}
              onContextMenu={e => e.preventDefault()}
              style={{ background: th.score, color: th.bg }}
            >
              <RotateCcw size={52} strokeWidth={2.5} />
            </button>
          </div>
        )}

        {tutorialPhase === 'intro' && (
          <div className="tutorial-overlay tutorial-overlay-bg">
            <div className="tutorial-step">
              <div className="tutorial-title">공룡 점프</div>
              <div className="tutorial-message">장애물을 점프로 피해보세요!</div>
              <button className="tutorial-next-btn" onPointerDown={handleTutorialNext} onContextMenu={e => e.preventDefault()}>시작!</button>
            </div>
          </div>
        )}

        {tutorialPhase === 'obstacle' && (
          <div className="tutorial-overlay tutorial-overlay-top">
            <div className="tutorial-step">
              <div className="tutorial-message">앗! 장애물이다!<br/>점프 버튼을 눌러보세요!</div>
            </div>
          </div>
        )}

        {tutorialPhase === 'success' && (
          <div className="tutorial-overlay tutorial-overlay-top">
            <div className="tutorial-step">
              <div className="tutorial-emoji">🎉</div>
              <div className="tutorial-message">와, 장애물을 넘었어요!</div>
            </div>
          </div>
        )}

        {tutorialPhase === 'ptero' && (
          <div className="tutorial-overlay tutorial-overlay-top">
            <div className="tutorial-step">
              <div className="tutorial-message">새가 날아와요!<br/>엎드려볼까요?</div>
            </div>
          </div>
        )}

        {tutorialPhase === 'duckSuccess' && (
          <div className="tutorial-overlay tutorial-overlay-top">
            <div className="tutorial-step">
              <div className="tutorial-emoji">🎉</div>
              <div className="tutorial-message">잘했어요!</div>
            </div>
          </div>
        )}

        {tutorialPhase === 'ready' && (
          <div className="tutorial-overlay">
            <div className="tutorial-step">
              <div className="tutorial-go">자 그럼 시작!</div>
            </div>
          </div>
        )}

      </div>

      <div className="controls">
        <div style={{ position: 'relative' }}>
          {(tutorialPhase === 'obstacle' || tutorialPhase === 'jumping') && (
            <div className="tutorial-finger-btn">👇</div>
          )}
          <button
            className={`btn-jump${tutorialPhase === 'obstacle' || tutorialPhase === 'jumping' ? ' btn-jump-pulse' : ''}${tutorialPhase === 'ptero' ? ' btn-disabled' : ''}`}
            onPointerDown={doJump} onPointerUp={jumpEnd}
            onPointerLeave={jumpEnd} onPointerCancel={jumpEnd}
            onContextMenu={e => e.preventDefault()}
          >
            <ArrowUp size={80} strokeWidth={2.5} />
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          {tutorialPhase === 'ptero' && (
            <div className="tutorial-finger-btn">👇</div>
          )}

          <button
            className={`btn-duck${inTutorial && tutorialPhase !== 'ptero' && tutorialPhase !== 'ducking' ? ' btn-disabled' : ''}${tutorialPhase === 'ptero' ? ' btn-duck-pulse' : ''}`}
            onPointerDown={duckStart} onPointerUp={duckEnd}
            onPointerLeave={duckEnd} onPointerCancel={duckEnd}
            onContextMenu={e => e.preventDefault()}
          >
            <ArrowDown size={80} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  )
}
