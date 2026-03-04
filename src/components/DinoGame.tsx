import { useEffect, useRef, useCallback, useState } from 'react'

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
  const color = dark ? '#ccc' : '#535353'
  const bg = dark ? '#1a1a1a' : '#f7f7f7'
  ctx.fillStyle = color

  if (dino.ducking) {
    const dy = y + 16
    ctx.fillRect(x, dy, 44, 16)
    ctx.fillRect(x + 32, dy - 8, 12, 8)
    ctx.fillRect(x + 36, dy - 12, 8, 4)
    ctx.fillStyle = bg
    ctx.fillRect(x + 38, dy - 10, 4, 4)
    ctx.fillStyle = dark ? '#333' : '#535353'
    ctx.fillRect(x + 40, dy - 9, 2, 2)
    ctx.fillStyle = color
    ctx.fillRect(x + 44, dy - 6, 2, 2)
    const lf = dino.frame
    if (lf === 0) {
      ctx.fillRect(x + 4, dy + 16, 8, 8)
      ctx.fillRect(x + 20, dy + 16, 8, 4)
    } else {
      ctx.fillRect(x + 4, dy + 16, 8, 4)
      ctx.fillRect(x + 20, dy + 16, 8, 8)
    }
    ctx.fillRect(x, dy + 4, 4, 8)
    ctx.fillRect(x - 4, dy + 6, 4, 6)
    return
  }

  // Tail
  ctx.fillRect(x, y + 24, 4, 10)
  ctx.fillRect(x - 4, y + 28, 4, 8)
  // Body
  ctx.fillRect(x, y + 12, 44, 24)
  // Underbody cut
  ctx.fillStyle = bg
  ctx.fillRect(x + 4, y + 28, 12, 8)
  ctx.fillStyle = color
  // Neck + head
  ctx.fillRect(x + 32, y + 4, 12, 16)
  ctx.fillRect(x + 24, y, 20, 16)
  // Mouth
  ctx.fillRect(x + 44, y + 8, 4, 2)
  // Eye
  ctx.fillStyle = bg
  ctx.fillRect(x + 38, y + 2, 6, 6)
  ctx.fillStyle = dark ? '#222' : '#535353'
  ctx.fillRect(x + 40, y + 3, 3, 3)
  ctx.fillStyle = color
  // Arm
  ctx.fillRect(x + 28, y + 20, 8, 4)
  // Legs
  if (!dino.onGround) {
    ctx.fillRect(x + 8, y + 36, 10, 8)
    ctx.fillRect(x + 26, y + 36, 10, 4)
  } else if (dino.frame === 0) {
    ctx.fillRect(x + 8, y + 36, 10, 14)
    ctx.fillRect(x + 26, y + 36, 10, 6)
  } else {
    ctx.fillRect(x + 8, y + 36, 10, 6)
    ctx.fillRect(x + 26, y + 36, 10, 14)
  }
}

function drawDeadDino(ctx: CanvasRenderingContext2D, dino: Dino, dark: boolean) {
  drawDino(ctx, { ...dino, frame: 0, ducking: false }, dark)
  const x = px(dino.x)
  const y = px(dino.y)
  const color = dark ? '#ccc' : '#535353'
  const bg = dark ? '#1a1a1a' : '#f7f7f7'
  // Erase eye
  ctx.fillStyle = bg
  ctx.fillRect(x + 38, y + 2, 6, 6)
  // X eyes
  ctx.fillStyle = color
  ctx.fillRect(x + 38, y + 2, 2, 2)
  ctx.fillRect(x + 42, y + 2, 2, 2)
  ctx.fillRect(x + 38, y + 6, 2, 2)
  ctx.fillRect(x + 42, y + 6, 2, 2)
  ctx.fillRect(x + 40, y + 4, 2, 2)
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
  // Eye
  ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
  ctx.fillRect(x + 40, y + 5, 4, 4)
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  ctx.fillRect(x + 41, y + 6, 2, 2)
  ctx.fillRect(x, y + 10, 10, 6)
  ctx.fillRect(x - 4, y + 12, 6, 4)
  // Wings
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

function drawScore(
  ctx: CanvasRenderingContext2D,
  score: number,
  hiScore: number,
  flash: boolean,
  dark: boolean,
) {
  if (flash) return
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  ctx.font = 'bold 18px monospace'
  ctx.textAlign = 'right'
  ctx.fillText('HI ' + String(Math.floor(hiScore)).padStart(5, '0'), W - 90, 32)
  ctx.fillText(String(Math.floor(score)).padStart(5, '0'), W - 14, 32)
}

// ─── Collision ────────────────────────────────────────────────────────────────
function getDinoBox(dino: Dino) {
  if (dino.ducking) return { x: dino.x + 4, y: dino.y + 16, w: 42, h: 22 }
  return { x: dino.x + 4, y: dino.y + 2, w: 38, h: 46 }
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
  return Array.from({ length: 4 }, (_, i) => ({
    x: rand(i * 120, i * 120 + 120), y: rand(30, 90), w: randInt(50, 90),
  }))
}

function makeStars(): Star[] {
  return Array.from({ length: 12 }, () => ({
    x: rand(0, W), y: rand(10, 220), size: Math.random() < 0.4 ? 2 : 1,
  }))
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const rafRef = useRef<number>(0)
  const keysRef = useRef({ duck: false, jumpPressed: false })

  const [logs, setLogs] = useState<LogEntry[]>([])
  // setLogs는 stable ref이므로 useRef 초기화 시점에 안전하게 캡처됨
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
    GROUND_Y = H - 70
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

      // 100점마다 점수 깜빡임
      if (Math.floor(s.score) % 100 === 0 && Math.floor(s.score) > 0 && !s.flashScore) {
        s.flashScore = true
        s.flashTick = 30
      }
      if (s.flashTick > 0 && (--s.flashTick === 0)) s.flashScore = false

      // 낮밤 전환
      s.nightProgress += 0.0005 * s.speed
      s.night = (Math.sin(s.nightProgress) + 1) / 2 > 0.5

      const { dino } = s
      dino.ducking = keysRef.current.duck && dino.onGround

      // 물리
      if (!dino.onGround) {
        dino.vy += GRAVITY
        dino.y += dino.vy
        if (dino.y >= GROUND_Y - 50) {
          dino.y = GROUND_Y - 50
          dino.vy = 0
          dino.onGround = true
        }
      }

      // 다리 애니메이션
      if (++dino.frameTick > 6) {
        dino.frameTick = 0
        dino.frame = dino.frame === 0 ? 1 : 0
      }

      // 장애물 생성
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
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x > -100)

      for (const c of s.clouds) {
        c.x -= s.speed * 0.15
        if (c.x + c.w < 0) { c.x = W + rand(0, 80); c.y = rand(30, 90); c.w = randInt(50, 90) }
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

      drawScore(ctx, s.score, s.hiScore, s.flashScore && s.flashTick % 8 < 4, dark)

      if (s.gameOver) {
        ctx.fillStyle = dark ? '#ccc' : '#535353'
        ctx.font = 'bold 18px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('G A M E  O V E R', W / 2, H / 2 - 8)
        // 재시작 아이콘
        const rx = W / 2, ry = H / 2 + 22
        ctx.strokeStyle = dark ? '#ccc' : '#535353'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(rx, ry, 14, 0.4, Math.PI * 2 - 0.4)
        ctx.stroke()
        ctx.fillStyle = dark ? '#ccc' : '#535353'
        ctx.beginPath()
        ctx.moveTo(rx + 12, ry - 8)
        ctx.lineTo(rx + 18, ry - 2)
        ctx.lineTo(rx + 6, ry - 2)
        ctx.closePath()
        ctx.fill()
      }

      if (!s.started) {
        ctx.fillStyle = dark ? '#aaa' : '#757575'
        ctx.font = '13px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('JUMP 버튼을 눌러 시작', W / 2, H - 20)
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

  return (
    <div className="game-wrapper">
      <div className="game-area">
        <canvas ref={canvasRef} className="game-canvas" />

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
      <div className="controls">
        <button
          className="btn-jump"
          onPointerDown={doJump}
          onContextMenu={(e) => e.preventDefault()}
        >
          ▲ JUMP
        </button>
        <button
          className="btn-duck"
          onPointerDown={duckStart}
          onPointerUp={duckEnd}
          onPointerLeave={duckEnd}
          onPointerCancel={duckEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          ▼ DUCK
        </button>
      </div>
    </div>
  )
}

