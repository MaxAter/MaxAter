#!/usr/bin/env bash
# Clone or update Cursor Mini and open the floating palette.
# Safe to run from any directory. Does not touch ~/MaxAter.
set -euo pipefail

DIR="${CURSOR_MINI_DIR:-$HOME/CursorMini}"
REPO="https://github.com/MaxAter/MaxAter.git"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo
echo "Cursor Mini — starting on this Mac"
echo

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This launcher is for the Mac mini. It cannot open a window from Linux/cloud."
  exit 1
fi

if ! command -v git >/dev/null; then
  echo "Install Apple’s command line tools first, then run this again:"
  echo "  xcode-select --install"
  exit 1
fi

if ! command -v npm >/dev/null; then
  if command -v brew >/dev/null; then
    echo "Installing Node with Homebrew…"
    brew install node
  else
    echo "Install Node from https://nodejs.org (or run: brew install node)"
    open "https://nodejs.org" || true
    exit 1
  fi
fi

if ! command -v python3 >/dev/null; then
  echo "Python 3 is required (it ships with macOS). Install it, then run this again."
  exit 1
fi

APP_DIR=""
if [[ -f "$SCRIPT_DIR/start.sh" && -f "$SCRIPT_DIR/package.json" ]]; then
  APP_DIR="$SCRIPT_DIR"
fi

if [[ -z "$APP_DIR" ]]; then
  branches=()
  [[ -n "${CURSOR_MINI_BRANCH:-}" ]] && branches+=("$CURSOR_MINI_BRANCH")
  branches+=(
    "cursor/start-cursor-mini-84a8"
    "cursor/cursor-mini-avid-eefc"
    "main"
  )

  picked=""
  if [[ -e "$DIR" && ! -d "$DIR/.git" ]]; then
    echo "$DIR exists and is not a git checkout. Using ${DIR}-app instead."
    DIR="${DIR}-app"
  fi

  if [[ ! -d "$DIR/.git" ]]; then
    for branch in "${branches[@]}"; do
      if git clone -b "$branch" "$REPO" "$DIR"; then
        picked="$branch"
        break
      fi
    done
  else
    git -C "$DIR" fetch origin --prune
    for branch in "${branches[@]}"; do
      if git -C "$DIR" checkout "$branch" && git -C "$DIR" pull --ff-only "origin" "$branch"; then
        picked="$branch"
        break
      fi
    done
  fi

  if [[ -z "$picked" || ! -f "$DIR/cursor-mini/start.sh" ]]; then
    echo "Could not download Cursor Mini from GitHub."
    exit 1
  fi
  APP_DIR="$DIR/cursor-mini"
fi

chmod +x "$APP_DIR/start.sh"
cd "$APP_DIR"
echo "Launching from $APP_DIR"
exec ./start.sh
