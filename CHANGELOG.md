# Changelog

## 1.1.1 — 2026-11-05

- 修正 PWA 的 Content Security Policy：增加 `worker-src 'self'`，允許離線 Service Worker 合法註冊。
- 新增 Worker 測試斷言，驗證 CSP 的離線執行權限。
- Cloudflare 最新 Worker 版本 `ae2044ee-ffa7-45d4-9e14-9acc5230daab`，部署分流 100%。

## 1.1.0 — 2026-11-05

- PWA 完整版本已部署至 `clock` Worker，含 Service Worker／Manifest／Icon／可視設定表單與 CSP。
- 修正全螢幕 fallback 無法退出的問題。
- 原生 Expo App 新增 Starry ID 只讀 Registry API 狀態顯示，沒有修改中央程式碼。
- 新增 PWA Worker 產生腳本、瀏覽器 E2E 模擬及 Worker 煙霧測試。
- Cloudflare 最新版本 `99259512-7d3f-4e33-8414-9fb9ee790fca`，部署分流 100%。

## 1.0.0 — 2026-11-05

- 首版 `clock` 超大字倒數／時鐘，預設用途與自訂提前提醒。
- 建立 Expo 消費 App 原始碼、純邏輯測試、Starry ID 安全唯讀契約。
- Starry Cloudflare Worker `clock` 配置與部署；啟用 `clock.starry.phd` / workers.dev。
- Starry ID 中央未修改；會員 OAuth 未啟用、GitHub 私有 Repo / App Store / Play Store 上架尚未完成。
