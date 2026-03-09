# 🗓️ Event Tracker — Private Dashboard

A production-ready, private event tracking dashboard for **Stake Center** and **Maples Building** events. Built with Next.js 16+, React 19, Drizzle ORM, Turso (libSQL), Auth.js v5, TanStack Query v5, and shadcn/ui.

---

## 📚 Documentation

- App overview and operations: [`docs/APP_HANDBOOK.md`](docs/APP_HANDBOOK.md)
- Automation queue + worker runbook: [`docs/AUTOMATION_PROCESS.md`](docs/AUTOMATION_PROCESS.md)

## ✨ Features

- 🔐 Google OAuth authentication (Auth.js v5)
- 🏢 Separate event lists per building (Stake Center / Maples Building)
- ⚡ Optimistic UI updates with instant feedback
- 🌙 Dark mode via next-themes
- 📱 Fully responsive design
- 🔄 Real-time cache invalidation with TanStack Query
- 🎯 Type-safe end-to-end (Drizzle → Server Actions → React)

---

## 📦 Prerequisites

- Node.js ≥ 20.x
- pnpm ≥ 9.x
- A [Turso](https://turso.tech) account (free tier works)
- A Google Cloud project with OAuth credentials

---

## 🚀 Setup (pnpm only)

### 1. Ensure pnpm is installed

```bash
# Via corepack (recommended, ships with Node 16+)
corepack enable
corepack prepare pnpm@latest --activate

# OR via npm (one-time only)
npm install -g pnpm
```

## 🤖 Kindoo automation (queue + local worker)

This repo keeps `automation-service/` in-project, but it is now intended to run on your machine as an on-demand or scheduled worker.

### 1) Configure app env vars

Copy `.env.example` to `.env.local` and set:

```bash
KINDOO_WORKER_TOKEN="replace-with-long-random-secret"
```

### 2) Configure local worker env vars

In `automation-service/.env` set:

```bash
KINDOO_APP_URL="https://your-hosted-kindoo-app.example.com"
KINDOO_WORKER_TOKEN="same-value-as-main-app"

KINDOO_URL="https://web.kindoo.tech/"
KINDOO_EMAIL=""
KINDOO_CHURCH_USERNAME=""
KINDOO_CHURCH_PASSWORD=""

PLAYWRIGHT_HEADLESS="true"
PLAYWRIGHT_TIMEOUT_MS="30000"
PLAYWRIGHT_RETRY_COUNT="3"
PLAYWRIGHT_RETRY_DELAY_MS="300"
```

### 3) Run worker manually (on-demand)

```bash
cd automation-service
pnpm install
pnpm run worker
```

Useful modes:

- `pnpm run worker`: process one small batch and exit.
- `pnpm run worker:drain`: process until queue is empty and exit.
- `pnpm run worker:watch`: keep polling in a loop.

### 4) Run automatically on macOS without a permanent process

Use a LaunchAgent that wakes every few minutes, runs `worker --once`, and exits. See:

- `automation-service/macos/com.kindoo.license-worker.plist.example`

Install it by copying to `~/Library/LaunchAgents/com.kindoo.license-worker.plist`, then run:

```bash
launchctl unload ~/Library/LaunchAgents/com.kindoo.license-worker.plist 2>/dev/null || true
launchctl load ~/Library/LaunchAgents/com.kindoo.license-worker.plist
```

Recommended: use the installer script so the LaunchAgent is generated with a stable Node binary path
(`/opt/homebrew/bin/node` or `/usr/local/bin/node`) instead of ephemeral shell paths:

```bash
cd automation-service
pnpm run worker:launchd:install
```
