# 🗓️ Event Tracker — Private Dashboard

A production-ready, private event tracking dashboard for **Stake Center** and **Maples Building** events. Built with Next.js 16+, React 19, Drizzle ORM, Turso (libSQL), Auth.js v5, TanStack Query v5, and shadcn/ui.

---

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
