# Clock × 繁星電池艙 Starry Battery v2.0｜規則與雙平台同步驗收

正式生效決議：2026-11-07。業主核定來源：Google Docs DEV-A（見下方連結）；本文件是 Clock 的**產品規則**，不等於中央 API 文件和正式部署已同步完成。

## 一、正式定義

**繁星電池艙 Starry Battery：會員共用的消費用量月額度。**

- 每名 Starry 會員擁有自己的月額度；同一名會員在已授權 Starry Apps 的額度共用。不得跨不同會員共用。
- 不是 AI 專屬，也可用於經 Owner 核准的非 AI 服務。H-Global 不使用此額度。
- 每月 1 日依台灣時間恢復，不累積剩餘。不得購買、販售、轉讓、兌現、透支；不是商品或貨幣。
- Owner 可透過 Starry ID 的 Admin Lite 調整月額度及中央任務類型；Clock Owner 管理各種 Clock 功能的消耗量 X。
- 有效會員、已授權 App、可用額度與任務必須由後端驗證。流程：**預留 → 成功完成服務 → 確認扣除**；失敗、取消或逾時釋放額度。冪等鍵避免重扣；中央不可用時拒絕收費功能。
- Clock 後端的 `STARRY_BATTERY_KEY` 僅限 Workers Secret。Web 和 Expo 皆不能持有金鑰、直接扣額或更改中央 DB。

## 二、計時器規則

「計時器」此處指使用者**已儲存的計時用途／預設**，非倒數按下開始的次數。

| 操作 | 費率／規則 | Expo App | Web / PWA |
|---|---|---|---|
| 儲存前 3 組計時用途 | 0 顆 | 相同 | 相同 |
| 第 4 組起每次新增 | 每組 X 顆，由 Owner 設定（初始建議 2，尚未啟用） | 登入、明確預覽 X、確認後提交到 Clock API | 同左 |
| 編輯既有預設、開始、暫停、重設 | 0 顆 | 相同 | 相同 |
| 刪除既有預設 | 0 顆、不退還已確認扣除的用量 | 相同 | 相同 |
| 既有已儲存的舊資料 | 不追溯扣費；遷移不得丟失 | 相同 | 相同 |
| Battery 不足、登入取消、API 不通 | 不新增、不扣，原本的免費功能照常 | 相同 | 相同 |
| 同一個新增請求重新送出 | 使用同一冪等鍵，不重複新增也不重扣 | 相同 | 相同 |

### 後端尚需驗收的事實

- 非 AI 類型應獨立為 `clock.preset.create`，**不得假冒 `clock.ai`**。
- 中央 Starry Battery 任務單位耗量與 Clock 後台 X 必須一致，例如中央「每單位消耗 1」，Clock 依 X 傳入 units；若實際返回 `amount` 不是使用者確認的 X，**立即取消或釋放，不執行新增**。
- Clock API 必須擁有統一的每位會員預設資料與冪等紀錄，不能因「Web 瀏覽器」或「原生手機」各自本機存檔而重複享有前 3 組。
- Owner 身分不可只靠前端隱藏按鈕；需使用受保護的後端 Owner 授權名單與 Starry JWT 認證，再加審計記錄，更新 X 只能經後端。
- 目前中央 GitHub integration guide 的敘述仍有「免費 AI 用量」字眼；**業主核定的最新 DEV-A 定義優先**，但沿用中央現有實際 API，不能假定其非 AI 任務已登記。正式扣量在這項驗收完成前不可啟用。

## 三、全部新功能都遵循 Expo ≡ Web

每個功能 PR 都必須有：需求 ID、統一 API／權限／價格及邊界行為、Expo 對應實作、Web 對應實作、兩端測試、staging 與發布版本證據。

| 功能 | Expo iOS/Android | Web/PWA | 目前狀態 |
|---|---|---|---|
| 倒數計時／大字時鐘／自訂預設 | 既有 | 既有 | 已存在，但實作分開 |
| Starry ID Google／Apple 中繼登入 | 已寫程式 | 已正式部署 | Expo 新版 EAS 建置因缺 `EXPO_TOKEN` 尚未上線 |
| Battery 本月餘額／剩餘額度 | 本次補文字及格式 | 本次補讀取與文字 | 不收費，僅本人可見 |
| 前 3 組免費、超過新增扣 X | 規則已定、後端未啟用 | 同左 | 由專責 PR 完成實際扣量後**兩端一起上線** |
| Owner 專屬費率設定頁 | 待 Clock API 權限及儲存實作 | 同左 | 未開放一般會員，不能只有前端 UI |
| AI 流程編排等進階功能 | 未實作 | 未實作 | 每項需同時開發與獨立任務代碼 |
| 全螢幕呈現 | 系統隱藏 StatusBar；尚無一致的操作按鈕 | 既有全螢幕／劇院模式 | 既有差距，需獨立補足，不宣稱已完全一致 |

### 發布與回退

- 任何新消耗功能先在 Cloudflare staging + Expo 測試建置驗收，確保兩端功能等價，再以同一個 release ID 發布；Web 或 Expo 任一端未就緒時，後端消費功能保持 OFF。
- 正式部署只代表該平台已更新，不代表另一平台 App Store／Play 已上線。
- 刪帳、停權或 Starry ID 不可達時停用 Battery 操作，不影響本機離線計時；所有扣額事件需有可對帳紀錄。

## 四、來源與版本差異

- [2026-11-07 已更新的 DEV-A Google Docs](https://docs.google.com/document/d/1OdQREti12tzUBxZwgZ89WjUYdb-dCEnIEJ-AlpULky8/edit)：正式名稱、月額度、非 AI 用途、預留／提交／釋放安全規則。
- [Starry ID GitHub 串接說明](https://github.com/starry-phd/id/blob/main/docs/integration-guide.md)：現行 API 流程、驗證與 Secret 規格，部分敘述仍為舊詞。
- [Starry ID OpenAPI 3.1](https://github.com/starry-phd/id/blob/main/openapi/starry-id.v1.json)：請求／回應欄位來源，不能自創不相容 API。
