#!/usr/bin/env bash
# Runs ON the Lightsail instance (as root). Builds the app from /opt/beaten/src
# and (re)installs it under /opt/beaten/app with systemd + nginx.
# Idempotent: safe to run for both first install and updates.
set -euxo pipefail

SRC=/opt/beaten/src
APP=/opt/beaten/app
DATA=/opt/beaten/data

id beaten &>/dev/null || useradd -r -s /usr/sbin/nologin beaten
mkdir -p "$DATA"

cd "$SRC"
npm ci
npx prisma generate
npm run build

# Sync the SQLite schema (additive changes apply cleanly; destructive ones
# intentionally fail rather than drop data).
set -a
source /etc/beaten.env
set +a
npx prisma db push --skip-generate

rm -rf "$APP"
mkdir -p "$APP/.next/static"
cp -r .next/standalone/. "$APP/"
cp -r .next/static/. "$APP/.next/static/"
cp -r public "$APP/public"
rm -f "$APP/.env"
chown -R beaten:beaten "$DATA"

cat > /etc/systemd/system/beaten.service <<'UNIT'
[Unit]
Description=Beaten game tracker
After=network.target

[Service]
User=beaten
EnvironmentFile=/etc/beaten.env
WorkingDirectory=/opt/beaten/app
ExecStart=/usr/bin/node /opt/beaten/app/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable beaten
systemctl restart beaten

cat > /etc/nginx/sites-available/beaten <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/beaten /etc/nginx/sites-enabled/beaten
systemctl restart nginx

echo "install complete"
