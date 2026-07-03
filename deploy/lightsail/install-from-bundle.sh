#!/usr/bin/env bash
# Runs ON the Lightsail instance (as root). Downloads a prebuilt standalone
# bundle and (re)installs the app under /opt/beaten/app with systemd + nginx.
# No compilation happens on the instance, so this works on 1 GB instances.
# Usage: install-from-bundle.sh <bundle-url>   (idempotent; also used for updates)
set -euxo pipefail

BUNDLE_URL="${1:?usage: install-from-bundle.sh <bundle-url>}"
APP=/opt/beaten/app
DATA=/opt/beaten/data

id beaten &>/dev/null || useradd -r -s /usr/sbin/nologin beaten
mkdir -p "$DATA"

TMP=$(mktemp -d)
curl -fSL --retry 5 --retry-delay 5 -o "$TMP/bundle.tar.gz" "$BUNDLE_URL"
rm -rf "$APP.new"
mkdir -p "$APP.new"
tar xzf "$TMP/bundle.tar.gz" -C "$APP.new"
rm -rf "$TMP"

# First boot: seed an empty database. Never overwrite an existing one.
[ -f "$DATA/beaten.db" ] || cp "$APP.new/seed-beaten.db" "$DATA/beaten.db"
chown -R beaten:beaten "$DATA"

rm -rf "$APP"
mv "$APP.new" "$APP"

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
