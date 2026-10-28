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
# Copy the database first (some migrations rebuild tables); keep the last 5.
if [ -f "$DATA/beaten.db" ]; then
  mkdir -p "$DATA/backups"
  cp -p "$DATA/beaten.db" "$DATA/backups/beaten-$(date -u +%Y%m%dT%H%M%SZ).db"
  ls -1t "$DATA"/backups/beaten-*.db | tail -n +6 | xargs -r rm -f
  chown -R beaten:beaten "$DATA/backups"
  chmod 700 "$DATA/backups"
  chmod 600 "$DATA"/backups/*.db
fi
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

# Support CLI: `sudo beaten-admin <command>` (see docs/support-playbook.md).
# Runs as the app user with the app's environment, like the service.
cat > /usr/local/bin/beaten-admin <<'ADMIN'
#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run with sudo." >&2; exit 1; }
set -a; . /etc/beaten.env; set +a
export NODE_ENV=production
cd /opt/beaten/app
exec runuser -u beaten -- node admin/scripts/admin.js "$@"
ADMIN
chmod 755 /usr/local/bin/beaten-admin

mkdir -p /var/www/certbot
# Share-card cache (proxy_cache_path below); nginx creates only the last level.
mkdir -p /var/cache/nginx/beaten-cards
chown www-data:www-data /var/cache/nginx/beaten-cards

# Shared proxy settings. X-Forwarded-Host is overwritten, never passed
# through, so clients can't spoof the origin Auth.js sees.
cat > /etc/nginx/snippets/beaten-proxy.conf <<'NGINX'
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
NGINX

# Headers for every app response. Server actions accept POSTs on any page
# path, so framing is denied site-wide (clickjacking on settings forms).
cat > /etc/nginx/snippets/beaten-headers.conf <<'NGINX'
add_header X-Frame-Options DENY always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
NGINX

# App locations. Every POST is rate limited per IP (GETs never are): Next.js
# dispatches a server action to whatever page path it's posted to, so the
# stricter path-based limits below can't be the only line of defence.
# Per-account limits on password checks live in the app.
cat > /etc/nginx/snippets/beaten-app.conf <<'NGINX'
client_max_body_size 1m;
include snippets/beaten-headers.conf;

location = /api/auth/callback/credentials {
    limit_req zone=auth burst=5 nodelay;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}

# Pages whose server actions hash passwords or send email.
location ~ ^/(register|login|forgot-password|reset-password|verify-email|settings)$ {
    limit_req zone=register burst=5 nodelay;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}

# Share-card PNGs are the most expensive thing the app renders. Cache them
# (the URL fully determines the image; no cookies are involved) and rate
# limit misses-and-hits alike so query-string variations can't pin the CPU.
location ~ ^/u/[^/]+/card$ {
    limit_req zone=cardrate burst=20 nodelay;
    proxy_cache cardcache;
    proxy_cache_valid 200 10m;
    proxy_cache_valid 404 1m;
    proxy_cache_lock on;
    proxy_cache_use_stale updating error timeout;
    proxy_ignore_headers Set-Cookie;
    proxy_hide_header Set-Cookie;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}

location / {
    limit_req zone=posts burst=20 nodelay;
    include snippets/beaten-proxy.conf;
    proxy_pass http://127.0.0.1:3000;
}
NGINX

# For an apex domain (beaten.games), www.<domain> is served as a redirect
# once the certificate covers it.
WWW_DOMAIN=""
if [ -n "$BEATEN_DOMAIN" ] && [ "$(tr -cd . <<<"$BEATEN_DOMAIN" | wc -c)" -eq 1 ]; then
  WWW_DOMAIN="www.$BEATEN_DOMAIN"
fi
CERT="/etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem"

cert_covers() {
  [ -f "$CERT" ] && openssl x509 -in "$CERT" -noout -ext subjectAltName | grep -q "DNS:$1\b"
}

write_nginx() {
  local cert="$CERT"
  local www=""
  if [ -n "$WWW_DOMAIN" ] && cert_covers "$WWW_DOMAIN"; then www="$WWW_DOMAIN"; fi
  {
    cat <<'NGINX'
limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
map $request_method $auth_post_key {
    POST    $binary_remote_addr;
    default "";
}
limit_req_zone $auth_post_key zone=register:10m rate=10r/m;
limit_req_zone $auth_post_key zone=posts:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=cardrate:10m rate=30r/m;
proxy_cache_path /var/cache/nginx/beaten-cards levels=1:2 keys_zone=cardcache:10m max_size=200m inactive=1h use_temp_path=off;
limit_req_status 429;
server_tokens off;

NGINX
    if [ -n "$BEATEN_DOMAIN" ] && [ -f "$cert" ]; then
      cat <<NGINX
# Unknown hostnames (e.g. scanners hitting the bare IP) get dropped.
server {
    listen 80 default_server;
    listen 443 ssl http2 default_server;
    server_name _;
    ssl_reject_handshake on;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 444; }
}

server {
    listen 80;
    server_name $BEATEN_DOMAIN $www;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$BEATEN_DOMAIN\$request_uri; }
}

server {
    listen 443 ssl http2;  # nginx 1.24 (Ubuntu 24.04) predates 'http2 on;'
    server_name $BEATEN_DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$BEATEN_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    include snippets/beaten-app.conf;
}
NGINX
      if [ -n "$www" ]; then
        cat <<NGINX

server {
    listen 443 ssl http2;  # nginx 1.24 (Ubuntu 24.04) predates 'http2 on;'
    server_name $www;
    ssl_certificate     /etc/letsencrypt/live/$BEATEN_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$BEATEN_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;
    return 301 https://$BEATEN_DOMAIN\$request_uri;
}
NGINX
      fi
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

# Obtain (or expand) the certificate for names whose DNS already points at
# this box. Names that don't resolve here are skipped rather than attempted,
# which keeps failed validations from eating Let's Encrypt's rate limits.
# Renewals run from certbot's timer and reload nginx via the deploy hook.
points_here() {
  [ "$(getent ahostsv4 "$1" | awk 'NR==1{print $1}')" = "$MY_IP" ]
}
if [ -n "$BEATEN_DOMAIN" ]; then
  MY_IP=$(curl -fsS --max-time 10 https://checkip.amazonaws.com || true)
  names=()
  if points_here "$BEATEN_DOMAIN"; then
    names+=(-d "$BEATEN_DOMAIN")
    if [ -n "$WWW_DOMAIN" ] && points_here "$WWW_DOMAIN"; then names+=(-d "$WWW_DOMAIN"); fi
  fi
  want_www=$([ "${#names[@]}" -gt 2 ] && echo 1 || echo 0)
  if [ "${#names[@]}" -eq 0 ]; then
    echo "DNS for $BEATEN_DOMAIN doesn't point at $MY_IP yet — serving HTTP only"
  elif [ ! -f "$CERT" ] || { [ "$want_www" = 1 ] && ! cert_covers "$WWW_DOMAIN"; }; then
    if certbot certonly --webroot -w /var/www/certbot --cert-name "$BEATEN_DOMAIN" \
        "${names[@]}" --expand --non-interactive --agree-tos \
        --register-unsafely-without-email --deploy-hook "systemctl reload nginx"; then
      write_nginx
    else
      echo "certbot failed — serving HTTP only"
    fi
  fi
fi

echo "install complete ($(cat "$APP/REVISION" 2>/dev/null || echo unknown))"
