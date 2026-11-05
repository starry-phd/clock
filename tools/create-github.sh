#!/usr/bin/env bash
set -euo pipefail
ORG='starry-phd'
REPO='clock'
TARGET="$ORG/$REPO"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v gh >/dev/null || { echo '請先安裝 GitHub CLI gh'; exit 2; }
command -v git >/dev/null || { echo '請先安裝 git'; exit 2; }
LOGIN="$(gh api user --jq .login)"
echo "登入 GitHub：$LOGIN；目的地：$TARGET (private)"
if [[ "$LOGIN" != 'yukidu' ]]; then
  echo '目前 gh 登入帳號不是 yukidu；為避免存入錯誤帳號，停止。' >&2
  exit 3
fi
if [[ ! -d .git ]]; then
  git init -b main
fi
if [[ -n "$(git status --porcelain)" ]]; then
  if ! git config user.name >/dev/null 2>&1; then git config user.name "$LOGIN"; fi
  if ! git config user.email >/dev/null 2>&1; then git config user.email 'yukidu@gmail.com'; fi
  git add .
  git commit -m 'feat(clock): initialize Expo Android and Cloudflare PWA monorepo'
fi
# --source ensures the owner is the organization, not the user.
if gh repo view "$TARGET" --json nameWithOwner >/dev/null 2>&1; then
  echo "儲存庫 $TARGET 已存在，將驗證為 Private 後推送（不覆寫遠端歷史）。"
  existing_visibility="$(gh repo view "$TARGET" --json visibility --jq .visibility)"
  [[ "$existing_visibility" == 'PRIVATE' ]] || { echo 'GitHub Repo 不是 Private，停止。' >&2; exit 4; }
  if git remote get-url origin >/dev/null 2>&1; then
    [[ "$(git remote get-url origin)" == "https://github.com/$TARGET.git" ]] || { echo 'origin 指向其他 Repo，停止。' >&2; exit 5; }
  else
    git remote add origin "https://github.com/$TARGET.git"
  fi
  git push --set-upstream origin main
else
  gh repo create "$TARGET" --private --description 'Clock | Starry timer and clock (Expo + Cloudflare)' --source=. --remote=origin --push
fi
REPO_OWNER="$(gh repo view "$TARGET" --json owner --jq .owner.login)"
VISIBILITY="$(gh repo view "$TARGET" --json visibility --jq .visibility)"
if [[ "$REPO_OWNER" != "$ORG" || "$VISIBILITY" != 'PRIVATE' ]]; then
  echo 'CRITICAL: Repo owner or privacy verification failed' >&2
  exit 4
fi
echo "已建立並推送：https://github.com/$TARGET"
