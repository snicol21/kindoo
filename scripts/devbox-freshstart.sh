#!/usr/bin/env bash
set -euo pipefail

rm -f local.db
bash scripts/devbox-init.sh
bash scripts/devbox-guard.sh
bash scripts/devbox-pnpm.sh dev
