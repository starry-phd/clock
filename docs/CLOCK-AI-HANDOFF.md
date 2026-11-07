# Clock 繁星計時器｜AI 開發交接（最新狀態）

> 盤點時間：2026-11-07（台灣時間）。串接指令最新版：**2026-11-07.9**。本文件仍記錄部署時點的狀態；以後續 PR／CI／staging 與實際中央 API 核驗結果為準，不能把模擬測試等同真實扣量成功。
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
| 中央 Battery 契約 | 已核對 `starry-phd/id` `docs/integration-guide.md` 第 9、12 節與 `src/battery/battery.ts`：2026-11-07 版本**不再使用 `battery_task_types` 表**；由 Clock 後端自行決定 `clock.preset_create` 和 `units=X`（1 顆／單位），中央按 X 預留。不可修改 Starry ID。 |
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

1. **中央契約已核對**：2026-11-07.9 中央自行接收合法 `clock.` 任務代碼、`task_label`、`units=X`；**不用在 Starry ID Admin Lite 建立任務類型**。仍須 staging 真實預留／扣量的實證；不得自行更改中央程式／D1。
2. **修復 staging 扣點條件**：Clock Owner 定價 X（目前 2）與中央可用單次上限（1–100）相容；由業主本人將 Clock 專屬有效 `STARRY_BATTERY_KEY` 安全設定至 `clock-api-staging` Workers Secret（**不索取或顯示金鑰**），再確認正式 `clock-api` 金鑰有效。中央已不再維護任務費率或任務登記表。
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

> 請接手 GitHub `starry-phd/clock`，先閱讀 `AGENTS.md`、本文件與 2026-11-07.9 串接更新清單，核對 main／CI／Cloudflare 正式與 staging 狀態。保持 Expo iOS/Android 與 Web 同 PR 功能同步。Battery 中央新版不須任務表；用 `clock.preset_create`、`task_label`、`units=X` 經 Clock 後端預留並確認。不得改 Starry ID，不得洩露金鑰。先在 staging 完成真實扣量驗收，CI 全綠且業主准許後才依流程啟用正式版。現有免費 3 組／免費取代功能必須保留；每次回報已完成、未完成、阻礙與下一步。


## 6. 2026-11-07.9 串接更新審查

本次修復分支對照新 Starry ID 串接指令。中央 Battery 無任務類型表是新契約設計，不再要求新增資料表或後台任務登記。已修正 Clock API 的任務標籤、額度錯誤碼、重試恢復、中央 Owner 驗權、JWT 公鑰快取，以及兩端帳號刪除提示／Quantum 顯示／客服入口。**模擬測試不等同已啟用真實扣量。**

尚未完成的跨平台工作：全量換用官方 `starry-client.ts`／`starry-sdk.ts`、Passkey 登入與管理、回前景 App Gate／公告完整驗收、前三組跨裝置一致性、Expo 原生 EAS 實機驗收。Android Passkey 須由業主按實際 APK／Play 簽章登記 SHA-256；測試用 staging Secret 仍缺。這些工作不得以已符合宣稱。

## 7. 本輪續作實測與安全邊界（2026-11-07）

- GitHub PR #15：<https://github.com/starry-phd/clock/pull/15>，草稿；首次 CI 全綠，續作修正仍須確認其最新 HEAD 的 CI。
- Expo iOS/Android 已引入與 Starry ID GitHub 完全相同的 `sdk/starry-client.ts`，登入中繼、Token refresh/rotation 改由 SDK 處理，沿用原 Refresh Token 儲存鍵，清除舊版磁碟 Access Token。**Web/PWA 尚沿用既有安全中繼程式碼，未完成官方 SDK 轉換**；不要宣稱三端 SDK 遷移完畢。原生也仍需要真正的 Passkey native adapter 與開發建置。
- Cloudflare Workers 唯讀設定：`clock-api` 的 `BATTERY_CHARGES_ENABLED=false`、`STARRY_BATTERY_KEY` 已配置名稱；`clock-api-staging` 的 `BATTERY_CHARGES_ENABLED=false`、`STARRY_BATTERY_KEY` **缺少**。
- **Clock 專用 D1 唯讀核對**（非中央資料庫）：`clock-app-db-staging` 的 `clock.preset_create`：**2 顆／次、enabled=0、version=2**；`clock-app-db`：**2 顆／次、enabled=1、version=9**。兩者 `clock_presets` 與 `clock_requests` 均為 0。故 staging 補金鑰後還須經過真正 Owner 身分驗權，從 Clock 自己的管理 API 開啟該功能，**不可直接繞過 Owner 修改 D1**。
- 待業主安全配置 staging Secret、提供授權測試會員後，僅在 staging 由 Owner 啟用費率與 `BATTERY_CHARGES_ENABLED=true`，驗證至少：真實扣 X、中央與 Clock 對帳、餘額不足、上限、異常 release、冪等重播、權限、跨會員隔離。未過關則 staging 保持關閉、正式不部署。
- Expo／Web 免費前 3 組跨裝置歸戶一致性仍是**正式扣量之前的獨立阻礙**，需先實作及驗收不丟失舊資料的遷移方案。

### 第一輪續作：前三組免費用途會員歸戶（2026-11-07）

- 在 PR #15 新增 Clock 專用 D1 migration `0004_free_preset_slots.sql`，獨立 `clock_free_presets` 表；**不變更中央 Starry ID 任何表格、授權資料或金鑰**。
- `GET/POST /v1/presets/free`、`POST /v1/presets/free/init`、`PATCH/DELETE /v1/presets/free/:id`：按經驗證的 Starry user_id 隔離，首次同步使用單一 SQL 交易建立 1～3 組，後續版本衝突回 409，單一會員最多 3 組，免費及付費預設 ID 不得衝突；不觸發 Battery。
- 在 Expo iOS/Android 與 Web/PWA 都加入：會員首次免費用途同步、遠端優先、原裝置不同用途留本機會員專屬備份、備份檢視及手動恢復、免費刪修及新增；登入前／網路中斷仍能免費計時。
- 付費 POST 新請求必須先由後端確認會員免費雲端已有 3 組；否則回 `FREE_SLOTS_NOT_READY`，確保真正第 4 組才可能扣 X。已提交/保留請求沿用冪等重播，不被新增的檢查打斷。
- 新增 `test/clock-free-sync.test.mjs`，並納入 CI：模擬會員隔離、首次同步不可覆寫、舊版本衝突、第三組刪除後免費補位、超過 3 組拒絕、未同步不得扣量。這是程式模擬測試，**不是已完成 staging D1 遷移或實機跨裝置驗收**。
- 部署安全門檻：必須在 staging Clock D1 **先執行 migration 0004** 再部署這個分支的後端；現有正式版與 Starry ID 完全不動。正式仍不合併、不部署。

### Android SHA-256 自動擷取（2026-11-07）

- 已在 PR #15 新增 **只讀** GitHub Actions `.github/workflows/clock-android-sha256.yml`。手動觸發後可從 `EXPO_TOKEN` 讀取最新已完成的 EAS `preview` APK，或提供已簽章 APK 的 HTTPS 直接下載網址，執行 `apksigner verify --print-certs` 擷取**真正憑證** SHA-256；輸出於 GitHub Summary 與 `clock-android-sha256.txt` Artifact。
- 不產生新的無關簽章、不開啟私鑰、不啟動新的 EAS Build、不上架、不回寫 Starry ID／Play Console。沒有簽章 APK 或 EAS 存取權時**必須明確失敗，不得捏造指紋**。
- **用途區分**：從 APK 擷取的是 Expo 安裝版的憑證指紋；Google Play 下載版通常由 Google 重新簽章，需要 Google Play Console「App integrity」中 **App signing key certificate SHA-256**，不可以拿 Expo AAB upload key 指紋冒充。
- 目前此新 Workflow 尚在 Draft PR，未合併主分支；尚未執行，也**未取得任何真實 SHA-256 指紋**。必要前提為可存取已簽署的 EAS APK 或其直接下載網址。
