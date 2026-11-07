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
