#!/usr/bin/env bash
# Keeps the SQLite database outside the app directory (/var/app/current is
# replaced on every deploy). Seeds it with an empty schema on first boot.
set -euo pipefail
DATA_DIR=/var/beaten-data
DB="$DATA_DIR/beaten.db"
mkdir -p "$DATA_DIR"
if [ ! -f "$DB" ]; then
  cp /var/app/staging/seed-beaten.db "$DB"
fi
chown -R webapp:webapp "$DATA_DIR"
chmod 700 "$DATA_DIR"
