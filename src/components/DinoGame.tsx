import { useEffect, useRef, useCallback, useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'

interface LogEntry {
  dir: '←' | '→'
  json: string
  t: string
}

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 480
let H = 400
let GROUND_Y = 330
const GRAVITY = 0.6
const JUMP_VY = -13
const INITIAL_SPEED = 5.5
const MAX_SPEED = 13
const SPEED_INCREMENT = 0.0008
const SCORE_INCREMENT = 0.025

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dino {
  x: number
  y: number
  vy: number
  onGround: boolean
  ducking: boolean
  frame: number
  frameTick: number
  dead: boolean
}

interface Obstacle {
  type: 'cactus' | 'ptero'
  x: number
  y: number
  w: number
  h: number
  variant: number
  frame: number
  frameTick: number
}

interface Cloud {
  x: number
  y: number
  w: number
}

interface Star {
  x: number
  y: number
  size: number
}

interface GroundBump {
  x: number
  y: number
  w: number
}

interface GameState {
  dino: Dino
  obstacles: Obstacle[]
  clouds: Cloud[]
  stars: Star[]
  ground: GroundBump[]
  speed: number
  score: number
  hiScore: number
  scoreTick: number
  running: boolean
  started: boolean
  gameOver: boolean
  night: boolean
  nightProgress: number
  lastObstacleX: number
  userId: string | null
  flashScore: boolean
  flashTick: number
  nextObstacleDist: number
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function px(n: number) {
  return Math.round(n)
}

function drawDino(ctx: CanvasRenderingContext2D, dino: Dino, dark: boolean) {
  const x = px(dino.x)
  const y = px(dino.y)
  const col = dark ? '#ccc' : '#535353'
  const bg = dark ? '#1a1a1a' : '#f7f7f7'
  const pupil = dark ? '#999' : '#222'
  ctx.fillStyle = col

  if (dino.ducking) {
    const by = y + 20
    ctx.fillRect(x + 2, by, 38, 12)
    ctx.fillRect(x + 26, by - 12, 18, 14)
    ctx.fillStyle = bg
    ctx.fillRect(x + 32, by - 10, 6, 6)
    ctx.fillStyle = pupil
    ctx.fillRect(x + 34, by - 9, 3, 3)
    ctx.fillStyle = col
    if (dino.frame === 0) {
      ctx.fillRect(x + 6, by + 12, 10, 6)
      ctx.fillRect(x + 22, by + 12, 10, 4)
    } else {
      ctx.fillRect(x + 6, by + 12, 10, 4)
      ctx.fillRect(x + 22, by + 12, 10, 6)
    }
    return
  }

  ctx.fillRect(x, y + 22, 10, 8)
  ctx.fillRect(x + 8, y + 16, 34, 20)
  ctx.fillRect(x + 30, y + 8, 14, 12)
  ctx.fillRect(x + 24, y, 22, 14)
  ctx.fillStyle = bg
  ctx.fillRect(x + 34, y + 2, 7, 7)
  ctx.fillStyle = pupil
  ctx.fillRect(x + 37, y + 3, 3, 3)
  ctx.fillStyle = col
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

function drawDeadDino(ctx: CanvasRenderingContext2D, dino: Dino, dark: boolean) {
  drawDino(ctx, { ...dino, frame: 0, ducking: false }, dark)
  const x = px(dino.x)
  const y = px(dino.y)
  const col = dark ? '#ccc' : '#535353'
  const bg = dark ? '#1a1a1a' : '#f7f7f7'
  ctx.fillStyle = bg
  ctx.fillRect(x + 34, y + 2, 7, 7)
  ctx.fillStyle = col
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

function drawCactus(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  const v = CACTUS_VARIANTS[obs.variant % CACTUS_VARIANTS.length]
  const x = px(obs.x)
  const y = px(obs.y)
  ctx.fillRect(x, y, v.bw, v.bh)
  ctx.fillRect(x + v.lax, y + v.lay, v.law, v.lah)
  ctx.fillRect(x + v.lax, y + v.lay, v.law + 4, 6)
  ctx.fillRect(x + v.rax, y + v.ray, v.raw, v.rah)
  ctx.fillRect(x + v.rax - 4, y + v.ray, v.raw + 4, 6)
  ctx.fillRect(x - 2, y + v.bh, v.bw + 4, 4)
}

function drawCactusGroup(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  drawCactus(ctx, obs, dark)
  if (obs.variant >= 3) drawCactus(ctx, { ...obs, x: obs.x + 20, variant: (obs.variant + 1) % 3 }, dark)
  if (obs.variant >= 6) drawCactus(ctx, { ...obs, x: obs.x + 40, variant: (obs.variant + 2) % 3 }, dark)
}

function drawPtero(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  const x = px(obs.x)
  const y = px(obs.y)
  ctx.fillRect(x + 8, y + 8, 30, 12)
  ctx.fillRect(x + 34, y + 4, 14, 10)
  ctx.fillRect(x + 48, y + 6, 8, 4)
  ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
  ctx.fillRect(x + 40, y + 5, 4, 4)
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  ctx.fillRect(x + 41, y + 6, 2, 2)
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

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud, dark: boolean) {
  ctx.fillStyle = dark ? '#444' : '#d0d0d0'
  const x = px(cloud.x)
  const y = px(cloud.y)
  const w = cloud.w
  ctx.fillRect(x, y + 8, w, 8)
  ctx.fillRect(x + 4, y + 4, w - 16, 4)
  ctx.fillRect(x + 8, y, w - 24, 4)
  ctx.fillRect(x + 4, y + 12, 8, 4)
  ctx.fillRect(x + w - 12, y + 12, 8, 4)
}

function drawGround(ctx: CanvasRenderingContext2D, bumps: GroundBump[], dark: boolean) {
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  ctx.fillRect(0, GROUND_Y, W, 2)
  ctx.fillStyle = dark ? '#666' : '#aaa'
  for (const b of bumps) ctx.fillRect(px(b.x), GROUND_Y + 4, b.w, b.y)
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[]) {
  ctx.fillStyle = '#535353'
  for (const s of stars) ctx.fillRect(px(s.x), px(s.y), s.size, s.size)
}

// 고정폭 숫자 렌더링
function drawFixedNum(ctx: CanvasRenderingContext2D, num: number, cx: number, y: number) {
  const str = String(Math.floor(num)).padStart(5, '0')
  const cw = ctx.measureText('0').width
  const startX = cx - (cw * str.length) / 2
  for (let i = 0; i < str.length; i++) {
    ctx.fillText(str[i], startX + i * cw, y)
  }
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  score: number,
  hiScore: number,
  flash: boolean,
  dark: boolean,
) {
  if (flash) return
  const cx = W / 2
  const topY = Math.round(H * 0.065 + H * 0.04)
  const hiCol = dark ? '#777' : '#bbb'
  const mainCol = dark ? '#ccc' : '#535353'

  // 최고 점수
  ctx.font = '33px Galmuri11'
  ctx.textAlign = 'center'
  ctx.fillStyle = hiCol
  ctx.fillText('최고 점수', cx, topY)
  ctx.font = 'bold 45px Galmuri11'
  ctx.fillStyle = hiCol
  drawFixedNum(ctx, hiScore, cx, topY + 51)

  // 현재 점수
  ctx.font = '33px Galmuri11'
  ctx.textAlign = 'center'
  ctx.fillStyle = mainCol
  ctx.fillText('현재 점수', cx, topY + 114)
  ctx.font = 'bold 60px Galmuri11'
  ctx.fillStyle = mainCol
  drawFixedNum(ctx, score, cx, topY + 180)
}

// ─── Collision ────────────────────────────────────────────────────────────────
function getDinoBox(dino: Dino) {
  if (dino.ducking) return { x: dino.x + 4, y: dino.y + 18, w: 38, h: 24 }
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
  const isPtero = score > 300 && Math.random() < 0.35
  if (isPtero) {
    const heights = [GROUND_Y - 80, GROUND_Y - 50, GROUND_Y - 100]
    return { type: 'ptero', x: W + 20, y: heights[randInt(0, 2)], w: 56, h: 36, variant: 0, frame: 0, frameTick: 0 }
  }
  const variant = randInt(0, score > 500 ? 8 : 5)
  const v = CACTUS_VARIANTS[variant % CACTUS_VARIANTS.length]
  return {
    type: 'cactus',
    x: W + 20,
    y: GROUND_Y - v.bh - 2,
    w: variant >= 6 ? 54 : variant >= 3 ? 34 : v.bw,
    h: v.bh,
    variant, frame: 0, frameTick: 0,
  }
}

function makeGroundBumps(): GroundBump[] {
  return Array.from({ length: 25 }, () => ({
    x: rand(0, W * 2), y: randInt(1, 3), w: randInt(2, 8),
  }))
}

function makeClouds(): Cloud[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: rand(i * 100, i * 100 + 100),
    y: rand(GROUND_Y * 0.05, GROUND_Y * 0.65),
    w: randInt(50, 90),
  }))
}

function makeStars(): Star[] {
  return Array.from({ length: 20 }, () => ({
    x: rand(0, W),
    y: rand(10, GROUND_Y * 0.75),
    size: Math.random() < 0.4 ? 2 : 1,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const rafRef = useRef<number>(0)
  const keysRef = useRef({ duck: false, jumpPressed: false })

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isGameOver, setIsGameOver] = useState(false)
  const [currentScore, setCurrentScore] = useState(0)
  const [isDark, setIsDark] = useState(false)

  // stable refs for setters so game loop can call them
  const setIsGameOverRef = useRef(setIsGameOver)
  const setCurrentScoreRef = useRef(setCurrentScore)
  const setIsDarkRef = useRef(setIsDark)
  setIsGameOverRef.current = setIsGameOver
  setCurrentScoreRef.current = setCurrentScore
  setIsDarkRef.current = setIsDark

  const addLogRef = useRef((dir: '←' | '→', data: unknown) => {
    const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setLogs(prev => [{ dir, json: JSON.stringify(data), t }, ...prev].slice(0, 8))
  })

  const initState = useCallback((): GameState => {
    const prev = stateRef.current
    return {
      dino: { x: 60, y: GROUND_Y - 50, vy: 0, onGround: true, ducking: false, frame: 0, frameTick: 0, dead: false },
      obstacles: [],
      clouds: makeClouds(),
      stars: makeStars(),
      ground: makeGroundBumps(),
      speed: INITIAL_SPEED,
      score: 0,
      hiScore: prev?.hiScore ?? 0,
      scoreTick: 0,
      running: false,
      started: false,
      gameOver: false,
      night: false,
      nightProgress: 0,
      lastObstacleX: W,
      userId: prev?.userId ?? null,
      flashScore: false,
      flashTick: 0,
      nextObstacleDist: rand(120, 300),
    }
  }, [])

  const doJump = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (s.gameOver) {
      setIsGameOverRef.current(false)
      const next = initState()
      next.running = true
      next.started = true
      stateRef.current = next
      return
    }
    if (!s.started) {
      s.running = true
      s.started = true
      return
    }
    if (s.dino.onGround && !s.dino.ducking) {
      s.dino.vy = JUMP_VY
      s.dino.onGround = false
    }
  }, [initState])

  const duckStart = useCallback(() => { keysRef.current.duck = true }, [])
  const duckEnd = useCallback(() => { keysRef.current.duck = false }, [])

  // Keyboard (desktop 지원)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isJump = e.code === 'Space' || e.code === 'ArrowUp'
      const isDuck = e.code === 'ArrowDown'
      if (e.type === 'keydown') {
        if (isJump && !keysRef.current.jumpPressed) {
          keysRef.current.jumpPressed = true
          doJump()
        }
        if (isDuck) keysRef.current.duck = true
      } else {
        if (isJump) keysRef.current.jumpPressed = false
        if (isDuck) keysRef.current.duck = false
      }
      if (isJump || isDuck) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [doJump])

  // postMessage 연동
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      addLogRef.current('←', e.data)
      if (e.data?.type === 'GAME_INIT' && typeof e.data.payload?.userId === 'string') {
        if (stateRef.current) stateRef.current.userId = e.data.payload.userId
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // 게임 루프
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gameArea = canvas.parentElement!
    const cssW = gameArea.clientWidth
    const cssH = gameArea.clientHeight
    const dpr = window.devicePixelRatio || 1
    H = Math.round(W * cssH / cssW)
    GROUND_Y = Math.round(H * 0.45)
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    const ctx = canvas.getContext('2d')!
    ctx.scale(canvas.width / W, canvas.height / H)
    stateRef.current = initState()

    function update(s: GameState) {
      if (!s.running) return

      s.speed = Math.min(MAX_SPEED, s.speed + SPEED_INCREMENT)
      s.scoreTick += s.speed * SCORE_INCREMENT
      s.score += s.scoreTick * 0.016
      s.scoreTick *= 0.98

      if (Math.floor(s.score) % 100 === 0 && Math.floor(s.score) > 0 && !s.flashScore) {
        s.flashScore = true
        s.flashTick = 30
      }
      if (s.flashTick > 0 && (--s.flashTick === 0)) s.flashScore = false

      s.nightProgress += 0.0005 * s.speed
      s.night = (Math.sin(s.nightProgress) + 1) / 2 > 0.5
      setIsDarkRef.current(s.night)

      const { dino } = s
      dino.ducking = keysRef.current.duck && dino.onGround

      if (!dino.onGround) {
        dino.vy += GRAVITY
        dino.y += dino.vy
        if (dino.y >= GROUND_Y - 50) {
          dino.y = GROUND_Y - 50
          dino.vy = 0
          dino.onGround = true
        }
      }

      if (++dino.frameTick > 6) {
        dino.frameTick = 0
        dino.frame = dino.frame === 0 ? 1 : 0
      }

      s.lastObstacleX -= s.speed
      if (s.lastObstacleX < s.nextObstacleDist) {
        s.obstacles.push(makeObstacle(s.score))
        s.lastObstacleX = W + 20
        s.nextObstacleDist = rand(80, 260)
      }

      for (const obs of s.obstacles) {
        obs.x -= s.speed
        if (obs.type === 'ptero' && ++obs.frameTick > 8) {
          obs.frameTick = 0
          obs.frame = obs.frame === 0 ? 1 : 0
        }
        if (!dino.dead && collides(getDinoBox(dino), getObsBox(obs))) {
          dino.dead = true
          s.running = false
          s.gameOver = true
          if (s.score > s.hiScore) s.hiScore = s.score
          const payload = { type: 'GAME_SCORE', payload: { score: Math.floor(s.score) } }
          window.parent.postMessage(payload, '*')
          addLogRef.current('→', payload)
          setIsGameOverRef.current(true)
          setCurrentScoreRef.current(s.score)
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x > -100)

      for (const c of s.clouds) {
        c.x -= s.speed * 0.15
        if (c.x + c.w < 0) {
          c.x = W + rand(0, 80)
          c.y = rand(GROUND_Y * 0.05, GROUND_Y * 0.65)
          c.w = randInt(50, 90)
        }
      }
      for (const b of s.ground) {
        b.x -= s.speed
        if (b.x + b.w < 0) { b.x = W + rand(0, 40); b.w = randInt(2, 8); b.y = randInt(1, 3) }
      }
    }

    function render(s: GameState) {
      const dark = s.night
      ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
      ctx.fillRect(0, 0, W, H)

      if (dark) drawStars(ctx, s.stars)
      drawGround(ctx, s.ground, dark)
      for (const c of s.clouds) drawCloud(ctx, c, dark)
      for (const obs of s.obstacles) {
        if (obs.type === 'cactus') drawCactusGroup(ctx, obs, dark)
        else drawPtero(ctx, obs, dark)
      }

      if (s.dino.dead) drawDeadDino(ctx, s.dino, dark)
      else drawDino(ctx, s.dino, dark)

      // 게임오버 시 점수 숨김 (HTML 오버레이로 대체)
      if (!s.gameOver) {
        drawScore(ctx, s.score, s.hiScore, s.flashScore && s.flashTick % 8 < 4, dark)
      }

      if (!s.started) {
        ctx.fillStyle = dark ? '#aaa' : '#757575'
        ctx.font = '42px Galmuri11'
        ctx.textAlign = 'center'
        ctx.fillText('↑ 버튼으로 시작', W / 2, GROUND_Y - 70)
      }
    }

    function loop() {
      const s = stateRef.current!
      update(s)
      render(s)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [initState])

  const scoreStr = String(Math.floor(currentScore)).padStart(5, '0')
  const scoreCol = isDark ? '#ccc' : '#535353'
  const labelCol = isDark ? '#888' : '#999'

  return (
    <div className="game-wrapper">
      <div className="game-area">
        <canvas ref={canvasRef} className="game-canvas" />

        {/* 게임오버 HTML 오버레이 */}
        {isGameOver && (
          <div className="gameover-overlay">
            <div className="gameover-title" style={{ color: scoreCol }}>게임 오버</div>
            <div className="gameover-score" style={{ color: scoreCol }}>
              {scoreStr.split('').map((ch, i) => (
                <span key={i} className="score-digit">{ch}</span>
              ))}
            </div>
            <button
              className="btn-jump gameover-restart-btn"
              onPointerDown={doJump}
              onContextMenu={(e) => e.preventDefault()}
            >
              <ArrowUp size={80} strokeWidth={2.5} />
            </button>
            <div className="gameover-restart-label" style={{ color: labelCol }}>버튼으로 다시시작</div>
          </div>
        )}

        {/* postMessage 디버그 패널 */}
        <div className="debug-panel">
          <div className="debug-title">postMessage 디버그</div>
          {logs.length === 0 ? (
            <div className="debug-empty">이벤트 없음</div>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="debug-entry">
                <span className={log.dir === '←' ? 'debug-recv' : 'debug-send'}>
                  {log.dir} {log.dir === '←' ? '수신' : '전송'}
                </span>
                <span className="debug-time">{log.t}</span>
                <div className="debug-json">{log.json}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 버튼 — 캔버스 위 오버레이 */}
      <div className="controls">
        <button
          className="btn-jump"
          onPointerDown={doJump}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ArrowUp size={80} strokeWidth={2.5} />
        </button>
        <button
          className="btn-duck"
          onPointerDown={duckStart}
          onPointerUp={duckEnd}
          onPointerLeave={duckEnd}
          onPointerCancel={duckEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ArrowDown size={80} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  )
}
