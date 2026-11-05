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
