# Clock v1.1.1 驗收與未完成事項（2026-11-05）

## 已有平台證據

| 項目 | 狀態 | 可核實證據 |
| --- | --- | --- |
| Clock Worker | 部署成功（平台回報） | Starry Cloudflare 帳戶 `9ff1b4c261141730ac2fe0683f730062` / script `clock`；版本 `ae2044ee-ffa7-45d4-9e14-9acc5230daab`，部署分流 100%，部署 id `aeec2af1-d0d3-4dda-96bd-a2ebb236ad20` |
| 自訂網域 | Cloudflare 配置成功 | `clock.starry.phd` -> Worker `clock`；Worker Domain id `e378cd3ff10d0721df4cfc8537b27fca788c4630`，enabled=true |
| Workers.dev | Cloudflare 配置成功 | `clock.starry-phd.workers.dev` enabled=true |
| 純邏輯自動測試 | 4 / 4 通過 | `node --test packages/clock-core/test/clock.test.mjs` |
| 完整網頁 JS 語法 | 通過 | `node --check` 抽出的 `web-preview/index.html` script |
| PWA Worker 模擬測試 | 2 / 2 通過 | `node --test test/worker-smoke.mjs`，包含本地 Worker 路由、離線資源、CSP 雜湊比對 |
| 瀏覽器互動測試 | 通過 | `python test/web-e2e.py`，Chromium 模擬新增用途、開始/暫停/歸零、鈴聲次數、設定保存、時鐘與全螢幕退出 |
| 可供安裝的 PWA | 已包入 Cloudflare 部署 | `/manifest.webmanifest`、`/sw.js`、`/icon.svg`；尚未手機實機驗收 |
| 中央會員程式／資料庫 | 未修改 | 所有檢查僅讀取 GitHub `starry-phd/id`，沒有中央 Repo 任何寫入 |

## 尚未具備真實證據

- Cloudflare 網站從外部 HTTPS 裝置的 GET `/` 和 `/api/health` 驗收；目前僅 API 回報部署及路由，無真網路瀏覽證據。
- 使用者裝置對提前提醒／手機鎖屏／橫向／全螢幕的實測。
- GitHub `clock` 私有儲存庫建立、PR、commit SHA、Actions / required checks。
- 真正 TypeScript 型別檢查、React Native SDK 安裝、Android / iOS 原生編譯、EAS Build、Store TestFlight/內測/正式上架。
- `clock` 在 Starry ID App Registry 的正式登記；OAuth 登入及 Token 驗證端到端測試。現階段的只讀 API 契約並不代表完成登入。
- PWA 已更新至 Cloudflare Worker v1.1.1。仍欠實際 iOS Safari / Android Chrome 及離線裝置驗收。

## 發布安全界線

不動 `starry-phd/id`，不建立跨品牌共用 DB，不能冒用其他 App 身分或 Secret，廣告 OFF、無付費或內購。任何新的會員登記、正式 App Store/Google Play 上架，均需先具備合法身份、憑證、檢查與正式證據。

## 正式啟用會員登入的必要解決方式

現有 `config/apps.json` 未列 `clock`。若始終禁止**任何**中央服務設定變更，則 `clock` 只能保留離線計時＋只讀健康/登記狀態，不可能合法完成中央 OAuth。不可用 Echo 的 app_id、API Key 或 Token 代替 Clock。

## 版本 v1.1 與回退

- 新版 deployment id：`aeec2af1-d0d3-4dda-96bd-a2ebb236ad20`，Cloudflare 100%。
- 舊版保留：`4ff6af41-9c05-4b97-a72c-76f7faa348ac`，版本 `29756c9a-b34b-497a-bd60-df21478ad829`。若新 PWA 有遠端故障，可透過 Cloudflare Workers 版本管理回退至舊版，不能直接刪除中央會員 Worker。
- 目前 GitHub `starry-phd/clock` 尚未建立；連接器無新建 Repo 權限，此成果未寫入其他 Repo。
- 不具備新的中央 OAuth audience、Bundle 平台簽名與 Registry 登記，不應直接啟用假登入。
