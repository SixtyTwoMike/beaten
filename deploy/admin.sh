#!/usr/bin/env bash
# Support commands against the live site, from your Mac. Runs
# `sudo beaten-admin` on the Lightsail instance over SSH (same short-lived
# credentials as push-lightsail.sh). See docs/support-playbook.md.
#
#   ./deploy/admin.sh find someone@example.com
#   ./deploy/admin.sh send-reset someone@example.com
#   ./deploy/admin.sh export someone@example.com > someone.json
#   ./deploy/admin.sh delete someone@example.com     (asks to confirm)
#
# Run with no arguments for the full command list.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "${1:-}" = delete ] && [ -n "${2:-}" ]; then
  [ -t 0 ] || { echo "delete needs an interactive terminal to confirm." >&2; exit 1; }
  read -rp "Permanently delete $2 and all their data? Type the same address/username again: " again
  [ "$again" = "$2" ] || { echo "Didn't match; nothing deleted." >&2; exit 1; }
  set -- delete "$2" --yes
fi

# shellcheck source=deploy/lightsail-ssh.sh
. deploy/lightsail-ssh.sh

# Quote each argument for the remote shell so emails etc. arrive verbatim.
ssh "${SSH_OPTS[@]}" "$TARGET" "sudo beaten-admin $(printf '%q ' "$@")"
