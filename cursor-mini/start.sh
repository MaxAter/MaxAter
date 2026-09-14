#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v npm >/dev/null; then
  echo "Install Node.js from https://nodejs.org then run this again."
  exit 1
fi

if ! command -v python3 >/dev/null; then
  echo "Install Python 3, then run this again."
  exit 1
fi

npm install --no-fund --no-audit
python3 -m pip install --user -q -r host/requirements.txt || true

echo
echo "Starting Cursor Mini. Keep Pro Tools open with a session for LIVE markers."
echo

exec npx electron .