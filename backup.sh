#!/bin/bash
# Triggers an online backup of shares.db inside the running backend
# container (safe while the app is up - see backend/scripts/backup-db.js).
# Intended to run on a schedule; see filestore-backup.timer.
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
SERVICE="webtools-fileexplorer-backend"

docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE" npm run backup
