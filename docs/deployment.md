# Clock 部署交接（2026-11-05）

- Cloudflare 帳戶：Starry `starry.phd@gmail.com`，Worker 名稱：`clock`。
- 網址：`https://clock.starry.phd`；備用 `https://clock.starry-phd.workers.dev`。
- 2026-11-05 05:25:20 UTC 上傳 Worker v1.1.1，deployment id `aeec2af1-d0d3-4dda-96bd-a2ebb236ad20`；worker version id `ae2044ee-ffa7-45d4-9e14-9acc5230daab`，100% 分流。
- 運行資源：Worker + 自訂網域；不使用 D1、R2、KV 或金流；廣告 OFF。
- 來源：`web-preview/index.html`、`sw.js`、`manifest.webmanifest`、`icon.svg`。用 `python tools/build_worker.py` 生成 `web-preview/cloudflare-worker.mjs`，此檔已部署至 Cloudflare。
- 變更前測試：`node --test packages/clock-core/test/clock.test.mjs`、`node --test test/worker-smoke.mjs`、`python test/web-e2e.py`。
- 本機模擬 Worker 請求的成功不代表外部 HTTPS 實測；仍應以實際手機開啟 `https://clock.starry.phd` 測試倒數與聲音（瀏覽器要求先點擊啟用音效）。
- 中央 Starry ID `starry-phd/id` 僅以 GET 方式讀取 `https://id.starry.phd/v1/apps/clock/config`，未註冊時 API 回 404；中央程式碼與設定均未修改。
- GitHub 新私有 Repo 尚未建立。若管理者新增 Repo，維持名稱 `clock`、private，不搬動 `starry-phd/id`，再推送本原始碼及配置 branch protections；CI 中有 core + worker smoke + TypeScript 檢查。
- App Store 與 Google Play 尚無建置／簽名／上架證據。
- 回退：Cloudflare Worker Versions 可選舊版本 `29756c9a-b34b-497a-bd60-df21478ad829` 並重新部署。不得操作 `starry-id` 或其 D1。

## 2026-11-08｜Web/PWA 2026-11-07.14 正式部署紀錄（當日先 staging）

- 來源：PR #15 `fix/clock-battery-central-contract-20261107`，GitHub Actions [#42389656359](https://github.com/starry-phd/clock/actions/runs/42389656359)，全部三項成功。由 CI 產生原始 Web Worker，Source SHA-256 `92b9d6de257ad298305f658f9ff8361907d10a857c8104eb0c99efdac65752d0`，`node --check` 通過；官方 Starry ID 2026-11-07.14 Web SDK 同源打包，PWA Cache 為 `clock-web-v1-14-web-sso`。
- **staging 已部署**：Cloudflare `clock-staging`，部署 ID `a80144a0-7ede-4395-b189-fec2288f50d0`，版本 `c61afbd6-ec38-4034-9db5-d7652b1d9fdb`；原 Service Binding `CLOCK_API→clock-api-staging` 保留。
- **正式網站已部署**：Cloudflare `clock`，部署 ID `a96dcd43-d6f8-4b74-a2bb-8ed30e388a35`，版本 `cee680aa-4a08-4511-8774-29d4d8858814`；Cloudflare Domain 綁定 `clock.starry.phd→clock`，原 `CLOCK_API→clock-api` 與 `STARRY_BATTERY_KEY` Secret **名稱與類型均保留**（未讀取／改寫金鑰值）。
- **回滾備用**：上一版正式 `clock` 的部署 ID `5e0a37d2-1fdd-40c3-b708-07655e9d4b84`、版本 `43263ffe-9772-42b6-bc85-e407d01688e7`。若站點出問題，於 Cloudflare Worker Versions 中切回此版本，保留目前綁定／Secrets。
- **範圍限定**：本次只部署 Web Worker。**沒有**部署 `clock-api-staging`／`clock-api` 新版、沒有更新正式 D1、沒有啟用 Battery 收費、沒有修改 Starry ID、沒有建立／送審 Expo Android/iOS。正式 API Worker 的 `BATTERY_CHARGES_ENABLED=false` 維持；新 Web 免費用途雲端同步遇到舊 API 不支援時回退本機模式（不扣量），完整跨裝置同步仍待後端驗收後部署。
- **驗證範圍**：GitHub 完整 CI／Worker 模擬 HTTP 測試全綠，Cloudflare 上傳成功、正式 Worker deployment 及 DNS Domain 綁定可查。外部網頁抓取工具無法讀取 `clock.starry.phd` 或 staging 的 HTTP 回應，**因此未完成實際瀏覽器登入／Web SSO／計時音效的端到端驗收**。請人工用瀏覽器實測；若不正常立即回滾。
- 本次版本的正式 GitHub `main` **尚未合併**，PR #15 仍為 Draft，內含待驗收的 Clock API/Expo 更新；不要因為 Web 已部署就自動合併尚未驗收的後端／原生功能。

### 正式網站 HTTP 驗收補充（2026-11-08）

- GitHub Actions [#42390191572](https://github.com/starry-phd/clock/actions/runs/42390191572) **全部三項成功**。已將過時的 `test/staging-http-smoke.mjs` 改為 v14 Web 版本的真實 HTTP 煙霧測試，不依賴已移除的舊 `starry_relay`／`source_sha` 健康欄位。
- CI 在實際公開網路呼叫 staging `https://clock-staging.starry-phd.workers.dev` 及正式 `https://clock.starry.phd`：兩站 HTTP 200，`/api/health`、HTML、官方 `/starry-client.js`、Passkey/SSO 按鈕與 SDK 方法、CSP、`/sw.js`、`/auth/done`、同源 `/api/clock/v1/pricing` 均通過；匿名取得會員用途回 401；正式 Battery `available=false`；中央登記 active。
- 日誌標記：`CLOCK_STAGING_V14_HTTP_PASS` 與 `CLOCK_PRODUCTION_V14_HTTP_PASS`；**正式與 staging 的 HTML、CSP、Service Worker、官方 SDK 全部逐字一致**。
- 以上是真實網站 HTTP 驗收，**仍未進行會員的 Google/Apple/Passkey 實際登入或跨網站 SSO 的真人端到端驗收**。正式 API Worker 尚未更新，前三組免費雲端歸戶依舊暫回退本機。

## 2026-11-08｜正式更新 Clock Web v2026-11-08.3

- 使用已合併到 `main` 的 PR #15（squash commit `a5b00e9c34634adead6c30d79c365285770f1f6e`）的**同一份**已通過完整 CI 的公開網站程式，產生 Clock Worker JS；檔案 SHA-256：`7f04ff77646e28a0ab6aafe9ca894723b00cb49e3979668d4757a96ad654cf83`。
- **先 staging**：Cloudflare `clock-staging`，版本 `1311bc7e-ead1-49dd-8abf-c2fbb3f54d03`，部署 `0b016d68-7745-40e2-9ee9-53c9764b9e7c`，仍使用 `CLOCK_API→clock-api-staging`。GitHub Actions [#42427911915](https://github.com/starry-phd/clock/actions/runs/42427911915) 實際 HTTP 驗證 staging v2026-11-08.3（頁面、`shown_name`、頭像／會員編號介面、SW、官方 SDK、CSP、註冊 active、匿名 401、Battery `available=false`）與當時未切換的正式 v14 均通過。
- **後 production**：Cloudflare `clock`，版本 `4fe836bd-988d-4bb2-8ef2-5ca02c95a96d`，部署 `17ea8fc5-e173-40f7-ba40-3571b83d095c`，相同 Worker SHA，網址 `https://clock.starry.phd`。確認 `CLOCK_API→clock-api` 和既有 `STARRY_BATTERY_KEY` Secret **均保留**；`clock-api` 的 `BATTERY_CHARGES_ENABLED=false` **維持**，沒有啟用扣量。
- **快速回復備案**：正式站上一版版本 ID `cee680aa-4a08-4511-8774-29d4d8858814`（部署 ID `a96dcd43-d6f8-4b74-a2bb-8ed30e388a35`）；如 v2026-11-08.3 出現線上問題，回到 Cloudflare Worker `clock` 的 Versions / Deployments 選擇上一版；不要修改 Secret、D1 或 API 的扣量設定。
- **範圍**：只更新 Web/PWA Worker，不更新 `clock-api-staging`／`clock-api`、Clock 正式 D1、Starry ID、Expo Android／iOS 安裝版，也不進行商店送審。新 Web 免費前三組雲端同步若遇到未升級的舊 API，維持本機安全回退。實際會員 Passkey／Google／Apple 登入及跨網站 SSO 仍需授權會員實測，HTTP 通過不等於真人登入成功。
- **此次 release PR**：[#16](https://github.com/starry-phd/clock/pull/16)。經 CI 驗證及發布前提後，保留公開 HTTP smoke test 的最終 v2026-11-08.3 版本；一次性的公開 Worker 傳輸步驟已在 PR 合併前移除，正式 CI 不再記錄 bundle 編碼。
