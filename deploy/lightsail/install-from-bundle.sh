#!/usr/bin/env bash
# Runs ON the Lightsail instance (as root). Installs a prebuilt standalone
# bundle under /opt/beaten/app, applies database migrations, and configures
# systemd + nginx (HTTPS once a certificate for BEATEN_DOMAIN exists).
# Usage: install-from-bundle.sh <bundle-url> [sha256]
#   (idempotent; also used for updates; file:// URLs work)
set -euxo pipefail

BUNDLE_URL="${1:?usage: install-from-bundle.sh <bundle-url> [sha256]}"
BUNDLE_SHA256="${2:-}"
APP=/opt/beaten/app
DATA=/opt/beaten/data
PRISMA_VERSION=6.19.3

# BEATEN_DOMAIN (optional) lives alongside the app's env.
BEATEN_DOMAIN=$(sed -n 's/^BEATEN_DOMAIN=//p' /etc/beaten.env || true)

id beaten &>/dev/null || useradd -r -m -d /opt/beaten/home -s /usr/sbin/nologin beaten
mkdir -p "$DATA"
chmod 700 "$DATA"
chown beaten:beaten "$DATA"

TMP=$(mktemp -d)
curl -fSL --retry 5 --retry-delay 5 -o "$TMP/bundle.tar.gz" "$BUNDLE_URL"
if [ -n "$BUNDLE_SHA256" ]; then
  echo "$BUNDLE_SHA256  $TMP/bundle.tar.gz" | sha256sum -c -
fi
rm -rf "$APP.new"
mkdir -p "$APP.new"
tar xzf "$TMP/bundle.tar.gz" -C "$APP.new"
rm -rf "$TMP"

# Apply schema migrations (creates the database on first install). Runs as
# the app user so the db stays owned by it; existing data is never dropped.
set -a; . /etc/beaten.env; set +a
# npx resolves from the working directory, which must be readable by beaten.
cd /opt/beaten/home
sudo -u beaten -H env DATABASE_URL="$DATABASE_URL" \
  npx --yes "prisma@$PRISMA_VERSION" migrate deploy --schema "$APP.new/prisma/schema.prisma"
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

mkdir -p /var/www/certbot

# Shared proxy settings. X-Forwarded-Host is overwritten, never passed
# through, so clients can't spoof the origin Auth.js sees.
cat > /etc/nginx/snippets/beaten-proxy.conf <<'NGINX'
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
NGINX

# App locations. Sign-in posts and registration (a server-action POST to
# /register) are rate limited; GETs never are.
cat > /etc/nginx/snippets/beaten-app.conf <<'NGINX'
client_max_body_size 1m;

location = /api/auth/callback/credentials {
    limit_req zone=auth burst=5 nodelay;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}

location = /register {
    limit_req zone=register burst=5 nodelay;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}

location / {
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}
NGINX

write_nginx() {
  local cert="/etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem"
  {
    cat <<'NGINX'
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
map $request_method $auth_post_key {
    POST    $binary_remote_addr;
    default "";
}
limit_req_zone $auth_post_key zone=register:10m rate=10r/m;
limit_req_status 429;

NGINX
    if [ -n "$BEATEN_DOMAIN" ] && [ -f "$cert" ]; then
      cat <<NGINX
# Unknown hostnames (e.g. scanners hitting the bare IP) get dropped.
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 444; }
}

server {
    listen 80;
    server_name $BEATEN_DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name $BEATEN_DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$BEATEN_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    include snippets/beaten-app.conf;
}
NGINX
    else
      cat <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    include snippets/beaten-app.conf;
}
NGINX
    fi
  } > /etc/nginx/sites-available/beaten
  rm -f /etc/nginx/sites-enabled/default
  ln -sf /etc/nginx/sites-available/beaten /etc/nginx/sites-enabled/beaten
  nginx -t
  systemctl reload-or-restart nginx
}

write_nginx

# Obtain a certificate once DNS for BEATEN_DOMAIN points here; until then this
# fails harmlessly and the site stays on HTTP. Renewals run from certbot's
# timer and reload nginx via the deploy hook.
if [ -n "$BEATEN_DOMAIN" ] && [ ! -f "/etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem" ]; then
  if certbot certonly --webroot -w /var/www/certbot -d "$BEATEN_DOMAIN" \
      --non-interactive --agree-tos --register-unsafely-without-email \
      --deploy-hook "systemctl reload nginx"; then
    write_nginx
  else
    echo "certbot failed (DNS not pointing here yet?) — serving HTTP only"
  fi
fi

echo "install complete ($(cat "$APP/REVISION" 2>/dev/null || echo unknown))"
