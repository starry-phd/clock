# Clock 電池功能｜正式部署、啟用門檻與操作交接

> **最新交接狀態請先閱讀 [CLOCK-AI-HANDOFF.md](CLOCK-AI-HANDOFF.md)**。本文件含早期部署／準備紀錄；2026-11-07 實測結果可能已更新以下步驟。正式扣量仍關閉，請核對雲端設定，不可只照舊文啟用。

最後更新：2026-11-07（台灣）。

## 已部署／已驗證

- 正式 Web：https://clock.starry.phd；staging：https://clock-staging.starry-phd.workers.dev。
- 正式 API：https://clock-api.starry-phd.workers.dev；staging：https://clock-api-staging.starry-phd.workers.dev。
- 正式 Clock D1：`clock-app-db`；staging：`clock-app-db-staging`。兩者和 Starry ID 的資料庫完全獨立。
- 正式 Web 新增前 3 組免費提示、第 4 組起提示電池 X 顆的確認及後端新增／編輯／刪除流程。
- Expo iOS／Android 同一 PR 已同步開發及 CI 驗證，**但尚未上傳新版 IPA／AAB**：GitHub EAS 工作因缺少 `EXPO_TOKEN` 失敗。
- 提供 Clock Owner 專屬的定價管理頁（在設定 → Starry ID 會員區塊下），由 Clock API 後端以 Starry JWT + `CLOCK_OWNER_USER_IDS` 再次驗證；非 Owner 會 403。
- 本月 Battery 額度顯示於 App 與 Web；每位會員獨立，跨已授權 Starry Apps 共用；AI 與非 AI 皆可核准消耗。免費額度不可買賣／轉讓。
- 所有預設定價已寫入 D1，`clock.preset_create` 初始建議 X=2 顆，**`enabled=1`（但總扣量開關仍為 `false`）**。正式與 staging Worker 設有 `BATTERY_CHARGES_ENABLED=false`，絕不會在本次上線自動扣量。

## 必須完成才可以啟用真正扣 X 顆

1. **2026-11-07.9 新版中央契約**：Starry ID 不再建立 Battery 任務類型／單位費率表。Clock Owner 在 Clock 自己的設定頁選擇 `clock.preset_create` 與 X 顆；Clock 後端以 `task_type='clock.preset_create'`、`task_label='第 4 組起新增計時器'`、`units=X` 預留。中央直接以 X 顆計價，每單位 1 顆；中央每次可預留最多 100 顆，Clock UI 目前限制 X=0～30。**不需也不可以在 Starry ID DB 補建 `battery_task_types`。**
2. Cloudflare Workers 的 **clock-api** 已有 `STARRY_BATTERY_KEY`（僅能查到名稱，仍須驗證是否有效），但 **clock-api-staging** 尚缺。請依 Owner 核准於 Starry ID Admin Lite 取得 staging 可用金鑰並直接存入 Cloudflare Workers Secrets；不要貼到聊天室、GitHub、App 或日誌。正式 `clock` Web Worker 雖也有此 Secret，前端不可拿來直接扣點。
3. 確認 Clock API Worker Secrets 的 `CLOCK_OWNER_USER_IDS`，值為你在 Starry ID 的精確 `user_id`（若多位 Owner，以逗號分隔）。**這不是密碼**，但是授權白名單，務必只在 Worker Secret 設定。staging 與正式環境都需設定。不得用 Email 或姓名作 Owner 認證。
4. 登入 Clock → 設定 → Starry ID → 超級管理員，在 `clock.preset_create` 輸入 X（0～30）並選擇啟用，按「儲存」；後端會留稽核紀錄。
5. 先只對 staging 設定 `BATTERY_CHARGES_ENABLED=true`，使用**明確同意扣電池的測試會員**完成第 4 組新增，驗證預留／成功 commit、餘額與帳本、取消／失敗 release、重送同一 request_id 不重扣、不同會員資料隔離、Owner／非 Owner 403。
6. staging 通過並確認前端／原生版本對應後，再將 production `clock-api` 變更 `BATTERY_CHARGES_ENABLED=true`。請確認當次 CI 全綠並記錄雲端版本／回滾方法。單獨改前端不應開啟扣量。
7. Expo 新版上傳須先至 [GitHub Secrets](https://github.com/starry-phd/clock/settings/secrets/actions) 設定 `EXPO_TOKEN`。目前缺少它，手機商店尚未更新；**不可宣稱已完成 Expo 正式上線**。

## 安全規格

- Clock 只有自己的 D1；不修改 Starry ID 程式或資料庫。
- 僅後端 Secret + Starry Access Token 可以預留 Battery；App／Web 不持密鑰。
- Backend GET /v1/pricing 可讀取目前費率與 available；POST /v1/presets 需 Starry JWT、事先接受 X、唯一 request_id；API 只有在 Owner 設定、中央功能與 Secret 驗證全部完成時才可扣量。
- 成功先 commit 中央扣量再啟用雲端預設；扣款待確認不得建立額外使用權，失敗不自行回報成功；同一請求有唯一冪等紀錄，重試不可重複扣量。
- 既有儲存的本機用途予以保留，不追溯扣費；新增後第 4 組起才啟用費率。已扣電池的計時器刪除不返還額度。
- 收費停用或 Starry ID 斷線時，原有離線倒數、時鐘、前三組使用仍可正常運作。

## 一致性限制

目前 Expo 原生與 Web 使用各自的本機預設資料，已付款新增的雲端預設則會按 Starry `user_id` 在登入時同步。若要將前三組免費預設也改成**跨裝置完全同步**，需另外做可信資料遷移與總數規則，避免舊裝置以本機資料繞過每位會員的免費限制。前 3 組既有本機預設並非中央資料庫唯一事實來源，請勿將此版本誤報為完整跨裝置同步。

## 2026-11-07 修復紀錄

- Clock 正式 Web 與 Expo 程式已改用同一個安全 API：`https://clock.starry.phd/api/clock`；Web 透過 Cloudflare Worker service binding 轉送 `clock-api`，不再直接跨網域呼叫 workers.dev，修復 `Failed to fetch`。
- Cloudflare `clock-api` 和 staging 的 `CLOCK_OWNER_USER_IDS` 已從 Starry ID **唯讀** owner 角色結果安全設定，不顯示 Owner UUID；Starry ID 資料未被修改。
- 中央 `starry-battery` **唯讀**查核曾發現 DB 沒有 `battery_task_types`；依 2026-11-07.9 現行 `starry-phd/id` 第 9 節及程式設計，**中央本就不須此表，也不須登記任務**。真正阻礙是 Clock staging 缺金鑰與真實驗收；不可修改中央 D1。
- `clock-api` Secret **已有** `STARRY_BATTERY_KEY`（但 staging API 尚缺）；既有 `clock` 網站 Worker 有此 Secret，但 Cloudflare 不允許讀取原值。請到 Starry ID Admin Lite 的 Clock App 頁重新產生專用金鑰，直接設定到 `clock-api` 與 staging Workers Secrets（不得貼到聊天、Git）。
- 所有後端扣量開關 `BATTERY_CHARGES_ENABLED=false`，會員原有計時功能正常。Clock Owner 定價、Secret 完整設定後，先在 staging 驗證真正預留／扣量與帳本 X 一致，才開放正式扣點。

## 最新可用儲存方式（2026-11-07）

- 2026-11-07 已合併 [PR #13](https://github.com/starry-phd/clock/pull/13)，正式 Web 增加「**免費取代並儲存**」：用新名稱／時間**明確取代**一組現有計時器，仍維持 3 組、不扣點；Expo 相同功能程式已同步，但商店安裝版尚未更新。
- 目前不可真的扣點新增第 4 組。Cloudflare Clock 的價格資料為 `clock.preset_create`、2 顆／次、`enabled=1`，但正式與 staging `BATTERY_CHARGES_ENABLED=false`。中央最新規格不需 `battery_task_types` 表。不能自行修改 Starry ID。
- 詳細最新盤點、CI 及交接優先順序：**[CLOCK-AI-HANDOFF.md](CLOCK-AI-HANDOFF.md)**。
