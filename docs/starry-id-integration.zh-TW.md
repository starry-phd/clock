# Clock / Starry ID integration acceptance

## Authoritative upstream
- Starry ID docs: https://github.com/starry-phd/id/blob/main/docs/integration-guide.md sections 1-4,7,9,10,11.2,11.3.
- OpenAPI 3.1 source: https://github.com/starry-phd/id/blob/main/openapi/starry-id.v1.json.
- Snapshot in contracts/starry-id.v1.json; pnpm codegen:starry uses openapi-typescript to generate component and path types.
- .gitleaks.toml copied from Starry ID, including the sbk_ service-key pattern. PR CI scans commits.

## Registry and callbacks
- app_id clock; iOS and Android phd.starry.clock; registered web origin https://clock.starry.phd.
- Native callbacks clock://auth/apple and clock://auth/google; Expo app scheme clock.
- Web callback https://clock.starry.phd/auth/done.
- Read GET /v1/apps/clock/config and require status active; version below min_version cannot use member functions. Offline timer remains available.

## Relay authentication
- No AppleAuthentication nor Google Sign-In native SDK.
- POST /v1/auth/nonce, hash the original nonce using SHA-256 lowercase hex, create an independent cryptographically random state.
- Navigate to https://id.starry.phd/auth/{provider}/start with registered return, app_id clock, hashed nonce and state.
- Native iOS/Android use expo-web-browser openAuthSessionAsync. Web does a full-page redirect.
- Validate the exact callback and state, remove the web hash token from URL history immediately, and exchange id_token plus raw nonce for Starry tokens.
- Apple code exchange includes authorization_code and the Starry Apple callback URL.
- Native token persistence uses expo-secure-store. Web access token is memory-only; refresh token goes in sessionStorage, never localStorage.
- Refresh is serialized; rotated refresh token overwrites the old token, including any 401 retry. REFRESH_REUSED clears credentials.
- Starry user_id is the only identity key. Never merge using name/email.

## Account lifecycle
- The Clock settings page contains Starry sign-in, consent with terms/privacy links, profile name with If-Match, link identities, logout, logout-all, deletion and undo deletion.
- Deletion warns about the seven-day withdrawal period and subscriptions.
- The central account web center handles complete avatar and other advanced profile fields; Clock does not clone the member database.
- IDENTITY_IN_USE account merging is not automatic; it must be separately reviewed and consented.
- RevenueCat is disabled, and no billing or push registration is used.

## Web Worker and release gates
- Build the PWA Worker with python3 tools/build_worker.py. Generated web-preview/cloudflare-worker.mjs is ignored and regenerated for tests/deploy.
- Generated CSP permits Starry ID HTTPS fetch, and the Worker serves the /auth/done callback with no-store cache headers.
- Clock production web relay was subsequently deployed and accepted via GitHub Actions; see PR #5.
- Existing published iOS IPA uses the previous clockstarry scheme. A NEW EAS native build is required to activate the new clock:// callbacks.
- Do not submit to App Store, Google Play or release existing production resources without owner approval.

## 繁星電池艙 Starry Battery（業主 2026-11-07 最新定義）

正式名稱：**繁星電池艙 Starry Battery**。正式定義：**會員共用的消費用量月額度**，不限 AI 任務。每位會員各有獨立月額度，同一會員在已授權 Starry Apps 共用；每月 1 日台灣時間重置，不累積，不能購買／轉讓／透支。

- 任務類型可涵蓋經核准的 AI 與非 AI 功能，不能使用 `clock.ai` 代扣非 AI 服務。計時器第 4 組起預計使用獨立任務類型 `clock.preset_create`，前 3 組免費，之後每組 X 顆，由 Owner 設定。**收費端點目前尚未啟用**。
- 只有 Clock API 後端能使用 Secret `STARRY_BATTERY_KEY`，驗證中央 Access Token、`user_id` 及 `app_id=clock`；預留 → 成功 commit，失敗／取消／逾時 release，冪等避免重扣；中央不可達時不啟動收費服務。
- Clock API 需檢查中央實際返回的 `amount` 與畫面明示的 X 一致；金鑰不得進 App／Web／Git／日誌，不修改 Starry ID 資料庫。
- 兩端同步：Expo iOS／Android 與 Web／PWA **所有新開發功能必須同 PR 更新**；詳細定義與驗收表見 [Battery v2／平台同步矩陣](battery-v2-platform-parity.md)。

### 文件版本差異（不可隱藏）

業主已更新 [DEV-A Google Doc](https://docs.google.com/document/d/1OdQREti12tzUBxZwgZ89WjUYdb-dCEnIEJ-AlpULky8/edit) 的正式 Battery 定義；當前 `starry-phd/id` GitHub `integration-guide.md` 和 OpenAPI 的**說明文字仍用「免費 AI 用量月額度」**。此處優先使用最新業主核定商業定義，但現有 REST 請求／回應必須按實際中央契約操作，若未登記非 AI 任務則一律不扣量、不冒用 AI 類型。

### 發布實際狀態（截至 2026-11-07）

Clock 網頁正式版 `clock.starry.phd` 的 Starry 登入中繼已部署並有 GitHub staging／production HTTP 驗收；Expo 原生 IPA／AAB 新版建置仍因 GitHub Actions 缺少 `EXPO_TOKEN` 而未完成，不能宣稱 App Store／Google Play 已同步上線。Battery 本次是兩端共用的**只讀餘額 UI**與開發規則更新，並未對任何會員產生消耗。
