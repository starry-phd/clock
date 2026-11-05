# Clock｜iOS TestFlight 與 App Store 上架流程（2026-11-05）

## 目前已驗證
- Expo: `@starryphd/clock`（來自使用者 EAS CLI 成功截圖）。
- Expo Project ID: `bd61ea4d-aa22-48b1-9bdc-fae3c8cab64f`（使用者截圖）。
- GitHub: 公開 `starry-phd/clock`，`main`，僅為原始碼倉庫；與 Expo 帳號名稱可不同。
- iOS Bundle Identifier: `phd.starry.clock`，不得任意改動正式上架的 ID。
- EAS `production` 可為 iOS 建置 IPA；另有 `ios-simulator` 測試設定。
- **未完成**：Apple Developer 付費會籍驗證、App Store Connect App 建立、Apple 簽章、iOS IPA 產物、實機 TestFlight、正式審核及發布。

## 1. 帳戶與法律名稱
- 正式 App Store / TestFlight 發布必須使用有效 Apple Developer Program（US$99／年，依當地結算）。
- 個人／一人企業註冊時，商店銷售商名稱顯示法定個人姓名；若想顯示公司／組織名稱，須由符合 Apple 條件的法律實體以組織會員註冊（通常需 D-U-N-S 編號）。GitHub 組織 `starry-phd` **不等於** Apple Developer 的法律組織。
- 只在 Apple 或 Expo 的官方登入流程輸入 Apple ID／密碼／驗證碼。不得將 Token、API Key、簽章憑證或密碼提交 GitHub（Public）或貼到聊天。

## 2. 將已成功初始化的 Expo 設定提交 GitHub
使用者 EAS CLI 已在 Mac 修改 `apps/clock/app.json`。不要丟棄此檔案；確認內有 `expo.extra.eas.projectId`，且值為 `bd61ea4d-aa22-48b1-9bdc-fae3c8cab64f`。

```sh
cd ~/Downloads/clock
git add apps/clock/app.json pnpm-lock.yaml
git commit -m "chore(clock): link Expo project and lock dependencies"
git pull --rebase origin main
git push origin main
```

若 Git 顯示衝突，暫停並檢查；不得 `git push --force`、不得刪除使用者未提交的更改。

## 3. 建置 iOS
先從 GitHub 同步最新 `eas.json`（含 `ios-simulator`），再由 Mac 執行：

```sh
cd ~/Downloads/clock
git pull --ff-only origin main
corepack pnpm install --frozen-lockfile
cd apps/clock
npx eas-cli@latest build --platform ios --profile ios-simulator
```

`ios-simulator` 僅供 iOS 模擬器，**不是可提交 App Store 的正式安裝包**。如要在真實 iPhone 使用，應建置簽章的正式／測試版（需有 Apple Developer 付費會籍與憑證），例如：

```sh
npx eas-cli@latest build --platform ios --profile production
```

首次執行會提示 Apple Developer 身分驗證及簽章材料建立，可讓 EAS 管理 Distribution Certificate、Provisioning Profile。簽章之後才適合改由 GitHub Actions + EXPO_TOKEN 做 `--non-interactive` 建置。

## 4. App Store Connect 與 TestFlight
- 登入 <https://appstoreconnect.apple.com> 建立 App `Clock`、選擇對應 Bundle ID `phd.starry.clock`、確認銷售商及 App SKU。
- 建置成功後執行 `npx eas-cli@latest submit --platform ios --profile production`，依提示授權 App Store Connect API Key；**此動作僅上傳檔案，不是自動公開商店發布**。
- 在 TestFlight 指定內部／外部測試者，完成 iPhone/iPad 上倒數、提示音、全螢幕、橫豎屏、前景／背景及離線測試。
- 準備 App Store 螢幕截圖、介紹文案、支援 URL、可公開的隱私權政策 URL、App Privacy 問卷與內容分級；不得把資料保護／音效行為描述超過實際功能。
- 之後在 App Store Connect 選擇正式 build 並提交 App Review。審核通過及正式上架由 Apple 控制。

## 5. GitHub Actions iOS 自動建置（只手動、不自動上架）
- 現有 `.github/workflows/eas-build-ios.yml` 只提供手動觸發的 `ios-simulator` 或 `production` 建置。
- `production` 非互動 CI 之前必須完成 Apple 簽章與 Expo EAS 專案初始化，且 GitHub Secrets 需有 `EXPO_TOKEN`。
- 在 `Actions` 畫面選 `clock-ios-eas-manual` → Run workflow；**不會自動提交 App Store**。建置配額與 Apple 會員費以平台實際帳單為準。
- `pnpm-lock.yaml` 與 `extra.eas.projectId` 必須提交到 GitHub，否則預檢會擋下。

## 6. Starry ID 與資安限制
不修改 `starry-phd/id` 中央會員程式碼。Clock 可離線使用倒數計時；會員 OAuth 仍未完成中央正式登記，不能宣稱支援登入。

官方參考：
- https://docs.expo.dev/build/setup/
- https://docs.expo.dev/submit/ios/
- https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/
- https://developer.apple.com/tw/help/account/membership/program-enrollment
