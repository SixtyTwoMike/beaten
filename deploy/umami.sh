#!/usr/bin/env bash
# Set up (or update) Umami analytics on the Lightsail box. Run from the
# repo root on your Mac:
#
#   ./deploy/umami.sh
#
# The dashboard password is generated once and kept in .env
# (UMAMI_ADMIN_PASSWORD, gitignored); it's sent over SSH stdin, never on a
# command line. The dashboard is https://stats.<domain> once a DNS A record
# for stats.<domain> points at the box and push-lightsail.sh has run.
set -euo pipefail
cd "$(dirname "$0")/.."

touch .env
if ! grep -q '^UMAMI_ADMIN_PASSWORD=' .env; then
  printf "\n# Umami dashboard (admin) at https://stats.beaten.games\nUMAMI_ADMIN_PASSWORD='%s'\n" "$(openssl rand -base64 18 | tr -d '/+=')" >> .env
fi
PASSWORD=$(sed -n "s/^UMAMI_ADMIN_PASSWORD=//p" .env | tail -1 | sed -E "s/^'(.*)'$/\1/")

# shellcheck source=deploy/lightsail-ssh.sh
. deploy/lightsail-ssh.sh

scp -q "${SSH_OPTS[@]}" deploy/lightsail/umami-setup.sh "$TARGET:umami-setup.sh"
OUT=$(printf 'UMAMI_ADMIN_PASSWORD=%s\n' "$PASSWORD" | ssh "${SSH_OPTS[@]}" "$TARGET" "sudo bash umami-setup.sh")
ID=$(printf '%s\n' "$OUT" | sed -n 's/^UMAMI_WEBSITE_ID=//p')
[ -n "$ID" ] || { echo "No website id from the setup" >&2; exit 1; }

# The website id isn't secret; it's set in src/lib/site.ts (UMAMI_WEBSITE_ID).
echo "Umami is running. Website id: $ID (src/lib/site.ts should match)."
