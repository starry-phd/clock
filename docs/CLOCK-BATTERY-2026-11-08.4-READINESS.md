# Clock 第 4 組計時器｜Starry Battery 2026-11-08.4 啟用檢查

依業主最新指令 **2026-11-08.4**，並重新讀取中央 `starry-phd/id` 的 `docs/integration-guide.md` 第 9 節、`sdk/starry-sdk.ts` 及 OpenAPI。此文件不包含服務金鑰或會員 Token。

## 已完成：不扣量準備

- `clock-api-staging` **已更新**到新版 Clock API，中央 Battery 伺服器端流程為：`reserve` → D1 用途建立（pending）→ `commit` → 設為 active；預留後處理失敗會 `release`；commit 不確定時維持 pending、用相同 request_id 重試，不亂退可能已扣款的預留。
- `clock-api` 正式環境也已更新到同一份通過 CI 的 API 程式，僅為啟用前的免費用途雲端同步準備，**`BATTERY_CHARGES_ENABLED=false`** 未改。兩個 Worker 都保留 `DB`、`CLOCK_OWNER_USER_IDS`，正式 Worker 保留 `STARRY_BATTERY_KEY`；無新金鑰出現在 Git。
- Clock staging D1 原有 `clock_free_presets`；正式 Clock D1 已安全套用 `0004_free_preset_slots.sql` 建立空表，未刪改既有 `clock_presets`、`clock_requests`，原有兩表皆為 0 筆。中央 Starry ID D1 不受影響。
- 中央任務代碼 `clock.preset_create`、會員確認單次價格、Owner 角色驗證（Clock allowlist + Starry `GET /v1/me` `staff_role=owner`）、上限 30 顆、重試防重扣、409/503 先拒絕均已在新版 Clock 後端。
- 價格目前 **2 顆普通電池／第 4 組起每新增一組**：Clock 自有 staging D1 `units=2,enabled=0`、正式 `units=2,enabled=1`；**兩環境扣量總開關皆為 false**，所以計費功能實際仍不可用。未經 Owner 審核不直接修改價格資料列。

## 尚未完成：真實扣量測試與正式開放

1. **必要人工 Secret**：業主進 Cloudflare → Workers & Pages → `clock-api-staging` → Settings → Variables and Secrets → Add → Type **Secret**，Name `STARRY_BATTERY_KEY`，Value 使用 Starry ID 已發出的 Clock 專用金鑰；儲存/部署。**金鑰不要貼在聊天、GitHub 或 App 設定前端。** 正式 `clock-api` 已有同名 Secret；不要重設或覆蓋正式金鑰。
2. staging 管理員在 **Clock App 設定頁 → 超級管理員 → 🔋 電池消耗設定**（需中央 `staff_role=owner`）確認 `clock.preset_create` 價格 X（目前 2），並透過 Clock 受保護的 Owner API 啟用 staging 單項價格。由 Owner 或經授權操作人員在 Cloudflare 將 **staging 專用** `BATTERY_CHARGES_ENABLED=true`，前提是金鑰已存在。
3. 在 staging 使用真正測試會員，先確認免費 3 組雲端歸戶，再驗證新增第 4 組：預留 X → 成功創建 → commit X → 中央餘額減 X；故意發生失敗要 release、下次重試同 request_id 不可二次扣、不同會員互相隔離；不足餘額、單 App cap、維護、無權限、價格變更都必須正確拒絕，並檢查中央與 Clock D1 對帳。測試後 staging 總開關可復原 `false`。
4. **只有完成上述真實測試，且業主已授權正式開放**，才可在正式 Clock Owner 設定頁確認定價並把正式 Worker `BATTERY_CHARGES_ENABLED` 由 `false` 改 `true`。正式環境現已有金鑰和單項 `enabled=1`，但這不等於可以跳過 staging 測試。

## 重要限制

- Clock 只能**由後端**持有服務金鑰及呼叫中央 Battery。Clock App 管理設定只提供調整「扣幾顆」，**不能**輸入或保存 Secret。
- 免費 3 組、免費取代、離線倒數不扣電池；多新增 1 組才進行 X 顆扣量；前 3 組同步資料若不完整，新的付費請求會 409 安全拒絕。
- 部署 Clock API 不代表真實會員登入、跨裝置同步或中央扣量已驗收。不要宣稱「已開啟」直到公開 pricing 的 `available=true` 且 staging 真實交易全部過關。
- 回滾：如新版正式後端有問題，可在 Cloudflare `clock-api` Workers Versions 恢復前一個已部署版本，保留原 Secret 與 D1；不要還原/刪除 Clock 或 Starry ID 正式會員資料。
