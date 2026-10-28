#!/usr/bin/env bash
# Creates a Lightsail instance running Beaten from a PREBUILT bundle.
# Flat-rate pricing: the chosen bundle's monthly price is printed before
# anything is created. The app is built locally and shipped as a tarball
# (via a Lightsail bucket or any URL) — nothing is compiled on the
# instance, so the cheapest dual-stack instance size works.
#
# Requires lightsail:* permissions (see deploy/iam-lightsail-policy.json).
#
# Usage:
#   BEATEN_DOMAIN=beaten.example.com ./deploy/deploy-lightsail.sh
#
# Creates the instance, then hands off to deploy/push-lightsail.sh, which
# uploads the bundle + installer over SSH (no bucket, no GitHub fetch) and
# copies IGDB credentials from your local .env. Point an A record for
# BEATEN_DOMAIN at the printed static IP, then re-run push-lightsail.sh to
# obtain the HTTPS certificate.
#
# Env overrides:
#   BEATEN_DOMAIN      public hostname (required; used for HTTPS + AUTH_URL)
#   LIGHTSAIL_BUNDLE   instance size id (default: cheapest dual-stack >= 1GB)
#   LIGHTSAIL_NAME     instance name (default beaten-prod)
#   AWS_DEFAULT_REGION region (default: your AWS CLI region)
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${LIGHTSAIL_NAME:-beaten-prod}"
REGION="${AWS_DEFAULT_REGION:-$(aws configure get region || echo us-east-1)}"
export AWS_DEFAULT_REGION="$REGION"
AZ="${LIGHTSAIL_AZ:-${REGION}a}"
STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP:-beaten-ip}"
DOMAIN="${BEATEN_DOMAIN:?set BEATEN_DOMAIN to the public hostname}"

if aws lightsail get-instance --instance-name "$NAME" >/dev/null 2>&1; then
  echo "Instance '$NAME' already exists — use deploy/push-lightsail.sh to update it." >&2
  exit 1
fi

BLUEPRINT=$(aws lightsail get-blueprints \
  --query "blueprints[?platform=='LINUX_UNIX' && contains(blueprintId,'ubuntu_24')] | [0].blueprintId" \
  --output text)

if [ -n "${LIGHTSAIL_BUNDLE:-}" ]; then
  BUNDLE="$LIGHTSAIL_BUNDLE"
else
  # Cheapest dual-stack Linux bundle with at least 1 GB RAM. IPv6-only
  # bundles are $2/mo cheaper but can't attach a static IPv4 and can't
  # reach GitHub (no IPv6 there), so they're excluded.
  BUNDLE=$(aws lightsail get-bundles --query \
    "sort_by(bundles[?contains(supportedPlatforms, 'LINUX_UNIX') && ramSizeInGb >= \`1.0\` && !contains(bundleId, 'ipv6')], &price) | [0].bundleId" \
    --output text)
fi
PRICE=$(aws lightsail get-bundles \
  --query "bundles[?bundleId=='$BUNDLE'].price | [0]" --output text)

echo "==> plan: instance '$NAME' in $AZ"
echo "    blueprint: $BLUEPRINT"
echo "    bundle:    $BUNDLE — \$$PRICE/month flat"
echo "    domain:    https://$DOMAIN"

mkdir -p deploy/out
UD=deploy/out/user-data.sh

# The bootstrap runs as a retrying systemd service rather than inline in
# user-data: first boot on Ubuntu races unattended-upgrades for the dpkg
# lock, and any transient apt/network failure would otherwise strand the
# instance half-configured. The service retries every 30s until it succeeds.
cat > "$UD" <<USERDATA
#!/bin/bash
set -eu
exec > /var/log/beaten-userdata.log 2>&1

# AUTH_SECRET is generated here on the instance (not embedded in user-data,
# which is readable from instance metadata) and the env file is private
# from the moment it's created.
umask 077
cat > /etc/beaten.env <<ENV
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
DATABASE_URL=file:/opt/beaten/data/beaten.db
BEATEN_DOMAIN=$DOMAIN
AUTH_URL=https://$DOMAIN
AUTH_SECRET=\$(openssl rand -base64 32)
AUTH_TRUST_HOST=true
IGDB_MOCK=1
ENV
chmod 600 /etc/beaten.env
umask 022


cat > /usr/local/bin/beaten-bootstrap <<'BOOT'
#!/bin/bash
set -eux
export DEBIAN_FRONTEND=noninteractive
APT="apt-get -o DPkg::Lock::Timeout=300"

\$APT update
\$APT install -y nginx curl certbot
if ! command -v node >/dev/null || [ "\$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  \$APT install -y nodejs
fi

# The app itself is installed by deploy/push-lightsail.sh over SSH once this
# base setup has finished.
touch /var/lib/beaten-base-ready
systemctl disable beaten-setup.service
BOOT
chmod +x /usr/local/bin/beaten-bootstrap

cat > /etc/systemd/system/beaten-setup.service <<'UNIT'
[Unit]
Description=Beaten first-time setup (retries until it succeeds)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/beaten-bootstrap
StandardOutput=append:/var/log/beaten-bootstrap.log
StandardError=append:/var/log/beaten-bootstrap.log
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable beaten-setup.service
systemctl start beaten-setup.service --no-block
USERDATA

echo "==> creating instance"
aws lightsail create-instances --instance-names "$NAME" \
  --availability-zone "$AZ" --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" \
  --user-data "file://$UD" --tags key=app,value=beaten >/dev/null

echo "==> waiting for instance to run"
for i in $(seq 1 30); do
  STATE=$(aws lightsail get-instance --instance-name "$NAME" \
    --query 'instance.state.name' --output text)
  echo "   $STATE"
  [ "$STATE" = "running" ] && break
  sleep 10
done

echo "==> opening ports 80 + 443"
aws lightsail open-instance-public-ports --instance-name "$NAME" \
  --port-info fromPort=80,toPort=80,protocol=TCP >/dev/null
aws lightsail open-instance-public-ports --instance-name "$NAME" \
  --port-info fromPort=443,toPort=443,protocol=TCP >/dev/null

echo "==> static IP"
aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1 || true
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" \
  --instance-name "$NAME" >/dev/null
IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" \
  --query 'staticIp.ipAddress' --output text)

echo "==> static IP: $IP"
echo "==> installing the app (waits for base setup, ~3 min)"
LIGHTSAIL_NAME="$NAME" ./deploy/push-lightsail.sh

cat <<DONE

Instance '$NAME' is up at http://$IP

Next: add a DNS A record  $DOMAIN -> $IP
then run  ./deploy/push-lightsail.sh --no-build  to obtain the HTTPS certificate.
DONE
