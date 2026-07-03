#!/usr/bin/env bash
# Redeploy the latest code on the instance. Run from the Lightsail browser
# SSH console:  sudo /opt/beaten/src/deploy/lightsail/update.sh
set -euo pipefail
cd /opt/beaten/src
git pull --ff-only
exec bash deploy/lightsail/install.sh
