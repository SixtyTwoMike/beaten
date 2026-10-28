#!/usr/bin/env bash
# Builds the bundle and installs it on the Lightsail instance over SSH, using
# short-lived credentials from `aws lightsail get-instance-access-details`.
# Also copies TWITCH_CLIENT_ID/SECRET from your local .env into the server's
# root-only /etc/beaten.env (sent over SSH stdin, never on a command line).
#
# Usage: [BEATEN_DOMAIN=new.host] ./deploy/push-lightsail.sh [--no-build]
#   Re-run any time to deploy the current checkout. Database migrations are
#   applied on the server; existing data is kept.
set -euo pipefail
cd "$(dirname "$0")/.."

TARBALL=deploy/out/beaten-bundle.tar.gz

if [ "${1:-}" != "--no-build" ] || [ ! -f "$TARBALL" ]; then
  ./deploy/build-lightsail-bundle.sh
fi

# shellcheck source=deploy/lightsail-ssh.sh
. deploy/lightsail-ssh.sh

echo "==> waiting for base setup on $TARGET"
for i in $(seq 1 40); do
  if ssh "${SSH_OPTS[@]}" "$TARGET" test -f /var/lib/beaten-base-ready 2>/dev/null; then
    break
  fi
  [ "$i" = 40 ] && { echo "Base setup never finished; see /var/log/beaten-bootstrap.log" >&2; exit 1; }
  sleep 15
done

echo "==> uploading bundle + installer"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p ~/beaten-upload"
scp -q "${SSH_OPTS[@]}" "$TARBALL" deploy/lightsail/install-from-bundle.sh \
  "$TARGET:beaten-upload/"

# Merge IGDB, Resend + Google credentials into /etc/beaten.env when they're set locally.
# Last assignment wins; surrounding quotes are stripped (.env.example ships "").
env_value() {
  sed -n "s/^$1=//p" .env 2>/dev/null | tail -1 | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
CID=$(env_value TWITCH_CLIENT_ID)
CSECRET=$(env_value TWITCH_CLIENT_SECRET)
ENV_UPDATES=""
if [ -n "$CID" ] && [ -n "$CSECRET" ]; then
  echo "==> setting IGDB credentials"
  ENV_UPDATES+="TWITCH_CLIENT_ID=$CID"$'\n'"TWITCH_CLIENT_SECRET=$CSECRET"$'\n'"IGDB_MOCK=0"$'\n'
else
  echo "==> no TWITCH_CLIENT_ID/SECRET in .env — server keeps its current IGDB setting"
fi
RESEND=$(env_value RESEND_API_KEY)
if [ -n "$RESEND" ]; then
  echo "==> setting Resend API key"
  ENV_UPDATES+="RESEND_API_KEY=$RESEND"$'\n'
fi
GID=$(env_value GOOGLE_CLIENT_ID)
GSECRET=$(env_value GOOGLE_CLIENT_SECRET)
if [ -n "$GID" ] && [ -n "$GSECRET" ]; then
  echo "==> setting Google sign-in credentials"
  ENV_UPDATES+="GOOGLE_CLIENT_ID=$GID"$'\n'"GOOGLE_CLIENT_SECRET=$GSECRET"$'\n'
fi
# BEATEN_DOMAIN=new.host moves the site (users sign in again on the new origin).
if [ -n "${BEATEN_DOMAIN:-}" ]; then
  echo "==> setting domain $BEATEN_DOMAIN"
  ENV_UPDATES+="BEATEN_DOMAIN=$BEATEN_DOMAIN"$'\n'"AUTH_URL=https://$BEATEN_DOMAIN"$'\n'
fi
if [ -n "$ENV_UPDATES" ]; then
  printf '%s' "$ENV_UPDATES" |
    ssh "${SSH_OPTS[@]}" "$TARGET" 'sudo bash -c '\''
      umask 077
      new=$(cat)
      keys=$(printf "%s\n" "$new" | cut -d= -f1 | paste -sd"|" -)
      { grep -vE "^($keys)=" /etc/beaten.env || true; printf "%s\n" "$new"; } > /etc/beaten.env.new
      mv /etc/beaten.env.new /etc/beaten.env
    '\'''
fi

echo "==> installing"
SHA=$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)
ssh "${SSH_OPTS[@]}" "$TARGET" "sudo install -m 755 ~/beaten-upload/install-from-bundle.sh /usr/local/bin/beaten-install &&
  sudo /usr/local/bin/beaten-install file://\$HOME/beaten-upload/beaten-bundle.tar.gz $SHA >/tmp/beaten-install.log 2>&1 ||
  { tail -40 /tmp/beaten-install.log; exit 1; }
  tail -3 /tmp/beaten-install.log"

DOMAIN=$(ssh "${SSH_OPTS[@]}" "$TARGET" "sudo sed -n 's/^BEATEN_DOMAIN=//p' /etc/beaten.env")
IP=${TARGET#*@}
echo "==> checking"
sleep 5  # give the restarted app a moment
curl -s -o /dev/null -w "   http://$IP/login -> %{http_code}\n" --max-time 10 "http://$IP/login" -H "Host: $DOMAIN" || true
curl -s -o /dev/null -w "   https://$DOMAIN/login -> %{http_code}\n" --max-time 10 "https://$DOMAIN/login" || true
