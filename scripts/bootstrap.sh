#!/usr/bin/env bash
# One-shot bootstrap: authenticate GitHub CLI, wire the remote, push the site.
# Run once after creating the repo's Personal Access Token.
#
#   bash scripts/bootstrap.sh
#
# Requires: gh CLI (installed via winget), git
set -euo pipefail

REPO_SLUG="bennymak01/globe-hk"
SITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Authenticating with GitHub"
if ! gh auth status >/dev/null 2>&1; then
  echo "No existing auth found."
  echo "Create a token at: https://github.com/settings/tokens/new"
  echo "  Scopes: repo (read/write) + workflow"
  echo "  Then run:  gh auth login --with-token < token.txt"
  echo "  Or paste it now:"
  read -rsp "Paste your token: " TOKEN; echo
  printf '%s' "$TOKEN" | gh auth login --hostname github.com --with-token
  gh auth setup-git
fi

echo "==> Configuring git identity"
cd "$SITE_DIR"
git config user.name "Benny Mak"
git config user.email "bennymak01@users.noreply.github.com"

echo "==> Setting remote"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/$REPO_SLUG.git"
else
  git remote add origin "https://github.com/$REPO_SLUG.git"
fi

echo "==> Committing"
git add -A
git commit -m "feat: initial project brief + globe.hk one-page demo" || echo "(nothing to commit)"

echo "==> Pushing"
git branch -M main
git push -u origin main

echo
echo "Done. Next:"
echo "  1. Clone into Astro:  npx create astro@latest --template minimal  (or hand this repo to Claude Code)"
echo "  2. Enable Cloudflare Pages on $REPO_SLUG"
echo "  3. Run the catalogue sync workflow: gh workflow run sync-catalogue.yml"
