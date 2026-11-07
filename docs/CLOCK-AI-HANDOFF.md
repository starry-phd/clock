# Clock 繁星計時器｜AI 開發交接（最新狀態）

> 盤點時間：2026-11-07（台灣時間）。**本文件為目前的交接入口**；開發前須重新驗證雲端即時狀態，不能把測試通過等同所有功能已上線。
>
> 專案 GitHub：[starry-phd/clock](https://github.com/starry-phd/clock)（公開）；正式 Web：[clock.starry.phd](https://clock.starry.phd)。

## 1. 已完成與已上線

| 項目 | 已驗證狀態 |
|---|---|
| GitHub `main` | `80f149f9a685d66cf1e0653b624acf50a27ccf3f`；[Actions #42279608962](https://github.com/starry-phd/clock/actions/runs/42279608962) **success** |
| Web/PWA | Cloudflare Worker `clock` 已正式部署，使用同網域 `/api/clock/*` Service Binding → `clock-api`，避免舊版 `Failed to fetch` 跨域問題 |
| Web 新增用途 | 內建 3 組；新增第 4 組需要 Battery，現階段**不能付費新增**；可在「新增用途」視窗選舊預設，使用「**免費取代並儲存**」（不增量、不扣 Battery） |
| Expo iOS/Android | 對應原生功能已與 Web 同 PR 實作並通過 CI，**新版尚未證實發布到商店／安裝包** |
| Clock API | `clock-api` 正式與 `clock-api-staging` staging Worker 存在；各使用獨立 Clock D1（`clock-app-db`／`clock-app-db-staging`），不使用 Starry ID DB |
| Owner 定價 | Clock D1 的 `clock.preset_create` 為 **2 顆／次、enabled=1、version=9**；`CLOCK_OWNER_USER_IDS` Secret 已在正式及 staging API 設定 |
| Battery 計費 | 正式與 staging API 的 `BATTERY_CHARGES_ENABLED=false`。**使用者目前不會被扣點，不能聲稱第 4 組已可付費新增。** |
| 金鑰（僅列有無，不含值） | 正式 `clock-api` **有** `STARRY_BATTERY_KEY`；staging `clock-api-staging` **沒有**。`clock` Web Worker 有此 Secret，**但前端不可使用金鑰** |
| 中央 Battery 現況 | 對 `starry-battery` D1 唯讀檢查：**無 `battery_task_types` 資料表**，現存 `battery_accounts`、`battery_app_keys`、`battery_app_limits`、`battery_ledger`、`battery_policy`、`battery_reservations`。須確認最新中央 API／migrations／任務管理設計，**不可直接補表或改 Starry ID** |
| 已產生收費資料 | 正式 Clock D1 查詢 `clock_presets=0`、`clock_requests=0`（截至本次盤點） |

本次關鍵 PR：[ #8 Battery 定義與雙平台規範](https://github.com/starry-phd/clock/pull/8)、[#9 Clock API／Owner 定價／Expo+Web](https://github.com/starry-phd/clock/pull/9)、[#11 同網域 API](https://github.com/starry-phd/clock/pull/11)、[#12 合法任務碼](https://github.com/starry-phd/clock/pull/12)、[#13 免費取代儲存](https://github.com/starry-phd/clock/pull/13)。目前無開啟中的 PR（盤點時）。

## 2. 不得更改的產品規則

- 正式名稱：**繁星電池艙 Starry Battery**；定義：**會員共用的消費用量月額度**。不限 AI，可用於經核准的非 AI 服務；同一會員跨已授權的 Starry Apps 共用。
- Clock 的「計時器」指**已儲存用途／預設**，**前 3 組免費**。第 4 組起每新增一組，扣 Owner 設定的 X（目前 2）顆。開始、暫停、重設、編輯、刪除免費；刪除不退先前成功扣除的電池；不追溯舊資料。
- 非 AI 任務完整代碼：**`clock.preset_create`**。注意舊的 `clock.preset.create` 有兩個句點，**無效**；不能拿 `clock.ai` 冒充。
- **Expo App = Web 網頁版**：所有使用者功能同 PR 開發、同 API／會員 `user_id`／費率／錯誤及冪等規則，需雙平台 CI 與實際發布驗證。詳見根目錄 `AGENTS.md`、`docs/battery-v2-platform-parity.md`。
- **不得修改 Starry ID 程式、設定或中央資料庫**；不得將 Token/Secret 寫入 Repo、App/Web、日誌。只有後端能用 `STARRY_BATTERY_KEY`；先預留、成功確認扣除、失敗釋放；網路／中央服務異常則不扣。
- 影響費用、新資源、正式資料刪改、商店送審的動作依最新業主授權執行；PR 合併前必須 CI 全綠。

## 3. 目前阻礙與接手優先順序

1. **中央契約先行**：閱讀 `starry-phd/id` 最新 `docs/integration-guide.md`、`openapi/starry-id.v1.json`、Battery migrations／程式；核對 `starry-battery` 缺少 `battery_task_types` 是否是版本架構變動，確認 `clock.preset_create` 能在 Admin Lite 正式登記。**只查詢，不能自行修改 Starry ID**；若需要中央修補，回報 Owner／中央模組處理。
2. **修復 staging 扣點條件**：由 Owner 在授權後台確認非 AI 任務 `clock.preset_create`、每單位消耗 1、單次上限至少 X；將可用的 `STARRY_BATTERY_KEY` 經 Cloudflare UI/Secret 方式設定至 `clock-api-staging`（**不索取或顯示值**），再確認正式 `clock-api` 現有金鑰是否有效。
3. **安全交易驗收**：僅 staging 開啟 `BATTERY_CHARGES_ENABLED=true`，使用明確同意的測試會員驗證：第 4 組真正扣 X、中央帳本一致、餘額不足拒絕、取消／失敗 release、重送同一 request_id 不重扣、價格異動拒絕、非 Owner 403、跨會員資料隔離；未通過不得開 production 扣量。
4. **一致性與資料遷移**：目前前 3 組預設以各裝置本機儲存，付費雲端預設才同步；尚未建立「每位會員跨所有裝置統一免費 3 組」的完整機制。上線收費前須避免用不同裝置繞過免費數量，同時保留既有本機資料；不可默默清空。
5. **Expo 發布**：原生程式已同步但安裝版未更新；過去 GitHub EAS Job 因缺 `EXPO_TOKEN` 而在建置前停止，**先查最新設定再採取行動**。按 Owner 授權、安全簽章、iOS/Android 實機及審核流程處理，不要把 Web 已上線視為 App 已上架。
6. **正式啟用與回滾**：只有中央任務、Secret、完整交易與 Expo/Web 等價驗收達標，才開正式扣量；保留 `false` 可立即關閉的回滾開關。維持 Web「免費取代既有一組」能力供服務異常時使用。

## 4. 技術入口與驗收證據

- Web：`web-preview/index.html`、`web-preview/sw.js`；Expo：`apps/clock/app/index.tsx`、`apps/clock/src/auth/clockApi.ts`、`OwnerPricingPanel.tsx`。
- API：`services/clock-api/src/routes.mjs`、`services/clock-api/src/index.mjs`；D1 migration：`services/clock-api/migrations/`。
- 測試：`test/clock-battery-feature.test.mjs`、`test/platform-parity.test.mjs`、`test/staging-http-smoke.mjs`、`test/clock-api-staging.test.mjs`；CI：`.github/workflows/validate.yml`。
- 正式網站：<https://clock.starry.phd>；正式同網域 API：`https://clock.starry.phd/api/clock/v1/pricing`（無憑證唯讀）。
- 先前營運文件：`docs/clock-battery-activation.md`。若文字與本文件盤點不同，先重新讀取雲端；**以實際 API／D1／CI 結果為準**。
- 最新可靠 CI 證據：<https://github.com/starry-phd/clock/actions/runs/42279608962>（當時已成功，僅證明 CI，不證明真實扣點成功）。

## 5. 可直接交給下一位 AI 的簡易指令

> 請接手 GitHub `starry-phd/clock`，先閱讀 `AGENTS.md` 與 `docs/CLOCK-AI-HANDOFF.md`，核對 main／CI／Cloudflare 正式與 staging 狀態。保持 Expo iOS/Android 與 Web 全功能同步。優先查明 Starry ID Battery 中央任務 `clock.preset_create` 的真實契約及缺表問題；不得改 Starry ID，不得洩露金鑰。先在 staging 完成安全扣點驗收，CI 全綠透過 PR 合併，才依已授權流程啟用正式版。現有免費 3 組／免費取代功能必須保留；每次回報已完成、未完成、阻礙與下一步。
