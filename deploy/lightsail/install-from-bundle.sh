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
chmod 700 "$DATA"

TMP=$(mktemp -d)
curl -fSL --retry 5 --retry-delay 5 -o "$TMP/bundle.tar.gz" "$BUNDLE_URL"
rm -rf "$APP.new"
mkdir -p "$APP.new"
tar xzf "$TMP/bundle.tar.gz" -C "$APP.new"
rm -rf "$TMP"

# First boot: seed an empty database. Never overwrite an existing one.
[ -f "$DATA/beaten.db" ] || cp "$APP.new/seed-beaten.db" "$DATA/beaten.db"
chown -R beaten:beaten "$DATA"
chmod 600 "$DATA"/beaten.db*

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
# Throttle password guessing and bcrypt-heavy requests: sign-in posts and
# registration (a server-action POST to /register). GETs are never limited.
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
map $request_method $auth_post_key {
    POST    $binary_remote_addr;
    default "";
}
limit_req_zone $auth_post_key zone=register:10m rate=10r/m;
limit_req_status 429;

server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 1m;

    proxy_set_header Host $host;
    # Overwrite, never pass through, so clients can't spoof the origin Auth.js sees.
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    location = /api/auth/callback/credentials {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }

    location = /register {
        limit_req zone=register burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
NGINX
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/beaten /etc/nginx/sites-enabled/beaten
nginx -t
systemctl restart nginx

echo "install complete"
