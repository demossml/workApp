#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$ROOT_DIR"

docker compose --env-file deploy/macmini/.env -f deploy/macmini/docker-compose.yml up -d --build
pnpm -C packages/backend db:apply-local
