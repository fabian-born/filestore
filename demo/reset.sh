#!/bin/bash
# Wipes the demo stack's state (MinIO bucket + app database) and restarts it
# clean. Intended to be run periodically (see filestore-demo-reset.timer) so
# the public demo never accumulates other people's uploads.
set -euo pipefail

cd "$(dirname "$0")"

echo "[$(date -Is)] Resetting filestore demo stack..."
docker compose -f docker-compose.demo.yml down -v
docker compose -f docker-compose.demo.yml up -d
echo "[$(date -Is)] Demo stack reset complete."
