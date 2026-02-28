#!/usr/bin/env bash
set -euo pipefail

# Warn when pnpm resolves to a Corepack shim.
DIRECT_PNPM=""
if [ -x "/opt/homebrew/bin/pnpm" ]; then
  DIRECT_PNPM="/opt/homebrew/bin/pnpm"
elif [ -x "/usr/local/bin/pnpm" ]; then
  DIRECT_PNPM="/usr/local/bin/pnpm"
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_PATH="$(command -v pnpm)"
  if [[ "$PNPM_PATH" != *corepack* ]]; then
    DIRECT_PNPM="$PNPM_PATH"
  fi
fi

if [ -n "$DIRECT_PNPM" ]; then
  exit 0
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_PATH="$(command -v pnpm)"
  if [[ "$PNPM_PATH" == *corepack* ]]; then
    echo "⚠️  pnpm resolves to a Corepack shim: ${PNPM_PATH}"
    echo "    If you hit signature errors, ensure a direct pnpm binary is installed."
  fi
else
  echo "⚠️  pnpm is not on PATH; falling back to npx pnpm in devbox scripts."
fi
