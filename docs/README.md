# Hierarchy Class - Documentation

Everything you need to understand, run, and extend the Hierarchy Class
platform. The docs are organized by concern so you can jump straight to what
you're working on.

| Document | What it covers |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | The big picture: stack, folder layout, runtime layers, and how the pieces talk to each other |
| [DATABASE.md](./DATABASE.md) | Schema, tables, RLS model, and the full migration index |
| [BACKEND.md](./BACKEND.md) | The actual backend: how Supabase (Postgres/RLS/RPC/realtime/storage) + Next.js server code are wired together |
| [API.md](./API.md) | HTTP/API surface: Next.js routes, Supabase RPCs, and realtime channels |
| [SECURITY.md](./SECURITY.md) | Auth flow, middleware, RLS policies, and defense-in-depth |
| [PAYMENTS.md](./PAYMENTS.md) | The GCash/PayMongo Florin top-up: architecture, webhook-authoritative completion, security model, and the sandbox E2E testing guide. **Top-ups are currently disabled** - see the status note at the top of the document |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | The production setup: GitHub, Vercel, Supabase, Cloudflare, and Digital Plat Dev |
| [VERSIONING.md](./VERSIONING.md) | How the app version is stored, when to bump which segment (major/minor/patch styling), and the release checklist |
| [FRONTEND.md](./FRONTEND.md) | Pages, components, data stores/hooks, theming, the public landing + auth design, and key user flows |
| [ANDROID.md](./ANDROID.md) | Android delivery: PWA → TWA packaging (Bubblewrap), signing, Digital Asset Links, APK/AAB builds, and offline/PWA security model |
| [RANK_SYSTEM.md](./RANK_SYSTEM.md) | The rank system explained for users: ranks, the per-entry math, seasons/reset, and the live data path |
| [HABITS.md](./HABITS.md) | The Habit Tracker explained for users: goals, targets, streaks, pause/archive/delete, editing, and history |

Also see:

- [`../database/README.md`](../database/README.md) - how to apply migrations
- [`../README.md`](../README.md) - project overview (what it is and who it's for)
