#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://backend:8787}"
SMOKE_TELEGRAM_ID="${SMOKE_TELEGRAM_ID:-5700958253}"
SMOKE_INIT_DATA="${SMOKE_INIT_DATA:-guest}"
SMOKE_ALLOW_EMPTY_SHOPS="${SMOKE_ALLOW_EMPTY_SHOPS:-0}"

docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml \
  exec -T \
  -e SMOKE_BASE_URL="$SMOKE_BASE_URL" \
  -e SMOKE_TELEGRAM_ID="$SMOKE_TELEGRAM_ID" \
  -e SMOKE_INIT_DATA="$SMOKE_INIT_DATA" \
  -e SMOKE_ALLOW_EMPTY_SHOPS="$SMOKE_ALLOW_EMPTY_SHOPS" \
  backend \
  node /app/scripts/smoke-evotor-macmini.mjs
