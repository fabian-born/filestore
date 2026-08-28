#!/bin/bash
# Builds the backend and frontend containers and pushes them to GHCR.
# Version format: yyyy.mm.dd-buildid — buildid increments on every build,
# and resets to 1 as soon as the date changes.
set -euo pipefail

cd "$(dirname "$0")"

REGISTRY="${REGISTRY:-ghcr.io/fabian-born}"
export REGISTRY
TODAY=$(date +"%Y.%m.%d")

if [[ -f VERSION ]]; then
  PREV_VERSION=$(cat VERSION)
else
  PREV_VERSION=""
fi

PREV_DATE="${PREV_VERSION%-*}"
PREV_BUILD="${PREV_VERSION##*-}"

if [[ "$PREV_DATE" == "$TODAY" && "$PREV_BUILD" =~ ^[0-9]+$ ]]; then
  BUILD_ID=$((PREV_BUILD + 1))
else
  BUILD_ID=1
fi

APP_VERSION="${TODAY}-${BUILD_ID}"
echo "$APP_VERSION" > VERSION
export APP_VERSION

echo "Building version $APP_VERSION"
docker compose build

for image in filestore-backend filestore-frontend; do
  docker tag "$REGISTRY/$image:$APP_VERSION" "$REGISTRY/$image:latest"
done

for image in filestore-backend filestore-frontend; do
  docker push "$REGISTRY/$image:$APP_VERSION"
  docker push "$REGISTRY/$image:latest"
done

echo "Pushed $REGISTRY/filestore-backend and filestore-frontend as $APP_VERSION and latest"
