#!/usr/bin/env bash
# Builds the Lightsail deployment tarball:
#   next build (standalone) + static assets + prisma schema/migrations.
# The instance applies migrations itself on install (prisma migrate deploy).
# Output: deploy/out/beaten-bundle.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."

OUT_DIR=deploy/out
STAGE="$OUT_DIR/lightsail-stage"
TARBALL="$OUT_DIR/beaten-bundle.tar.gz"

rm -rf "$STAGE" && mkdir -p "$STAGE"

echo "==> next build (standalone)"
npx prisma generate >/dev/null
npm run build

echo "==> staging bundle"
cp -r .next/standalone/. "$STAGE/"
# Never ship local secrets (.env, .env.local, ...) or the dev database.
rm -f "$STAGE"/.env* "$STAGE"/prisma/*.db "$STAGE"/prisma/*.db-journal
mkdir -p "$STAGE/.next/static" "$STAGE/prisma"
cp -r .next/static/. "$STAGE/.next/static/"
[ -d public ] && mkdir -p "$STAGE/public" && cp -r public/. "$STAGE/public/"
cp prisma/schema.prisma "$STAGE/prisma/"
cp -r prisma/migrations "$STAGE/prisma/"
git rev-parse --short HEAD > "$STAGE/REVISION" 2>/dev/null || true

# Support CLI (beaten-admin on the server), compiled against the app's lib code.
rm -rf "$OUT_DIR/admin"
npx tsc -p tsconfig.admin.json
cp -r "$OUT_DIR/admin" "$STAGE/admin"
# The CLI hashes passwords (create). The server bundles bcryptjs into its
# chunks, so the standalone output doesn't carry the package; ship it whole.
rm -rf "$STAGE/node_modules/bcryptjs"
cp -r node_modules/bcryptjs "$STAGE/node_modules/bcryptjs"

if ! ls "$STAGE"/node_modules/.prisma/client/*debian-openssl-3.0.x* >/dev/null 2>&1; then
  echo "Linux Prisma engine missing from bundle (check binaryTargets)" >&2
  exit 1
fi
# Every package the admin CLI requires must come from the bundle's own
# node_modules (the standalone build only keeps what the server traced), not
# from this checkout's, which Node would otherwise fall back to.
node -e '
  const fs = require("fs"), path = require("path");
  const stage = path.resolve(process.argv[1]), missing = new Set();
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) return walk(f);
    if (!f.endsWith(".js")) return;
    for (const [, spec] of fs.readFileSync(f, "utf8").matchAll(/require\("([^".][^"]*)"\)/g)) {
      if (require("module").isBuiltin(spec)) continue;
      let hit = null;
      try { hit = require.resolve(spec, { paths: [path.dirname(f)] }); } catch {}
      if (!hit || !hit.startsWith(stage + path.sep)) missing.add(spec);
    }
  });
  walk(path.join(stage, "admin"));
  if (missing.size) {
    console.error("Admin CLI needs packages the bundle lacks: " + [...missing].join(", "));
    process.exit(1);
  }
' "$STAGE"

echo "==> packing $TARBALL"
tar czf "$TARBALL" -C "$STAGE" .
rm -rf "$STAGE"
shasum -a 256 "$TARBALL" | cut -d' ' -f1 > "$TARBALL.sha256"
echo "Bundle ready: $TARBALL ($(du -h "$TARBALL" | cut -f1))"
