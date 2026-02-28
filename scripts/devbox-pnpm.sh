#!/usr/bin/env bash
set -euo pipefail

# Prefer a direct pnpm binary to avoid Corepack shims.
if command -v pnpm >/dev/null 2>&1; then
	PNPM_PATH="$(command -v pnpm)"
	if [[ "$PNPM_PATH" != *corepack* ]]; then
		exec pnpm "$@"
	fi
fi

# Try common Homebrew locations before falling back to npx.
if [ -x "/opt/homebrew/bin/pnpm" ]; then
	exec /opt/homebrew/bin/pnpm "$@"
fi

if [ -x "/usr/local/bin/pnpm" ]; then
	exec /usr/local/bin/pnpm "$@"
fi

# Fallback to a pinned pnpm via npx.
exec npx -y pnpm@9.15.0 "$@"
