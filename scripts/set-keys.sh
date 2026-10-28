#!/usr/bin/env bash
# Store Beaten's API keys in the local .env without them touching the repo,
# your shell history, or the screen. Press Enter to keep a value that's
# already set. Then run ./deploy/push-lightsail.sh to copy them to the server.
#
#   scripts/set-keys.sh            prompt for each key
#   scripts/set-keys.sh --decades  copy the Twitch keys from the Best of
#                                  Decades server (~/decades/.deploy.env)
set -euo pipefail
cd "$(dirname "$0")/.."

[[ -t 0 ]] || { echo "Run this in an interactive terminal." >&2; exit 1; }
[[ -f .env ]] || cp .env.example .env

# Current value with surrounding quotes stripped (.env.example ships "").
current() {
  sed -n "s/^$1=//p" .env | tail -1 | sed -E 's/^"(.*)"$/\1/'
}

keys=() vals=() # parallel arrays: macOS ships bash 3.2

ask() { # name, prompt, hidden?
  local v status="not set"
  [[ -n "$(current "$1")" ]] && status="set — Enter keeps it"
  if [[ ${3:-} == hidden ]]; then
    read -rsp "$2 ($status): " v
    echo
  else
    read -rp "$2 ($status): " v
  fi
  v=$(printf '%s' "$v" | tr -d '[:space:]')
  [[ -n "$v" ]] && { keys+=("$1"); vals+=("$v"); }
  return 0
}

if [[ ${1:-} == --decades ]]; then
  # shellcheck disable=SC1091
  source ~/decades/.deploy.env
  SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10)
  [[ -n "${DECADES_SSH_KEY:-}" ]] && SSH_OPTS+=(-i "${DECADES_SSH_KEY/#\~/$HOME}")
  echo "Fetching Twitch keys from $DECADES_HOST…"
  fetched=$(ssh "${SSH_OPTS[@]}" "${DECADES_SSH_USER:-ubuntu}@$DECADES_HOST" \
    "sudo grep -E '^TWITCH_CLIENT_(ID|SECRET)=' /etc/decades/decades.env")
  for name in TWITCH_CLIENT_ID TWITCH_CLIENT_SECRET; do
    v=$(printf '%s\n' "$fetched" | sed -n "s/^$name=//p" | tail -1 | sed -E 's/^"(.*)"$/\1/')
    [[ -n "$v" ]] || { echo "$name is empty on the Decades server." >&2; exit 1; }
    keys+=("$name"); vals+=("$v")
  done
else
  echo "Twitch keys: dev.twitch.tv/console/apps (or re-run with --decades)"
  ask TWITCH_CLIENT_ID "Twitch client ID"
  ask TWITCH_CLIENT_SECRET "Twitch client secret" hidden
fi

echo "Resend key: resend.com → API Keys (Sending access, beaten.games)"
ask RESEND_API_KEY "Resend API key" hidden

(( ${#keys[@]} )) || { echo "Nothing to change."; exit 0; }

# Live IGDB once both Twitch keys exist.
for i in "${!keys[@]}"; do
  if [[ ${keys[$i]} == TWITCH_CLIENT_ID ]]; then keys+=(IGDB_MOCK); vals+=(0); break; fi
done

# Rewrite .env with the changed keys replaced (values never hit argv).
umask 077
tmp=$(mktemp .env.XXXXXX)
pattern=$(IFS='|'; echo "${keys[*]}")
grep -vE "^($pattern)=" .env > "$tmp" || true
for i in "${!keys[@]}"; do printf '%s=%s\n' "${keys[$i]}" "${vals[$i]}" >> "$tmp"; done
mv "$tmp" .env
chmod 600 .env

echo "Updated: ${keys[*]}"
echo "Next: ./deploy/push-lightsail.sh --no-build   (copies them to the server)"
