#!/bin/bash
# Runs on the Ubuntu server over SSH. Called by .github/workflows/deploy.yml.
# Does not replace backend/.env, backend/src/.env, or the embedding cache.
set -euo pipefail

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
fi
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

LIVE_BACKEND=/home/ubuntu/backend
DIST_STAGE=/home/ubuntu/Hiro-frontend-dist

if [ ! -d "$LIVE_BACKEND" ]; then
  echo "Missing $LIVE_BACKEND"
  exit 1
fi
if [ ! -d "$DIST_STAGE" ]; then
  echo "Missing $DIST_STAGE"
  exit 1
fi

resolve_web_root() {
  if [ -n "${DEPLOY_WEB_ROOT:-}" ]; then
    printf '%s' "$DEPLOY_WEB_ROOT"
    return
  fi
  local conf
  conf=$(grep -Rsl "app.hiro.co.il" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -1 || true)
  if [ -n "$conf" ]; then
    awk '/^[[:space:]]*root[[:space:]]+/ { gsub(/;/, "", $2); print $2; exit }' "$conf"
  fi
}

WEB_ROOT="$(resolve_web_root)"
case "$WEB_ROOT" in
  ""|/*)
    ;;
  *)
    echo "Frontend folder must be an absolute path, got: ${WEB_ROOT:-<empty>}"
    exit 1
    ;;
esac
case "$WEB_ROOT" in
  /|/home|/home/ubuntu|/home/ubuntu/backend|/home/ubuntu/Hiro-frontend-dist)
    echo "Refusing to replace $WEB_ROOT. Set the DEPLOY_WEB_ROOT secret to the Nginx folder for app.hiro.co.il."
    exit 1
    ;;
esac
if [ ! -d "$WEB_ROOT" ]; then
  echo "Frontend folder does not exist: $WEB_ROOT"
  echo "Set the DEPLOY_WEB_ROOT secret to the Nginx root for app.hiro.co.il."
  exit 1
fi

echo "Installing backend dependencies in $LIVE_BACKEND"
cd "$LIVE_BACKEND"
npm install

echo "Publishing frontend to $WEB_ROOT"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete "$DIST_STAGE/" "$WEB_ROOT/"
else
  find "$WEB_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$DIST_STAGE/." "$WEB_ROOT/"
fi

echo "Restarting PM2"
command -v pm2 >/dev/null 2>&1 || { echo "pm2 is not on PATH"; exit 1; }
pm2 restart server
if pm2 describe ingest >/dev/null 2>&1; then
  pm2 restart ingest
fi
pm2 save
echo "Deploy finished"
