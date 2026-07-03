#!/usr/bin/env bash
# Builds the self-contained Elastic Beanstalk deployment bundle:
#   next build (standalone) + static assets + seed SQLite DB + Procfile
#   + .platform hooks for persisting the DB outside the app directory.
# Output: deploy/out/beaten-eb-<git-sha>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR=deploy/out
STAGE="$OUT_DIR/stage"
SHA=$(git rev-parse --short HEAD 2>/dev/null || date +%s)
ZIP="beaten-eb-$SHA.zip"

rm -rf "$STAGE" && mkdir -p "$STAGE"

echo "==> next build (standalone)"
npm run build

echo "==> staging bundle"
cp -r .next/standalone/. "$STAGE/"
rm -f "$STAGE/.env"
mkdir -p "$STAGE/.next/static"
cp -r .next/static/. "$STAGE/.next/static/"
cp -r public "$STAGE/public"

echo "==> seed database"
SEED_DB="$(pwd)/$OUT_DIR/seed-beaten.db"
rm -f "$SEED_DB"
DATABASE_URL="file:$SEED_DB" npx prisma db push --skip-generate >/dev/null
cp "$SEED_DB" "$STAGE/seed-beaten.db"

echo "==> EB config (Procfile + platform hooks)"
cp deploy/Procfile "$STAGE/Procfile"
cp -r deploy/.platform "$STAGE/.platform"
chmod +x "$STAGE"/.platform/hooks/predeploy/*.sh

echo "==> zipping $ZIP"
(cd "$STAGE" && zip -qry "../$ZIP" .)
rm -rf "$STAGE"
echo "Bundle ready: $OUT_DIR/$ZIP"
