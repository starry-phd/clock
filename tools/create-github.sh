#!/usr/bin/env bash
set -euo pipefail

ORG='starry-phd'
REPO='clock'
TARGET="$ORG/$REPO"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v gh >/dev/null || { echo '請先安裝 GitHub CLI：brew install gh' >&2; exit 2; }
command -v git >/dev/null || { echo '請先安裝 Git' >&2; exit 2; }
LOGIN="$(gh api user --jq .login)"
echo "GitHub 登入帳號：$LOGIN；目標：$TARGET (PUBLIC)"

if [[ "$LOGIN" != 'yukidu' ]]; then
  echo 'GitHub CLI 登入帳號不是 yukidu，為避免推送到錯誤帳號而停止。' >&2
  exit 3
fi

if [[ ! -d .git ]]; then
  git init -b main
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != 'main' ]]; then
  echo "目前分支是 $CURRENT_BRANCH，請先切換至 main。" >&2
  exit 3
fi

# Do not publish common credential files to the public repository.
SENSITIVE="$(git ls-files --cached --others --exclude-standard | grep -Ei '(^|/)(\.env($|\.[^/]+$)|\.npmrc$|credentials\.json$|google-services\.json$|.*service.account.*\.json$|.*\.(pem|p8|p12|key)$)' | grep -Ev '\.env\.example$' || true)"
if [[ -n "$SENSITIVE" ]]; then
  echo '偵測到可能含憑證的檔案。公開儲存庫上傳已停止，請先檢查：' >&2
  echo "$SENSITIVE" >&2
  exit 4
fi

if git remote get-url origin >/dev/null 2>&1; then
  REMOTE="$(git remote get-url origin)"
  if [[ "$REMOTE" != "https://github.com/$TARGET.git" && "$REMOTE" != "git@github.com:$TARGET.git" ]]; then
    echo "origin 指向非預期儲存庫：$REMOTE，停止。" >&2
    exit 5
  fi
fi

if gh repo view "$TARGET" --json nameWithOwner >/dev/null 2>&1; then
  VISIBILITY="$(gh repo view "$TARGET" --json visibility --jq .visibility)"
  if [[ "$VISIBILITY" != 'PUBLIC' ]]; then
    echo "既有儲存庫 $TARGET 不是 PUBLIC，請先由管理者確認；本腳本不會自動更改權限。" >&2
    exit 6
  fi
  if ! git remote get-url origin >/dev/null 2>&1; then
    git remote add origin "https://github.com/$TARGET.git"
  fi
else
  # The repository is deliberately public as required by the project owner.
  gh repo create "$TARGET" --public --description 'Clock | Starry timer and clock (Expo + Cloudflare)' --source=. --remote=origin
fi

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  if ! git config user.name >/dev/null 2>&1; then git config user.name "$LOGIN"; fi
  if ! git config user.email >/dev/null 2>&1; then git config user.email 'yukidu@gmail.com'; fi
  git commit -m 'chore(clock): synchronize public GitHub project'
fi

git push --set-upstream origin main
OWNER="$(gh repo view "$TARGET" --json owner --jq .owner.login)"
VISIBILITY="$(gh repo view "$TARGET" --json visibility --jq .visibility)"
if [[ "$OWNER" != "$ORG" || "$VISIBILITY" != 'PUBLIC' ]]; then
  echo 'ERROR: GitHub owner/visibility verification failed' >&2
  exit 7
fi

echo "SUCCESS: https://github.com/$TARGET (PUBLIC)"
