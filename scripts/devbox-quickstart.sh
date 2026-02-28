#!/usr/bin/env bash
set -euo pipefail

bash scripts/devbox-init.sh
bash scripts/devbox-guard.sh
bash scripts/devbox-pnpm.sh dev
