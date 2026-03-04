import { useEffect, useRef, useCallback } from 'react'

// ─── Constants ───────────────────────────────────────────────────────────────
const W = 800
const H = 300
const GROUND_Y = 250
const GRAVITY = 0.6
const JUMP_VY = -13
const INITIAL_SPEED = 6
const MAX_SPEED = 14
const SPEED_INCREMENT = 0.0008
const SCORE_INCREMENT = 0.025
const NIGHT_THRESHOLD = 700

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
function drawRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillRect(Math.round(x), Math.round(y), w, h)
}

// Dino body — faithful pixel art recreation
function drawDino(ctx: CanvasRenderingContext2D, dino: Dino, dark: boolean) {
  const x = Math.round(dino.x)
  const y = Math.round(dino.y)
  const color = dark ? '#ccc' : '#535353'
  ctx.fillStyle = color

  if (dino.ducking) {
    // Ducking dino
    const dy = y + 16
    // Body
    drawRect(ctx, x, dy, 44, 16)
    // Neck / head
    drawRect(ctx, x + 32, dy - 8, 12, 8)
    // Head bump
    drawRect(ctx, x + 36, dy - 12, 8, 4)
    // Eye
    ctx.fillStyle = dark ? '#222' : '#fff'
    drawRect(ctx, x + 40, dy - 10, 3, 3)
    ctx.fillStyle = dark ? '#fff' : '#535353'
    drawRect(ctx, x + 41, dy - 9, 2, 2)
    ctx.fillStyle = color
    // Mouth
    drawRect(ctx, x + 44, dy - 6, 2, 2)
    // Legs
    const legFrame = dino.frame
    if (legFrame === 0) {
      drawRect(ctx, x + 4, dy + 16, 8, 8)
      drawRect(ctx, x + 20, dy + 16, 8, 4)
    } else {
      drawRect(ctx, x + 4, dy + 16, 8, 4)
      drawRect(ctx, x + 20, dy + 16, 8, 8)
    }
    // Tail
    drawRect(ctx, x, dy + 4, 4, 8)
    drawRect(ctx, x - 4, dy + 6, 4, 6)
  } else {
    // Standing/jumping dino
    // Tail
    drawRect(ctx, x, y + 24, 4, 10)
    drawRect(ctx, x - 4, y + 28, 4, 8)
    // Body
    drawRect(ctx, x, y + 12, 44, 24)
    // Underbody cut
    ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
    drawRect(ctx, x + 4, y + 28, 12, 8)
    ctx.fillStyle = color
    // Neck
    drawRect(ctx, x + 32, y + 4, 12, 16)
    // Head
    drawRect(ctx, x + 24, y, 20, 16)
    // Mouth
    drawRect(ctx, x + 44, y + 8, 4, 2)
    // Eye white
    ctx.fillStyle = dark ? '#555' : '#f7f7f7'
    drawRect(ctx, x + 38, y + 2, 6, 6)
    // Eye pupil
    ctx.fillStyle = dark ? '#222' : '#535353'
    drawRect(ctx, x + 40, y + 3, 3, 3)
    ctx.fillStyle = color
    // Arm
    drawRect(ctx, x + 28, y + 20, 8, 4)
    // Legs
    if (!dino.onGround) {
      // Jumping — legs spread
      drawRect(ctx, x + 8, y + 36, 10, 8)
      drawRect(ctx, x + 26, y + 36, 10, 4)
    } else {
      const legFrame = dino.frame
      if (legFrame === 0) {
        drawRect(ctx, x + 8, y + 36, 10, 14)
        drawRect(ctx, x + 26, y + 36, 10, 6)
      } else {
        drawRect(ctx, x + 8, y + 36, 10, 6)
        drawRect(ctx, x + 26, y + 36, 10, 14)
      }
    }
  }
}

// Dead dino (X eyes)
function drawDeadDino(ctx: CanvasRenderingContext2D, dino: Dino, dark: boolean) {
  drawDino(ctx, { ...dino, frame: 0, ducking: false }, dark)
  const x = Math.round(dino.x)
  const y = Math.round(dino.y)
  // X eyes
  ctx.fillStyle = dark ? '#222' : '#535353'
  // X left stroke
  for (let i = 0; i < 5; i++) {
    drawRect(ctx, x + 38 + i, y + 2 + i, 2, 2)
    drawRect(ctx, x + 42 - i, y + 2 + i, 2, 2)
  }
  // Erase eye
  ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
  drawRect(ctx, x + 38, y + 2, 6, 6)
  ctx.fillStyle = dark ? '#222' : '#535353'
  drawRect(ctx, x + 38, y + 2, 2, 2)
  drawRect(ctx, x + 42, y + 2, 2, 2)
  drawRect(ctx, x + 38, y + 6, 2, 2)
  drawRect(ctx, x + 42, y + 6, 2, 2)
  drawRect(ctx, x + 40, y + 4, 2, 2)
}

// Cactus variants
const CACTUS_VARIANTS = [
  // [bodyW, bodyH, leftArmY, leftArmH, rightArmY, rightArmH, topW]
  { bw: 14, bh: 50, lax: -16, lay: 14, law: 16, lah: 20, rax: 14, ray: 20, raw: 16, rah: 16 },
  { bw: 14, bh: 58, lax: -18, lay: 10, law: 18, lah: 24, rax: 14, ray: 16, raw: 18, rah: 20 },
  { bw: 26, bh: 50, lax: -16, lay: 14, law: 16, lah: 20, rax: 26, ray: 20, raw: 16, rah: 16 },
]

function drawCactus(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  const color = dark ? '#ccc' : '#535353'
  ctx.fillStyle = color
  const v = CACTUS_VARIANTS[obs.variant % CACTUS_VARIANTS.length]
  const x = Math.round(obs.x)
  const y = Math.round(obs.y)

  // Main stem
  drawRect(ctx, x, y, v.bw, v.bh)
  // Left arm
  drawRect(ctx, x + v.lax, y + v.lay, v.law, v.lah)
  drawRect(ctx, x + v.lax, y + v.lay, v.law + 4, 6) // top cap
  // Right arm
  drawRect(ctx, x + v.rax, y + v.ray, v.raw, v.rah)
  drawRect(ctx, x + v.rax - 4, y + v.ray, v.raw + 4, 6) // top cap
  // Base
  drawRect(ctx, x - 2, y + v.bh, v.bw + 4, 4)
}

// Double/triple cactus
function drawCactusGroup(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  drawCactus(ctx, obs, dark)
  if (obs.variant >= 3) {
    // Two cacti side by side
    drawCactus(ctx, { ...obs, x: obs.x + 20, variant: (obs.variant + 1) % 3 }, dark)
  }
  if (obs.variant >= 6) {
    drawCactus(ctx, { ...obs, x: obs.x + 40, variant: (obs.variant + 2) % 3 }, dark)
  }
}

// Pterodactyl
function drawPtero(ctx: CanvasRenderingContext2D, obs: Obstacle, dark: boolean) {
  const color = dark ? '#ccc' : '#535353'
  ctx.fillStyle = color
  const x = Math.round(obs.x)
  const y = Math.round(obs.y)
  const wingUp = obs.frame === 0

  // Body
  drawRect(ctx, x + 8, y + 8, 30, 12)
  // Head
  drawRect(ctx, x + 34, y + 4, 14, 10)
  // Beak
  drawRect(ctx, x + 48, y + 6, 8, 4)
  // Eye
  ctx.fillStyle = dark ? '#1a1a1a' : '#f7f7f7'
  drawRect(ctx, x + 40, y + 5, 4, 4)
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  drawRect(ctx, x + 41, y + 6, 2, 2)
  ctx.fillStyle = color
  // Tail
  drawRect(ctx, x, y + 10, 10, 6)
  drawRect(ctx, x - 4, y + 12, 6, 4)

  if (wingUp) {
    // Wings up
    drawRect(ctx, x + 4, y, 28, 8)
    drawRect(ctx, x + 8, y - 6, 16, 6)
  } else {
    // Wings down
    drawRect(ctx, x + 4, y + 20, 28, 8)
    drawRect(ctx, x + 8, y + 28, 16, 6)
  }
}

function drawCloud(ctx: CanvasRenderingContext2D, cloud: Cloud, dark: boolean) {
  ctx.fillStyle = dark ? '#555' : '#ccc'
  const x = Math.round(cloud.x)
  const y = Math.round(cloud.y)
  const w = cloud.w

  drawRect(ctx, x, y + 8, w, 8)
  drawRect(ctx, x + 4, y + 4, w - 16, 4)
  drawRect(ctx, x + 8, y, w - 24, 4)
  drawRect(ctx, x + 4, y + 12, 8, 4)
  drawRect(ctx, x + w - 12, y + 12, 8, 4)
}

function drawGround(ctx: CanvasRenderingContext2D, bumps: GroundBump[], dark: boolean) {
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  drawRect(ctx, 0, GROUND_Y, W, 2)
  ctx.fillStyle = dark ? '#777' : '#aaa'
  for (const b of bumps) {
    drawRect(ctx, Math.round(b.x), GROUND_Y + 4, b.w, b.y)
  }
}

function drawStars(ctx: CanvasRenderingContext2D, stars: Star[], alpha: number) {
  ctx.fillStyle = `rgba(83,83,83,${alpha})`
  for (const s of stars) {
    drawRect(ctx, Math.round(s.x), Math.round(s.y), s.size, s.size)
  }
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  score: number,
  hiScore: number,
  flash: boolean,
  dark: boolean,
) {
  ctx.fillStyle = dark ? '#ccc' : '#535353'
  ctx.font = 'bold 16px monospace'
  ctx.textAlign = 'right'

  if (!flash) {
    const scoreStr = 'HI ' + String(Math.floor(hiScore)).padStart(5, '0')
    ctx.fillText(scoreStr, W - 100, 30)
    const curStr = String(Math.floor(score)).padStart(5, '0')
    ctx.fillText(curStr, W - 10, 30)
  }
  // flash shows nothing (blank blink effect)
}

// ─── Collision detection ──────────────────────────────────────────────────────
function getDinoBox(dino: Dino) {
  if (dino.ducking) {
    return { x: dino.x + 4, y: dino.y + 16, w: 42, h: 22 }
  }
  return { x: dino.x + 4, y: dino.y + 2, w: 38, h: 46 }
}

function getObsBox(obs: Obstacle) {
  if (obs.type === 'ptero') {
    return { x: obs.x + 6, y: obs.y + 4, w: 44, h: 16 }
  }
  // cactus
  const v = CACTUS_VARIANTS[obs.variant % CACTUS_VARIANTS.length]
  return { x: obs.x + 2, y: obs.y + 4, w: v.bw - 2, h: v.bh - 4 }
}

function collides(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

// ─── Random helpers ───────────────────────────────────────────────────────────
function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1))
}

function makeObstacle(score: number, speed: number): Obstacle {
  const canPtero = score > 300
  const isPtero = canPtero && Math.random() < 0.35

  if (isPtero) {
    const heights = [GROUND_Y - 80, GROUND_Y - 50, GROUND_Y - 100]
    return {
      type: 'ptero',
      x: W + 20,
      y: heights[randInt(0, 2)],
      w: 56,
      h: 36,
      variant: 0,
      frame: 0,
      frameTick: 0,
    }
  }

  const variant = randInt(0, score > 500 ? 8 : 5)
  const v = CACTUS_VARIANTS[variant % CACTUS_VARIANTS.length]
  return {
    type: 'cactus',
    x: W + 20,
    y: GROUND_Y - v.bh - 2,
    w: variant >= 6 ? 54 : variant >= 3 ? 34 : v.bw,
    h: v.bh,
    variant,
    frame: 0,
    frameTick: 0,
  }
}

function makeGroundBumps(): GroundBump[] {
  const bumps: GroundBump[] = []
  for (let i = 0; i < 40; i++) {
    bumps.push({
      x: rand(0, W * 2),
      y: randInt(1, 3),
      w: randInt(2, 8),
    })
  }
  return bumps
}

function makeClouds(): Cloud[] {
  return Array.from({ length: 5 }, (_, i) => ({
    x: rand(i * 160, i * 160 + 160),
    y: rand(40, 120),
    w: randInt(60, 100),
  }))
}

function makeStars(): Star[] {
  return Array.from({ length: 20 }, () => ({
    x: rand(0, W),
    y: rand(10, 160),
    size: Math.random() < 0.4 ? 2 : 1,
  }))
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<GameState | null>(null)
  const rafRef = useRef<number>(0)
  const keysRef = useRef({ jump: false, duck: false, jumpPressed: false })

  const initState = useCallback((): GameState => {
    const prev = stateRef.current
    return {
      dino: {
        x: 60,
        y: GROUND_Y - 50,
        vy: 0,
        onGround: true,
        ducking: false,
        frame: 0,
        frameTick: 0,
        dead: false,
      },
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
      nextObstacleDist: rand(300, 500),
    }
  }, [])

  // Input handlers
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current
      if (!s) return
      const isJump = e.code === 'Space' || e.code === 'ArrowUp'
      const isDuck = e.code === 'ArrowDown'

      if (e.type === 'keydown') {
        if (isJump) {
          keysRef.current.jump = true
          if (!keysRef.current.jumpPressed) {
            keysRef.current.jumpPressed = true
            handleJump(s)
          }
        }
        if (isDuck) keysRef.current.duck = true
      } else {
        if (isJump) {
          keysRef.current.jump = false
          keysRef.current.jumpPressed = false
        }
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
  }, [])

  // Touch support
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const s = stateRef.current
      if (!s) return
      handleJump(s)
      e.preventDefault()
    }
    window.addEventListener('touchstart', onTouch, { passive: false })
    return () => window.removeEventListener('touchstart', onTouch)
  }, [])

  // postMessage listener
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'GAME_INIT' && typeof e.data.userId === 'string') {
        if (stateRef.current) {
          stateRef.current.userId = e.data.userId
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function handleJump(s: GameState) {
    if (s.gameOver) {
      // Restart
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
  }

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    stateRef.current = initState()

    function update(s: GameState) {
      if (!s.running) return

      s.speed = Math.min(MAX_SPEED, s.speed + SPEED_INCREMENT)
      s.scoreTick += s.speed * SCORE_INCREMENT
      s.score += s.scoreTick * 0.016
      s.scoreTick *= 0.98

      // Score flash every 100 pts
      if (Math.floor(s.score) % 100 === 0 && Math.floor(s.score) > 0) {
        if (!s.flashScore) {
          s.flashScore = true
          s.flashTick = 30
        }
      }
      if (s.flashTick > 0) {
        s.flashTick--
        if (s.flashTick === 0) s.flashScore = false
      }

      // Night cycle
      s.nightProgress += 0.0005 * s.speed
      const nightCycle = (Math.sin(s.nightProgress) + 1) / 2
      s.night = nightCycle > 0.5

      const { dino } = s
      const keys = keysRef.current

      // Duck
      if (keys.duck && dino.onGround) {
        dino.ducking = true
      } else {
        dino.ducking = false
      }

      // Physics
      if (!dino.onGround) {
        dino.vy += GRAVITY
        dino.y += dino.vy
        if (dino.y >= GROUND_Y - 50) {
          dino.y = GROUND_Y - 50
          dino.vy = 0
          dino.onGround = true
        }
      }

      // Dino animation
      dino.frameTick++
      if (dino.frameTick > 6) {
        dino.frameTick = 0
        dino.frame = dino.frame === 0 ? 1 : 0
      }

      // Obstacles
      s.lastObstacleX -= s.speed
      if (s.lastObstacleX < s.nextObstacleDist) {
        s.obstacles.push(makeObstacle(s.score, s.speed))
        s.lastObstacleX = W + 20
        s.nextObstacleDist = rand(250, 600)
      }

      for (const obs of s.obstacles) {
        obs.x -= s.speed
        // Ptero wing animation
        if (obs.type === 'ptero') {
          obs.frameTick++
          if (obs.frameTick > 8) {
            obs.frameTick = 0
            obs.frame = obs.frame === 0 ? 1 : 0
          }
        }
        // Collision
        if (!dino.dead) {
          const db = getDinoBox(dino)
          const ob = getObsBox(obs)
          if (collides(db, ob)) {
            dino.dead = true
            s.running = false
            s.gameOver = true
            if (s.score > s.hiScore) s.hiScore = s.score
            // postMessage score to parent
            window.parent.postMessage({ type: 'GAME_SCORE', score: Math.floor(s.score) }, '*')
          }
        }
      }
      s.obstacles = s.obstacles.filter((o) => o.x > -100)

      // Clouds
      for (const c of s.clouds) {
        c.x -= s.speed * 0.15
        if (c.x + c.w < 0) {
          c.x = W + rand(0, 100)
          c.y = rand(40, 120)
          c.w = randInt(60, 100)
        }
      }

      // Ground bumps
      for (const b of s.ground) {
        b.x -= s.speed
        if (b.x + b.w < 0) {
          b.x = W + rand(0, 50)
          b.w = randInt(2, 8)
          b.y = randInt(1, 3)
        }
      }
    }

    function render(s: GameState) {
      const bg = s.night ? '#1a1a1a' : '#f7f7f7'
      const dark = s.night

      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)

      // Stars (night)
      if (s.night) {
        drawStars(ctx, s.stars, 1)
      }

      drawGround(ctx, s.ground, dark)

      for (const cloud of s.clouds) {
        drawCloud(ctx, cloud, dark)
      }

      for (const obs of s.obstacles) {
        if (obs.type === 'cactus') drawCactusGroup(ctx, obs, dark)
        else drawPtero(ctx, obs, dark)
      }

      if (s.dino.dead) {
        drawDeadDino(ctx, s.dino, dark)
      } else {
        drawDino(ctx, s.dino, dark)
      }

      drawScore(ctx, s.score, s.hiScore, s.flashScore && s.flashTick % 8 < 4, dark)

      // Game Over overlay
      if (s.gameOver) {
        ctx.fillStyle = dark ? '#ccc' : '#535353'
        ctx.font = 'bold 20px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('G A M E  O V E R', W / 2, H / 2 - 20)

        // Restart icon (triangle replay)
        const rx = W / 2
        const ry = H / 2 + 10
        ctx.strokeStyle = dark ? '#ccc' : '#535353'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(rx, ry + 14, 16, 0.3, Math.PI * 2 - 0.3)
        ctx.stroke()
        ctx.fillStyle = dark ? '#ccc' : '#535353'
        // Arrow head
        ctx.beginPath()
        ctx.moveTo(rx + 14, ry)
        ctx.lineTo(rx + 20, ry + 6)
        ctx.lineTo(rx + 8, ry + 8)
        ctx.closePath()
        ctx.fill()
      }

      // Start screen
      if (!s.started && !s.gameOver) {
        ctx.fillStyle = dark ? '#ccc' : '#535353'
        ctx.font = '14px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Press  SPACE  or  ↑  to start', W / 2, H / 2 + 60)
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
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{
        display: 'block',
        margin: '0 auto',
        cursor: 'pointer',
        imageRendering: 'pixelated',
      }}
      onClick={() => {
        const s = stateRef.current
        if (!s) return
        handleJumpExternal(s)
      }}
    />
  )

  function handleJumpExternal(s: GameState) {
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
  }
}
