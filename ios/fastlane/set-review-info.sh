#!/usr/bin/env bash
# Asks for App Review's contact details and demo login, and saves them in
# fastlane/.env (gitignored), keeping everything else in it. Press Enter to
# keep a value that's already set. Then run `fastlane metadata`.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=.env
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

# Values are single-quoted so fastlane's dotenv takes them literally (an
# unquoted # starts a comment, and $ is expanded).
current() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | sed "s/^'\\(.*\\)'$/\\1/"; }

save() {
  local key=$1 value=$2 tmp
  tmp=$(mktemp)
  grep -v "^$key=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
}

ask() {
  local key=$1 prompt=$2 secret=${3:-} old value
  old=$(current "$key")
  while :; do
    if [ -n "$secret" ]; then
      read -rsp "$prompt${old:+ [keep current]}: " value; echo
    else
      read -rp "$prompt${old:+ [$old]}: " value
    fi
    value=${value:-$old}
    if [ -z "$value" ]; then echo "  Needed for App Review."; continue; fi
    if [[ "$value" == *"'"* ]]; then echo "  Can't contain a single quote (')."; continue; fi
    if [ "$key" = REVIEW_PHONE ] && [[ ! "$value" =~ ^\+[0-9][0-9\ ]{6,}$ ]]; then
      echo "  Start with + and the country code, e.g. +44 7700 900123."; continue
    fi
    if [[ "$key" =~ EMAIL|DEMO_USER ]] && [[ ! "$value" =~ ^[^@\ ]+@[^@\ ]+\.[^@\ ]+$ ]]; then
      echo "  That doesn't look like an email address."; continue
    fi
    break
  done
  save "$key" "$value"
}

echo "App Review contact (Apple calls this person if something's unclear):"
ask REVIEW_FIRST_NAME "  First name"
ask REVIEW_LAST_NAME "  Last name"
ask REVIEW_EMAIL "  Email"
ask REVIEW_PHONE "  Phone (+country code)"
echo "Demo account the reviewer signs in with (a real beaten.games account):"
ask REVIEW_DEMO_USER "  Email"
ask REVIEW_DEMO_PASSWORD "  Password (hidden)" secret

echo "Saved to fastlane/$ENV_FILE. Upload with: cd $(cd .. && pwd) && fastlane metadata"
