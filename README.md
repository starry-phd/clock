# Clock｜Starry 超大字倒數計時器 + 時鐘

專案代號統一為 **`clock`**；生態系 `starry`，中央 App ID `clock`，原生 Bundle ID / Package 為 `phd.starry.clock`。

## 已部署的網頁入口（PWA v1.1.1）

- 主網址：<https://clock.starry.phd>
- 備用 Worker 網址：<https://clock.starry-phd.workers.dev>
- Cloudflare 帳戶：Starry 專屬帳戶（非 H-Global）
- Worker：`clock`
- `clock.starry.phd` 已綁定 Cloudflare Worker `clock`；`workers.dev` 已啟用。
- 2026-11-05 Cloudflare API 回報 Worker 最新版本 `ae2044ee-ffa7-45d4-9e14-9acc5230daab` 100% 部署，並且網域路由啟用。**由於執行環境不能直接進行外部 HTTPS 瀏覽，尚未完成從使用者裝置的實際存取驗收。**
- 目前實際部署版本為**完整獨立 PWA Worker v1.1.1**，提供大字倒數、即時時鐘、用途預設、增修用途、可自訂提醒秒數與音效、全螢幕、暫停／繼續／重設，以及只讀會員 App 註冊狀態查詢。已加入可安裝的 Manifest、Service Worker 首次載入後離線快取、設定表單及不支援原生全螢幕時的退出按鈕。瀏覽器使用者需互動後才可啟用聲音，背景、鎖屏等情況音效可能延遲。

## 原始碼結構

```text
clock/
├─ apps/clock/                         # React Native + Expo Router + TypeScript 原生 App
├─ packages/clock-core/                # 無網路依賴的倒數計時純函式及單元測試
├─ packages/auth-client-contract/      # Starry ID 既有 HTTPS API 的唯讀介面
├─ web-preview/                        # 加強版 PWA 靜態原始碼和可選 Worker 原型
├─ .github/workflows/validate.yml      # 待建立 GitHub repo 後才會啟動的 CI
└─ docs/                               # 串接、驗收與部署證據
```

**注意：** `web-preview/cloudflare-worker.mjs` 是執行 `python tools/build_worker.py` 才產生的部署檔，已從 Git 追蹤移除，以避免上傳過期 Bundle。`web-preview/index.html` 是原始 UI。雖已取得 Cloudflare 部署與路由證據，但由於當前環境限制，尚未由外部裝置完成 HTTPS 實際載入驗收。

## 功能

- 大字顯示 `分:秒`，支援手機直式、橫式及全螢幕。
- 一鍵切換即時時鐘（`時:分:秒`）。
- 每個用途獨立設定名稱與分秒，預設：休息時間 5 分鐘、開場致詞 3 分鐘、主題分享 20 分鐘；最多 50 組。
- 提前 0–120 秒自訂提醒，時間歸零時再響鈴；可靜音。
- 暫停／繼續／重設、進度條、離線可用，預設保存在本機。
- 使用系統牆上時鐘計算剩餘時間，避免前景畫面被系統延遲而累積過大的倒數誤差；**不保證背景、鎖屏及強制結束後精準響鈴**。

## 原生開發

符合技術方向：Expo SDK 58 / RN 0.88 / React 19.3、Expo Router、TypeScript strict、React Native StyleSheet。原始碼基座並**未執行原生編譯**，實際版本相容仍待依當期 Expo 官方 SDK 以 EAS / 實機驗證，不能將上述規格視為已建置通過。

若有可用 Node、pnpm、npm registry 和 Apple / Google 開發者權限，可依序：

```sh
corepack enable
pnpm install
pnpm test:clock
pnpm typecheck
pnpm --dir apps/clock start
# 需要原生編譯、開發者簽章與正式驗收時：
cd apps/clock
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform ios --profile preview
```

本交付環境無法存取 npm registry、無法執行 EAS 真正的 iOS/Android Build、未取得商店發布紀錄。因此沒有 APK、AAB、IPA 或已上架商店連結。

## Starry ID 串接狀態與不可變更界線

- 中央服務 URL `https://id.starry.phd`；正式 OpenAPI 位於 `starry-phd/id/openapi/starry-id.v1.json`。
- Clock 使用現有 `GET /v1/apps/clock/config` 作 App 登記狀態查詢；會員顯示使用 `GET /v1/me`（**必須有 Clock 官方登入取得的合法、未過期 Bearer Token 才能呼叫**）。
- Clock 已由業主在 Admin Lite 登記，PR #1 GitHub CI 驗證 GET /v1/apps/clock/config 為 active；無須修改 Starry ID config/apps.json。原生 App 已加入 Starry 中繼登入的新程式碼，但原生 IPA 尚須重新建置才能使用 clock:// 回傳。
- 不存取／改動中央會員的 Auth、Session、D1、R2 或任何程式碼；沒有複製會員資料；不使用中央私密金鑰。離線倒數不需登入、不中斷。
- 後續 Clock 取得 Starry ID 正式登記的唯一方式，是由會員領域 Owner 審核既有 Registry 的設定變更；此工作**尚未執行且與「完全不改中央會員程式碼」的限制相衝突**。不可繞過授權或偽造 Token。

## GitHub 與發布狀態

`starry-phd/clock` 已於 2026-11-05 建立為 **Public（公開）** 儲存庫，並由開發者的 Mac 首次推送 `main`。GitHub 檔案內容已確認可讀取；CI 執行結果尚待驗證。中央會員 `starry-phd/id` 與其他 Repo 未因建庫作業而修改。

開案方向：新消費型 App 應採與中央會員獨立的 Starry 公開 Monorepo（可納入 `apps/clock`），只在既有授權能力內部署；不提早安裝 Google AdMob Mediation SDK（Ads OFF）；本 App 不設 Billing、Battery、D1、R2 或新付費資源。

詳見 `docs/acceptance.md`。

## v1.1 驗證

```sh
node --test packages/clock-core/test/clock.test.mjs
node --test test/worker-smoke.mjs
python test/web-e2e.py  # 需本機已安裝 Playwright 與 Chromium
```

2026-11-05 確認 4 項計時核心單元測試、2 項 Worker 靜態/安全測試及瀏覽器離線 DOM 模擬通過；`Clock` 在 Cloudflare 部署分流 100%，並已綁定 `clock.starry.phd`。這些證據不等於 App Store/Google Play 已上架或 Starry ID OAuth 已完成。詳見 `docs/acceptance.md`。


## 2026-11-05｜GitHub／Expo 上架準備補充（未發布）

此版本新增商店圖示、EAS 正式／測試建置設定、僅手動觸發的 GitHub EAS 工作流程、Google Play 文字與隱私草稿、Mac `gh` 建庫腳本與發版清單。
**GitHub `starry-phd/clock` 已建立並首次推送；Expo projectId 未初始化，Android APK/AAB 未建置，Play Console `Clock` App 尚未建立或提交。**

依 `docs/release-checklist.zh-TW.md` 操作。不得把本機測試／套件配置寫成 Google Play 上架完成。

## 2026-11-05｜GitHub Public 政策

Clock 儲存庫為 `https://github.com/starry-phd/clock`，所有新 GitHub 專案依使用者要求預設 Public；只有經使用者另行指定時才改為 Private。不得將密碼、API Token、簽章憑證、Service Account JSON 或個人資料提交至公開 Repo。根目錄 `package.json` 的 `private: true` 只是防止發佈至 npm registry，與 GitHub Repo 的 Public/Private 權限**無關**。

## Starry ID 中繼整合（PR #1）

網頁與原生 App 已加入 Starry ID 浏览器中繼方案；請參閱 [完整串接與驗收文件](docs/starry-id-integration.zh-TW.md)。GitHub 合併不代表 Cloudflare 正式網頁或 App Store 中既有 IPA 已更新。App 含新版 scheme clock，必須經過新版 EAS 建置、實機登入驗證與業主核准才可送審或正式發布。
