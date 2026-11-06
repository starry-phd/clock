# Clock 電池功能｜正式部署、啟用門檻與操作交接

最後更新：2026-11-07（台灣）。

## 已部署／已驗證

- 正式 Web：https://clock.starry.phd；staging：https://clock-staging.starry-phd.workers.dev。
- 正式 API：https://clock-api.starry-phd.workers.dev；staging：https://clock-api-staging.starry-phd.workers.dev。
- 正式 Clock D1：`clock-app-db`；staging：`clock-app-db-staging`。兩者和 Starry ID 的資料庫完全獨立。
- 正式 Web 新增前 3 組免費提示、第 4 組起提示電池 X 顆的確認及後端新增／編輯／刪除流程。
- Expo iOS／Android 同一 PR 已同步開發及 CI 驗證，**但尚未上傳新版 IPA／AAB**：GitHub EAS 工作因缺少 `EXPO_TOKEN` 失敗。
- 提供 Clock Owner 專屬的定價管理頁（在設定 → Starry ID 會員區塊下），由 Clock API 後端以 Starry JWT + `CLOCK_OWNER_USER_IDS` 再次驗證；非 Owner 會 403。
- 本月 Battery 額度顯示於 App 與 Web；每位會員獨立，跨已授權 Starry Apps 共用；AI 與非 AI 皆可核准消耗。免費額度不可買賣／轉讓。
- 所有預設定價已寫入 D1，`clock.preset_create` 初始建議 X=2 顆，**`enabled=0`**。正式與 staging Worker 設有 `BATTERY_CHARGES_ENABLED=false`，絕不會在本次上線自動扣量。

## 必須完成才可以啟用真正扣 X 顆

1. 用現有 Owner 身分登入 [Starry ID Admin Lite Battery](https://id.starry.phd/admin/battery)，新增或確認獨立非 AI 任務 `clock.preset_create`，屬 App `clock`，**每單位消耗 1 顆**，單次上限至少 X（若 X 可設定到 30，中央單次上限設為 30）。不能拿 `clock.ai` 冒充非 AI 功能。
2. 在 Starry ID Admin Lite 的 App 管理重新產生／取得 Clock 專用 Battery Service Key；只在 Cloudflare Workers 的 **clock-api** Secret 設 `STARRY_BATTERY_KEY`，並為 **clock-api-staging** 設定 staging 可用的對應金鑰；金鑰不要貼在聊天室、GitHub、App 或日志。現有 `clock` Web Worker 雖有同名 Secret，但 Cloudflare 不支援讀取原值並自動複製；`clock-api` 尚未設定。
3. 在 Clock API Worker Secrets 設 `CLOCK_OWNER_USER_IDS`，值為你在 Starry ID 的精確 `user_id`（若多位 Owner，以逗號分隔）。**這不是密碼**，但是授權白名單，務必只在 Worker Secret 設定。staging 與正式環境都需設定。不得用 Email 或姓名作 Owner 認證。
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
