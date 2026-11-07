# Clock API（獨立於 Starry ID）

Clock 專用 Worker：`clock-api-staging` 與 `clock-api`；各有獨立 Clock D1，不會寫入 Starry ID 中央會員資料庫。正式環境的 `BATTERY_CHARGES_ENABLED` 持續保持 `false`，沒有實際扣量。

## 免費與付費計時器（2026-11-07 續作）

- 前 3 組免費計時器：`clock_free_presets`（Clock D1，`services/clock-api/migrations/0004_free_preset_slots.sql`），由登入的 `user_id` 管理。不同裝置第一次登入可安全匯入原本本機用途；後來裝置讀取會員雲端版本，不會覆蓋；本機不同用途先備份並可由 App／Web 介面手動恢復。
- 免費 API：登入後 `GET /v1/presets/free`、`POST /v1/presets/free/init`、`POST /v1/presets/free`、`PATCH /v1/presets/free/:id`、`DELETE /v1/presets/free/:id`。同步與修改都不呼叫中央 Battery；修改/刪除要求當前 `version` 以避免覆寫另一裝置較新的內容。
- 第 4 組起：既有 `GET/POST /v1/presets`、`PATCH/DELETE /v1/presets/:id`，上限為 47 組付費雲端用途（總數 50）。**未有三組有效的會員雲端免費用途時，伺服器拒絕新的付費扣量**；既有請求可按原 `request_id` 安全重播。
- Owner 定價：`GET/PUT /v1/admin/pricing`，PUT 同時檢查 Clock allowlist 與 Starry ID 即時 Owner 角色，需通過版本比對與稽核。
- 已存在本機前 3 組不補扣電池；離線開始、暫停、重設、響鈴一律免費。

## Starry Battery v2

繁星電池艙 Starry Battery 是「會員共用的消費用量月額度」，適用核准的 AI 與非 AI 功能。Clock 使用 `clock.preset_create`、直接提交 `task_type`、`task_label`、`units=X` 至中央保留/提交/釋放 API，**不需建立過時的中央 task type 對照表**。

中央 Service Key 只可放在 Clock API Worker Secret `STARRY_BATTERY_KEY`，不得寫入前端、GitHub、App 或日誌。中央暫時無法連線時不啟動新的付費工作。正常計時不需要登入。

## staging 上線順序

1. 在 **Clock staging D1** 套用 `0004_free_preset_slots.sql`，確認表建立及舊 `clock_presets` 無變更；**不可操作中央資料庫**。
2. 從同一 PR 分支部署 staging Clock API 與 Web，檢查原生/Web 免費同步及備份、會員隔離、409 版本衝突、免費 3 組驗證、無扣量。
3. 經業主安全配置 `clock-api-staging` 的 `STARRY_BATTERY_KEY`、用 Owner 角色透過受保護的 Clock API 開啟 staging 定價、設定 staging 扣量開關，使用獲授權測試會員實測第 4 組扣 X、中央交易對帳、失敗釋放和冪等。測試後關回開關。
4. PR #15 CI 與實機驗收全部通過並經人工核准後才可考慮合併；正式部署另需明確批准。

**現況**：截至 2026-11-07，staging `BATTERY_CHARGES_ENABLED=false`、缺少 `STARRY_BATTERY_KEY`，staging 費率 2 顆且 `enabled=0`。正式環境總扣量亦關閉。

操作與原則見 [Clock Battery activation](../../docs/clock-battery-activation.md)、[AI Handoff](../../docs/CLOCK-AI-HANDOFF.md)。
