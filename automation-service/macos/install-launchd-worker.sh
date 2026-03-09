#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUTOMATION_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLIST_TARGET="${HOME}/Library/LaunchAgents/com.kindoo.license-worker.plist"
WRAPPER_SCRIPT="${SCRIPT_DIR}/run-license-worker.sh"

# Prefer stable Node install paths for launchd; avoid ephemeral fnm multishell paths.
NODE_CANDIDATES=(
  "/opt/homebrew/bin/node"
  "/usr/local/bin/node"
  "/usr/bin/node"
)

NODE_BIN=""
for candidate in "${NODE_CANDIDATES[@]}"; do
  if [[ -x "${candidate}" ]]; then
    NODE_BIN="${candidate}"
    break
  fi
done

if [[ -z "${NODE_BIN}" ]]; then
  FALLBACK_NODE="$(command -v node || true)"
  if [[ -n "${FALLBACK_NODE}" ]]; then
    NODE_BIN="${FALLBACK_NODE}"
  fi
fi

if [[ -z "${NODE_BIN}" ]]; then
  echo "node executable not found in stable paths or PATH"
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents"
mkdir -p "${HOME}/Library/Logs"
chmod +x "${WRAPPER_SCRIPT}"

# Build stable dist snapshot used by the launch agent.
cd "${AUTOMATION_ROOT}"
pnpm run build

cat > "${PLIST_TARGET}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.kindoo.license-worker</string>

    <key>ProgramArguments</key>
    <array>
      <string>${WRAPPER_SCRIPT}</string>
      <string>${NODE_BIN}</string>
      <string>${AUTOMATION_ROOT}/dist/src/worker.js</string>
      <string>--watch</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${AUTOMATION_ROOT}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${HOME}/Library/Logs/kindoo-license-worker.out.log</string>

    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Logs/kindoo-license-worker.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
  </dict>
</plist>
PLIST

# Reload agent if it already exists.
launchctl bootout "gui/$(id -u)/com.kindoo.license-worker" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "${PLIST_TARGET}"
launchctl kickstart -k "gui/$(id -u)/com.kindoo.license-worker"

echo "Installed and started com.kindoo.license-worker"
echo "Plist: ${PLIST_TARGET}"
echo "Node:  ${NODE_BIN}"
echo "Logs:  ${HOME}/Library/Logs/kindoo-license-worker.out.log"
