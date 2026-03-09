#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

NODE_BIN="${1:-}"
WORKER_PATH="${2:-}"
shift 2 || true

if [[ -z "${NODE_BIN}" || -z "${WORKER_PATH}" ]]; then
  echo "Usage: run-license-worker.sh /path/to/node /path/to/worker.js [args...]"
  exit 1
fi

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "Node executable not found: ${NODE_BIN}"
  exit 1
fi

if [[ ! -f "${WORKER_PATH}" ]]; then
  echo "Worker entry not found: ${WORKER_PATH}"
  exit 1
fi

cd "${AUTOMATION_ROOT}"
"${NODE_BIN}" "${WORKER_PATH}" "$@" &
WORKER_PID=$!

/usr/bin/caffeinate -dimsu -w "${WORKER_PID}" &
CAFFEINATE_PID=$!

wait "${WORKER_PID}"

if kill -0 "${CAFFEINATE_PID}" >/dev/null 2>&1; then
  kill "${CAFFEINATE_PID}" >/dev/null 2>&1 || true
fi
