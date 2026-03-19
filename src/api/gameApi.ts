import { dlog } from '../lib/debug-log'

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

interface SeniorContext {
  token: string
  userId: string
  platform: 'Android' | 'iOS'
  amplitudeSessionId?: number
  appVersion: string
  statusBarHeight: number
  gnbHeight: number
  systemGnbHeight: number
}

interface BridgeResponse<T = unknown> {
  requestId: string
  success: boolean
  data?: T
  error?: string
}

interface SeniorBridge {
  request<T>(action: string, data?: Record<string, unknown>): Promise<BridgeResponse<T>>
  onTokenRefreshed?: (payload: { token: string }) => void
}

declare global {
  interface Window {
    SeniorContext?: SeniorContext
    SeniorBridge?: SeniorBridge
  }
}

/** SeniorBridge가 주입될 때까지 폴링 (최대 3초) */
export function waitForBridge(timeout = 3000): Promise<SeniorBridge> {
  return new Promise((resolve, reject) => {
    if (window.SeniorBridge) return resolve(window.SeniorBridge)
    let elapsed = 0
    const interval = setInterval(() => {
      elapsed += 50
      if (window.SeniorBridge) {
        clearInterval(interval)
        resolve(window.SeniorBridge)
      }
    }, 50)
    setTimeout(() => {
      clearInterval(interval)
      reject(new Error('Bridge timeout'))
    }, timeout)
  })
}

/** APP.READY로 SeniorContext 수신 (0.5초 간격, 최대 5초) */
export async function requestAppReady(): Promise<SeniorContext | null> {
  let bridge: SeniorBridge | null = null
  try {
    bridge = await waitForBridge()
  } catch {
    dlog('Bridge', '브릿지 없음')
    return null
  }

  for (let i = 1; i <= 10; i++) {
    try {
      dlog('Bridge', `APP.READY 요청 ${i}/10`)
      const res = await Promise.race([
        bridge.request<SeniorContext>('APP.READY', {}),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('타임아웃')), 500),
        ),
      ])
      if (res.success && res.data?.token && res.data?.userId) {
        window.SeniorContext = res.data
        dlog('Bridge', 'APP.READY 성공', `userId=${res.data.userId} token=${res.data.token.slice(0, 12)}...`)
        return res.data
      }
      dlog('Bridge', 'APP.READY 응답 불완전', JSON.stringify(res))
    } catch {
      // 타임아웃 → 다음 재시도
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  dlog('Bridge', 'APP.READY 실패 (5초 대기 완료)')
  return null
}

export function listenTokenRefresh() {
  const bridge = window.SeniorBridge
  if (!bridge) {
    dlog('Bridge', 'onTokenRefreshed 등록 skip', 'SeniorBridge 없음')
    return
  }
  bridge.onTokenRefreshed = (payload) => {
    if (payload?.token && window.SeniorContext) {
      window.SeniorContext.token = payload.token
      dlog('Auth', 'onTokenRefreshed broadcast 수신', `token: ${payload.token.slice(0, 12)}...`)
    }
  }
  dlog('Bridge', 'onTokenRefreshed 리스너 등록')
}

function getToken(): string | null {
  return window.SeniorContext?.token || (import.meta.env.VITE_DEV_TOKEN as string) || null
}

async function refreshToken(): Promise<string | null> {
  const bridge = window.SeniorBridge
  if (!bridge) {
    dlog('Auth', 'REFRESH_TOKEN skip', 'SeniorBridge 없음')
    return null
  }
  dlog('Bridge', 'AUTH.REFRESH_TOKEN 요청')
  try {
    const res = await bridge.request<{ token: string }>('AUTH.REFRESH_TOKEN', {})
    if (res.success && res.data?.token) {
      if (window.SeniorContext) window.SeniorContext.token = res.data.token
      dlog('Auth', 'REFRESH_TOKEN 성공', `token: ${res.data.token.slice(0, 12)}...`)
      return res.data.token
    }
    dlog('Auth', 'REFRESH_TOKEN 실패', res.error || 'no token in response')
  } catch (e) {
    dlog('Auth', 'REFRESH_TOKEN 에러', String(e))
  }
  return null
}

async function fetchWithAuth(
  url: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const token = getToken()
  if (!token) {
    dlog('API', 'fetch skip', '토큰 없음')
    return null
  }

  const doFetch = (t: string) =>
    fetch(url, {
      ...init,
      headers: { ...init.headers as Record<string, string>, 'Authorization': `Bearer ${t}` },
    })

  const res = await doFetch(token)
  if (res.status === 401) {
    dlog('API', '401 응답 → 토큰 갱신 시도', url)
    const newToken = await refreshToken()
    if (newToken) {
      dlog('API', '새 토큰으로 재시도', url)
      return doFetch(newToken)
    }
    dlog('API', '토큰 갱신 실패, 재시도 불가')
  }
  return res
}

export interface PlayResponse {
  gameHistoryId: number
}

export async function startGame(userId: string, gameId: string): Promise<PlayResponse | null> {
  if (!BASE_URL) {
    dlog('API', 'startGame skip', 'BASE_URL 없음')
    return null
  }
  const url = `${BASE_URL}/api/v1/users/${userId}/games/${gameId}/play`
  dlog('API', 'POST play', `userId=${userId} gameId=${gameId}`)
  try {
    const res = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res || !res.ok) {
      dlog('API', 'startGame 실패', `status=${res?.status}`)
      return null
    }
    const data = await res.json() as PlayResponse
    dlog('API', 'startGame 성공', `gameHistoryId=${data.gameHistoryId}`)
    return data
  } catch (e) {
    dlog('API', 'startGame 에러', String(e))
    return null
  }
}

export async function finishGame(
  userId: string,
  gameId: string,
  score: number,
  gameHistoryId: number,
): Promise<boolean> {
  if (!BASE_URL) {
    dlog('API', 'finishGame skip', 'BASE_URL 없음')
    return false
  }
  const url = `${BASE_URL}/api/v1/users/${userId}/games/${gameId}/finish`
  dlog('API', 'POST finish', `score=${score} historyId=${gameHistoryId}`)
  try {
    const res = await fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, gameHistoryId }),
    })
    const ok = res?.ok ?? false
    if (!ok && res) {
      const errBody = await res.text().catch(() => '')
      dlog('API', 'finishGame 실패', `status=${res.status} body=${errBody}`)
    } else {
      dlog('API', ok ? 'finishGame 성공' : 'finishGame 실패', `status=${res?.status}`)
    }
    return ok
  } catch (e) {
    dlog('API', 'finishGame 에러', String(e))
    return false
  }
}
