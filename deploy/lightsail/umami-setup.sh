#!/usr/bin/env bash
# Umami analytics on the Beaten box (run by deploy/umami.sh, as root).
# Idempotent. Umami v3 + Postgres in Docker, listening on 127.0.0.1:3100
# only; nginx serves the dashboard at stats.<domain> and the tracker
# first-party at <domain>/a/ (install-from-bundle.sh). Memory is capped so
# a spike hits these containers, not Beaten, and a swap file gives the
# 1 GB instance some room.
#
# stdin: UMAMI_ADMIN_PASSWORD=... (the dashboard password to set; only used
# the first time). Prints UMAMI_WEBSITE_ID=... for beaten.games.
set -euo pipefail
UMAMI_VERSION=3.4.0
read -r line || true
ADMIN_PASSWORD="${line#UMAMI_ADMIN_PASSWORD=}"

if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  echo "==> adding 2 GB swap" >&2
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-beaten-swap.conf
  sysctl -q -p /etc/sysctl.d/90-beaten-swap.conf
fi

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  echo "==> installing Docker" >&2
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 >/dev/null
  systemctl enable --now docker >/dev/null
fi

mkdir -p /opt/umami
cd /opt/umami
umask 077
if [ ! -f .env ]; then
  {
    echo "APP_SECRET=$(openssl rand -hex 32)"
    echo "TWO_FACTOR_ENCRYPTION_KEY=$(openssl rand -hex 32)"
    echo "DB_PASSWORD=$(openssl rand -hex 24)"
  } > .env
fi
cat > docker-compose.yml <<YAML
services:
  umami:
    image: ghcr.io/umami-software/umami:$UMAMI_VERSION
    ports:
      - "127.0.0.1:3100:3000"
    environment:
      DATABASE_URL: postgresql://umami:\${DB_PASSWORD}@db:5432/umami
      APP_SECRET: \${APP_SECRET}
      TWO_FACTOR_ENCRYPTION_KEY: \${TWO_FACTOR_ENCRYPTION_KEY}
      DISABLE_TELEMETRY: "1"
      NODE_OPTIONS: --max-old-space-size=256
    depends_on:
      db:
        condition: service_healthy
    init: true
    restart: always
    mem_limit: 400m
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:3000/api/heartbeat"]
      interval: 10s
      timeout: 5s
      retries: 10
  db:
    image: postgres:15-alpine
    command: ["postgres", "-c", "shared_buffers=32MB", "-c", "max_connections=20"]
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami
      POSTGRES_PASSWORD: \${DB_PASSWORD}
    volumes:
      - umami-db-data:/var/lib/postgresql/data
    restart: always
    mem_limit: 200m
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U umami -d umami"]
      interval: 5s
      timeout: 5s
      retries: 10
volumes:
  umami-db-data:
YAML
echo "==> starting Umami $UMAMI_VERSION" >&2
docker compose pull -q
docker compose up -d >&2

for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:3100/api/heartbeat >/dev/null && break
  sleep 3
done
curl -fs http://127.0.0.1:3100/api/heartbeat >/dev/null || { echo "Umami didn't come up" >&2; docker compose logs --tail 40 umami >&2; exit 1; }

api() { # method path [json] — with the admin token once logged in
  curl -fsS -X "$1" "http://127.0.0.1:3100$2" -H 'Content-Type: application/json' ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"}
}
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);const r=(process.argv[1]).split(".").reduce((o,k)=>o?.[k],v);process.stdout.write(r==null?"":String(r))})' "$1"; }

# First run: replace the default admin/umami password.
TOKEN=""
if TOKEN=$(api POST /api/auth/login '{"username":"admin","password":"umami"}' 2>/dev/null | json token) && [ -n "$TOKEN" ]; then
  [ ${#ADMIN_PASSWORD} -ge 12 ] || { echo "Need UMAMI_ADMIN_PASSWORD (12+ characters) on stdin" >&2; exit 1; }
  echo "==> setting the admin password" >&2
  api POST /api/me/password "$(node -e 'process.stdout.write(JSON.stringify({currentPassword:"umami",newPassword:process.argv[1]}))' "$ADMIN_PASSWORD")" >/dev/null
fi
TOKEN=$(api POST /api/auth/login "$(node -e 'process.stdout.write(JSON.stringify({username:"admin",password:process.argv[1]}))' "$ADMIN_PASSWORD")" | json token)
[ -n "$TOKEN" ] || { echo "Couldn't sign in to Umami" >&2; exit 1; }

DOMAIN=$(sed -n 's/^BEATEN_DOMAIN=//p' /etc/beaten.env)
ID=$(api GET "/api/websites?search=$DOMAIN" | json "data.0.id")
if [ -z "$ID" ]; then
  echo "==> adding website $DOMAIN" >&2
  ID=$(api POST /api/websites "{\"name\":\"Beaten\",\"domain\":\"$DOMAIN\"}" | json id)
fi
echo "UMAMI_WEBSITE_ID=$ID"
