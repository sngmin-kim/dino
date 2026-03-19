# Coconut Game Dino - Project Instructions

## cocoya 플랫폼 전용 API 호출 규칙

게임 시작/종료 API 호출은 **반드시 `platform === 'cocoya'`일 때만** 동작해야 한다.
platform은 URL 쿼리 파라미터(`?platform=cocoya`)로 전달된다.

### API 스펙
- Base URL: `VITE_API_BASE_URL` 환경변수
- 인증: `Authorization: Bearer {token}` (SeniorContext.token 또는 VITE_DEV_TOKEN)
- 게임 시작: `POST /api/v1/users/{user-id}/games/{game-id}/play` → `{ gameHistoryId: number }`
- 게임 종료: `POST /api/v1/users/{user-id}/games/{game-id}/finish` body: `{ score: number, gameHistoryId: number }` → OK
- `user-id`, `game-id`는 URL 쿼리 파라미터로 전달됨

### 인증 & 토큰 갱신
- 토큰: `window.SeniorContext.token` → `VITE_DEV_TOKEN` fallback
- 401 응답 시: `SeniorBridge.request('AUTH.REFRESH_TOKEN')` 호출 → 새 토큰으로 1회 재시도
- 공통 래퍼 `fetchWithAuth()`가 토큰 주입 + 401 갱신을 처리 (`src/api/gameApi.ts`)

### 체크리스트 (코드 수정 시 반드시 확인)
- [ ] API 호출 코드에 `platform === 'cocoya'` 가드가 있는가?
- [ ] cocoya가 아닌 환경(로컬 dev, 다른 플랫폼)에서 API가 호출되지 않는가?
- [ ] 토큰은 SeniorContext에서 가져오고, 없으면 VITE_DEV_TOKEN fallback을 사용하는가?
- [ ] 새 API 호출 추가 시 `fetchWithAuth()`를 사용하는가? (401 토큰 갱신 보장)
