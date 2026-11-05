# Clock｜GitHub → Expo EAS → Google Play 上架清單

**建立日期：2026-11-05**，以實際 GitHub commit、EAS build 與 Google Play Console 進度為準。

## 目前已完成的離線準備
- 原始碼目標：GitHub organization `starry-phd` 下私人 Repo `clock`，不應建立於 `yukidu` 個人 Repo。
- SDK 58 / RN 0.88 / TS strict、pnpm workspaces，現有核心與 Worker 離線測試。
- 播放音效不需麥克風：expo-audio 設定停用錄音、背景服務及 Android RECORD_AUDIO 權限；待原生 Manifest 驗證。
- Expo 應用識別：`slug=clock`、Android `phd.starry.clock`、iOS `phd.starry.clock`。正式首次上架後 Package ID 不可任意更改。
- 提供 app icon、Android adaptive icon、Google Play icon 512、Feature graphic 1024×500。
- EAS 設定：preview APK、production AAB；remote version、自動增加 versionCode；Google Play submit 綁定 `internal` + `draft`，不自動發佈正式版。
- GitHub Actions：push/PR 執行基礎測試；EAS 工作流程只允許手動觸發，避免占用建置額度或未知費用。
- 保持 Starry ID 只讀，不更改 `starry-phd/id`、D1、會員 Secrets、Auth；Ads OFF、Billing OFF。

## 阻擋正式上架的 Gate
1. [ ] 組織 `starry-phd` 已建立 Private `clock` Repo；main SHA/權限可驗證。
2. [ ] Mac/CI 實際完成 `pnpm install`，產生並提交 `pnpm-lock.yaml`；`expo-doctor` / TS / lint / unit tests 全綠。
3. [ ] 使用自己的 Expo 帳戶 `eas login`、`eas project:init`，記錄真正的 projectId 與 Owner；不可憑空填入。
4. [ ] Expo EAS preview Android APK 建置成功、安裝在 Android 真機、響鈴/全螢幕/橫豎/重啟/離線測試通過。
5. [ ] 實測背景與鎖屏行為、音量／靜音模式，核對商店描述，保存裝置/OS/build ID/日期與結果。
6. [ ] EAS production AAB 建置成功；Google Play App Signing、簽章憑證由經營者在平台確認。
7. [ ] Google Play Console 在 Starry.phd 開發者帳戶下建立 `Clock` App；確認套件 ID 精確為 `phd.starry.clock`。
8. [ ] 取得正式公開的隱私政策 HTTPS URL，完成 Data Safety、內容分級、受眾、相片、描述與支援聯絡資訊；正式 Android 真機截圖取自 App。
9. [ ] 若個人開發者帳戶需封閉測試，依 Console 顯示條件安排測試者與天數，符合正式發佈資格後再送正式審查。
10. [ ] 在平台受審人員確認及費用 Gate 後，透過 EAS Submit 將 AAB 上傳 **internal/draft**，不自動推 production。
11. [ ] Google Play 正式審核/上線完成，取得商店頁面真實網址和發佈紀錄。

## Mac 上建立私人 repo（需 GitHub CLI 已登入）

將 ZIP 解壓縮進入 `clock` 專案根目錄後，在 Terminal 執行：

```bash
cd /解壓縮的位置/clock
bash tools/create-github.sh
```

此腳本會檢查 GitHub CLI `gh` 登入與組織，建立 `starry-phd/clock` 私有 Repo；若已在 GitHub 網站建立空白 Private Repo，則安全驗證後推送（不覆寫遠端歷史）；執行前請確認沒有額外個資/憑證。

## Expo 建置命令（Repo 已建立且 GitHub CI／依賴檢查通過後）

```bash
# 在 clock 專案根目錄
corepack enable
pnpm install
pnpm test:clock
pnpm --dir apps/clock exec tsc --noEmit
cd apps/clock
npx expo-doctor
npx eas-cli@latest login
npx eas-cli@latest project:init
npx eas-cli@latest build --platform android --profile preview
# 預覽版 Android 實機測試通過後，再啟動正式 AAB build
npx eas-cli@latest build --platform android --profile production
# Play Console 已建立 App 並設定 Google Service Account，且明確完成發佈 Gate 後：
npx eas-cli@latest submit --platform android --profile production
```

若要使用 GitHub Actions 手動觸發 EAS：設定組織/Repo Actions secret `EXPO_TOKEN`，由 GitHub Actions 頁面選 `clock-android-eas-manual`，需 Repo 已記錄 `eas projectId` 且先產生 `pnpm-lock.yaml`。不可把 `EXPO_TOKEN` 貼入聊天或 GitHub 原始碼。

## 正式版回退/責任
- App/套件 ID 確認後才建立商店 App；首次公開版本不能透過刪除 GitHub commit 回退 Google Play 已安裝版本，需依新版本重新發布。
- 不修改 Starry ID 中央會員來源；計時核心與界面保持裝置可離線使用。
- 請確保同一 App 的資料安全聲明符合實際已建置版本；不以 PWA 測試等同原生已驗證。
