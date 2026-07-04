#!/usr/bin/env bash
# Creates a Lightsail instance running Beaten from a PREBUILT bundle.
# Flat-rate pricing: the chosen bundle's monthly price is printed before
# anything is created. The app is built locally and shipped as a tarball
# (via a Lightsail bucket or any URL) — nothing is compiled on the
# instance, so the cheapest dual-stack instance size works.
#
# Requires lightsail:* permissions (see deploy/iam-lightsail-policy.json).
#
# Typical flow:
#   1. Build + upload the artifact (see deploy/README.md):
#        npm run build; stage standalone bundle; upload beaten-bundle.tar.gz
#        to a Lightsail bucket with public getObject access
#   2. BUNDLE_URL=https://<bucket>.s3.<region>.amazonaws.com/beaten-bundle.tar.gz \
#        ./deploy/deploy-lightsail.sh
#
# Env overrides:
#   BUNDLE_URL         URL of the prebuilt tarball (required)
#   LIGHTSAIL_BUNDLE   instance size id (default: cheapest dual-stack >= 1GB)
#   LIGHTSAIL_NAME     instance name (default beaten-prod)
#   DEPLOY_BRANCH      branch whose installer script the instance fetches
#   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET   enable live IGDB search
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${LIGHTSAIL_NAME:-beaten-prod}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
AZ="${LIGHTSAIL_AZ:-${REGION}a}"
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP:-beaten-ip}"
BUNDLE_URL="${BUNDLE_URL:?set BUNDLE_URL to the prebuilt tarball URL}"
INSTALLER_URL="https://raw.githubusercontent.com/SixtyTwoMike/beaten/$BRANCH/deploy/lightsail/install-from-bundle.sh"

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
echo "    artifact:  $BUNDLE_URL"

AUTH_SECRET=$(openssl rand -base64 32)
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

cat > /etc/beaten.env <<ENV
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
DATABASE_URL=file:/opt/beaten/data/beaten.db
AUTH_SECRET=$AUTH_SECRET
AUTH_TRUST_HOST=true
IGDB_MOCK=${IGDB_MOCK:-1}
TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID:-}
TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET:-}
ENV
chmod 600 /etc/beaten.env

cat > /etc/default/beaten-setup <<CONF
# Values are single-quoted so presigned-URL query separators (ampersands)
# survive being sourced by the bootstrap script.
BUNDLE_URL='$BUNDLE_URL'
INSTALLER_URL='$INSTALLER_URL'
CONF

cat > /usr/local/bin/beaten-bootstrap <<'BOOT'
#!/bin/bash
set -eux
source /etc/default/beaten-setup
export DEBIAN_FRONTEND=noninteractive
APT="apt-get -o DPkg::Lock::Timeout=300"

\$APT update
\$APT install -y nginx curl
if ! command -v node >/dev/null || [ "\$(node -v | cut -d. -f1)" != "v22" ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  \$APT install -y nodejs
fi

curl -fsSL --retry 5 "\$INSTALLER_URL" -o /usr/local/bin/beaten-install
chmod +x /usr/local/bin/beaten-install
/usr/local/bin/beaten-install "\$BUNDLE_URL"
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

echo "==> opening port 80"
aws lightsail open-instance-public-ports --instance-name "$NAME" \
  --port-info fromPort=80,toPort=80,protocol=TCP >/dev/null

echo "==> static IP"
aws lightsail allocate-static-ip --static-ip-name "$STATIC_IP_NAME" >/dev/null 2>&1 || true
aws lightsail attach-static-ip --static-ip-name "$STATIC_IP_NAME" \
  --instance-name "$NAME" >/dev/null
IP=$(aws lightsail get-static-ip --static-ip-name "$STATIC_IP_NAME" \
  --query 'staticIp.ipAddress' --output text)

if [ "${SKIP_HTTP_POLL:-0}" = "1" ]; then
  echo ""
  echo "Instance created. App will be at: http://$IP (allow ~3 min for setup)"
  exit 0
fi

echo "==> waiting for the app (setup usually takes ~3 min)"
for i in $(seq 1 30); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$IP/login" || true)
  if [ "$CODE" = "200" ]; then
    echo ""
    echo "Deployed: http://$IP"
    exit 0
  fi
  echo "   not up yet (http $CODE)"
  sleep 20
done

echo "App did not respond in time. Check /var/log/beaten-bootstrap.log via the" >&2
echo "Lightsail browser SSH console for instance '$NAME'." >&2
exit 1
