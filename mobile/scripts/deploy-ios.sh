#!/usr/bin/env bash
# Builds a Release version of the app and installs it on a connected iPhone.
#
# Usage: scripts/deploy-ios.sh [--prebuild] [device name or UDID]
#
# With no device given, picks the first iPhone connected to this Mac (USB, or
# the same network once paired). ios/ is regenerated with `expo prebuild` when
# it's missing, when app.json, app.config.ts or package.json changed since the
# last prebuild, or with --prebuild.
set -euo pipefail

cd "$(dirname "$0")/.."

prebuild=false
device=""
for arg in "$@"; do
  case "$arg" in
    --prebuild) prebuild=true ;;
    -h | --help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) device="$arg" ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Node version from .nvmrc, via nvm when it's installed.
if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use >/dev/null
fi
want_node="$(cat .nvmrc)"
have_node="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$have_node" != "$want_node" ]; then
  echo "Node $want_node required (from .nvmrc), found $(node -v)." >&2
  exit 1
fi

if [ -z "$device" ]; then
  step "Looking for a connected iPhone"
  # Physical devices are listed before "== Simulators ==" as
  # "Name (OS version) (UDID)"; the Mac itself has no OS version.
  device="$(xcrun xctrace list devices 2>/dev/null |
    sed -n '/^== Devices ==/,/^== Simulators ==/p' |
    grep -E 'iPhone.*\([0-9.]+\) \([0-9A-F-]+\)$' |
    head -n1 |
    sed -E 's/.*\(([0-9A-F-]+)\)$/\1/' || true)"
  if [ -z "$device" ]; then
    echo "No iPhone found. Connect it by USB, unlock it and trust this Mac." >&2
    exit 1
  fi
fi
echo "Device: $device"

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  step "Installing dependencies"
  npm ci
fi

step "Typechecking"
npm run -s typecheck

if [ ! -d ios ] || [ app.json -nt ios ] || [ app.config.ts -nt ios ] || [ package.json -nt ios ]; then
  prebuild=true
fi
if [ "$prebuild" = true ]; then
  step "Regenerating ios/"
  npx expo prebuild -p ios --clean
  touch ios
fi

step "Building and installing (Release)"
npx expo run:ios --device "$device" --configuration Release

step "Done: open Trucker on the phone"
