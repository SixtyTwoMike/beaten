#!/usr/bin/env bash
# Creates (or reports on) a Lightsail instance running Beaten.
# Flat-rate pricing: the chosen bundle's monthly price is printed before
# anything is created. The instance clones this repo (public) and builds
# on-box, so there is nothing else to pay for — one instance, one price.
#
# Requires lightsail:* permissions (see deploy/iam-lightsail-policy.json).
#
# Env overrides:
#   LIGHTSAIL_BUNDLE   bundle id (default: cheapest Linux bundle with >= 1GB RAM)
#   LIGHTSAIL_NAME     instance name (default beaten-prod)
#   DEPLOY_BRANCH      git branch to deploy (default: current branch)
#   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET   enable live IGDB search
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="${LIGHTSAIL_NAME:-beaten-prod}"
REGION="${AWS_DEFAULT_REGION:-us-east-1}"
AZ="${LIGHTSAIL_AZ:-${REGION}a}"
BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
REPO_URL="https://github.com/SixtyTwoMike/beaten.git"
STATIC_IP_NAME="${LIGHTSAIL_STATIC_IP:-beaten-ip}"

BLUEPRINT=$(aws lightsail get-blueprints \
  --query "blueprints[?platform=='LINUX_UNIX' && contains(blueprintId,'ubuntu_24')] | [0].blueprintId" \
  --output text)

if [ -n "${LIGHTSAIL_BUNDLE:-}" ]; then
  BUNDLE="$LIGHTSAIL_BUNDLE"
else
  # Cheapest dual-stack Linux bundle with at least 1 GB RAM (needed for the
  # on-box build). IPv6-only bundles are $2/mo cheaper but can't attach a
  # static IPv4 and can't reach GitHub (no IPv6 there), so they're excluded.
  BUNDLE=$(aws lightsail get-bundles --query \
    "sort_by(bundles[?contains(supportedPlatforms, 'LINUX_UNIX') && ramSizeInGb >= \`1.0\` && !contains(bundleId, 'ipv6')], &price) | [0].bundleId" \
    --output text)
fi
PRICE=$(aws lightsail get-bundles \
  --query "bundles[?bundleId=='$BUNDLE'].price | [0]" --output text)

echo "==> plan: instance '$NAME' in $AZ"
echo "    blueprint: $BLUEPRINT"
echo "    bundle:    $BUNDLE — \$$PRICE/month flat"
echo "    branch:    $BRANCH"

AUTH_SECRET=$(openssl rand -base64 32)
UD=$(mktemp)
cat > "$UD" <<USERDATA
#!/bin/bash
set -eux
exec > /var/log/beaten-bootstrap.log 2>&1
# swap so the Next.js build fits in a small instance
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
mkdir -p /opt/beaten
git clone --branch $BRANCH --depth 1 $REPO_URL /opt/beaten/src
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
bash /opt/beaten/src/deploy/lightsail/install.sh
USERDATA

echo "==> creating instance"
aws lightsail create-instances --instance-names "$NAME" \
  --availability-zone "$AZ" --blueprint-id "$BLUEPRINT" --bundle-id "$BUNDLE" \
  --user-data "file://$UD" --tags key=app,value=beaten >/dev/null
rm -f "$UD"

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

echo "==> waiting for the app (first boot installs Node and builds — usually 5-10 min)"
for i in $(seq 1 60); do
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
