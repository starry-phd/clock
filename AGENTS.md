# Clock 開發規則（對所有開發 AI 生效）

> **接手前必讀最新交接：[docs/CLOCK-AI-HANDOFF.md](docs/CLOCK-AI-HANDOFF.md)**。本規則是長期開發原則；雲端完成度、阻礙與下一步以最新交接加即時驗證為準。

## 最高優先順序：業主最新 Battery 決議（2026-11-07）

正式名稱：**繁星電池艙 Starry Battery**。
正式定義：**會員共用的消費用量月額度**，**不限 AI 任務**。

- 每位 Starry 會員各有獨立月額度；相同會員在授權的 Starry Apps 共用，跨會員不共用；H-Global 不使用。
- 已授權 AI、非 AI 服務皆可依核准的任務類型扣額度（例如 `clock.preset_create`、深度地名查詢）；不能把非 AI 消耗偽裝為 `clock.ai`。
- Starry ID Owner 決定中央免費月額度，Clock Owner 決定 Clock 各服務消耗量 X。依 Starry ID 2026-11-07 現行契約，中央不再建立或管理任務類型／單位費率表；每個 App 後端使用 `clock.` 開頭的合法 `task_type` 與實際 `units=X` 呼叫中央預留 API，且應提供可辨識的 `task_label`。
- 每月 1 日（台灣時間）恢復月額度，剩餘不累積、不販售、不轉讓、不儲值、不透支，不等同法幣或付費商品。
- 只允許**Clock 後端**以 Secret `STARRY_BATTERY_KEY` 和會員 Access Token 進行預留；成功後 commit、失敗／取消／逾時 release；使用冪等鍵避免重複扣額。Starry ID 不可連線時拒絕依賴 Battery 的操作，但免費倒數可繼續離線使用。
- 不可將金鑰放在 Expo 原生程式、Web bundle、GitHub、日誌或 API 回應中。不得直接修改 Starry ID 的程式、資料庫與設定。
- Clock 目前既有的 `clock.ai`（AI 任務）與未來的 `clock.preset_create`（新增付費預設）為不同業務任務；費率後台需對中央任務的最終實際扣量作一致性核驗；不一致時拒絕扣量。
- **前 3 組計時器免費**。從第 4 組起，每新增一組依 Owner 定義的 X 扣量。編輯、開始、暫停、重設、刪除不收費；刪除不退回先前成功消耗的月額度。已存在的資料不得追溯扣量。扣量服務未設好／中央不可用時不可假裝成功、不可由客戶端直接發起扣量。

### 版本差異處理

2026-11-07 在 Google Docs「DEV-A｜Starry Battery 電池艙｜專責 AI 人工審閱交接包」已正式改為「會員共用的消費用量月額度」。同日 `starry-phd/id` 的新版 `docs/integration-guide.md` 第 9 節及 `src/battery/battery.ts` 確認：**中央直接使用 App 傳入的合法 `task_type` 和 `units`，不需要 `battery_task_types` 表或 Admin Lite 任務登記**；部分舊文字仍稱「免費 AI 用量」，以現行 API 實作為準。若 API 拒絕非 AI 任務，先核對 Clock 專用服務金鑰、會員 Token 的 `app_id`、合法任務代碼與額度／上限，再交由中央模組修正其責任範圍；不可修改 Starry ID 或繞過授權。

## Expo App ≡ WEB 網頁版：功能同等規則

**所有新增、修改、刪除的 Clock 使用者功能，必須同一個 PR 同步處理 Expo iOS／Android 與 `web-preview/index.html`（Cloudflare Web／PWA）。**

1. 撰寫功能契約或變更矩陣：操作名稱、是否免費、X 顆電池、成功／失敗提示、資料一致性、權限、安全與離線行為。
2. Expo/React Native：`apps/clock/`；WEB/PWA：`web-preview/`；共同的業務資料以 Clock 後端為權威，不以兩端各自 LocalStorage/AsyncStorage 決定是否扣量。
3. 同一 API、同一會員 `user_id`、同一計費策略、同一錯誤碼、同一冪等策略。兩端顯示的價格從後端讀取，客戶端不得自訂 X。
4. 在同一 PR 中同時附兩端實作與測試：包含免費前三組、第 4 組扣 X、餘額不足、取消不扣、重試不重扣、刪除不退、失敗釋放、Owner 改價及權限阻擋。
5. 任何只修改 Expo 或只修改 Web 的**功能性** PR 視為 BLOCKED。平台專屬建置、螢幕尺寸／手勢差異、安全修補且功能不變等例外，須在 PR 寫明原因並提供等效體驗／契約驗收。
6. 首次 App 發布／後續 OTA、網站上線需紀錄 Expo build/版本與 Cloudflare Worker SHA；不能僅憑 GitHub merge 宣稱兩平台已同步上線。
7. 不能僅以假設 UI、靜態示意圖、TypeScript 編譯成功代替真實 Apple/Google／Web 登入和扣量驗收。

## 文件與來源

- 業主最新核定 DEV-A（Google Docs）：https://docs.google.com/document/d/1OdQREti12tzUBxZwgZ89WjUYdb-dCEnIEJ-AlpULky8/edit
- Starry ID 目前 API 實作契約：https://github.com/starry-phd/id/blob/main/openapi/starry-id.v1.json
- App 對接說明：https://github.com/starry-phd/id/blob/main/docs/integration-guide.md
- Clock 計費與雙平台驗收矩陣：docs/battery-v2-platform-parity.md
