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

export function listenTokenRefresh() {
  const bridge = window.SeniorBridge
  if (!bridge) return
  bridge.onTokenRefreshed = (payload) => {
    if (payload?.token && window.SeniorContext) {
      window.SeniorContext.token = payload.token
    }
  }
}

function getToken(): string | null {
  return window.SeniorContext?.token || (import.meta.env.VITE_DEV_TOKEN as string) || null
}

async function refreshToken(): Promise<string | null> {
  const bridge = window.SeniorBridge
  if (!bridge) return null
  try {
    const res = await bridge.request<{ token: string }>('AUTH.REFRESH_TOKEN', {})
    if (res.success && res.data?.token) {
      if (window.SeniorContext) window.SeniorContext.token = res.data.token
      return res.data.token
    }
  } catch { /* silent */ }
  return null
}

async function fetchWithAuth(
  url: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const token = getToken()
  if (!token) return null

  const doFetch = (t: string) =>
    fetch(url, {
      ...init,
      headers: { ...init.headers as Record<string, string>, 'Authorization': `Bearer ${t}` },
    })

  const res = await doFetch(token)
  if (res.status === 401) {
    const newToken = await refreshToken()
    if (newToken) return doFetch(newToken)
  }
  return res
}

export interface PlayResponse {
  gameHistoryId: number
}

export async function startGame(userId: string, gameId: string): Promise<PlayResponse | null> {
  if (!BASE_URL) return null
  try {
    const res = await fetchWithAuth(`${BASE_URL}/api/v1/users/${userId}/games/${gameId}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res || !res.ok) return null
    return await res.json() as PlayResponse
  } catch {
    return null
  }
}

export async function finishGame(
  userId: string,
  gameId: string,
  score: number,
  gameHistoryId: number,
): Promise<boolean> {
  if (!BASE_URL) return false
  try {
    const res = await fetchWithAuth(`${BASE_URL}/api/v1/users/${userId}/games/${gameId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, gameHistoryId }),
    })
    return res?.ok ?? false
  } catch {
    return false
  }
}
