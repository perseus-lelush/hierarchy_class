# Hierarchy Class

**Make school feel like a game worth playing.**

Hierarchy Class is a gamified academic-tracking platform for students, teachers, and school administrators. Real grades become tiered ranks (S++ → D), habits build streaks, and daily effort shows up in live progress — while grading data stays strictly controlled by teachers and admins.

**Current version:** `1.30.3`

---

## Who it's for

| Role | What they do |
|---|---|
| **Student** | Live rank & progress, leaderboard, school feed, materials, library, messaging, habit tracker |
| **Teacher** | Submit grades, manage tasks, upload materials, run quizzes, workspace tools; **librarians** manage the catalog & pickup requests |
| **Admin** | Build the school hierarchy (levels → programs → courses), enroll students, assign teachers, approve grades, monitor progress |

Each admin account is scoped to exactly **one school**.

## Device support

- **Students** — phone, tablet, desktop, and the standalone **Android app**
- **Teachers & admins** — tablet and desktop (phone shows a device-warning screen)

## Highlights

- **Rank engine** — non-linear power-curve progression from D → S++ → EX, configurable per school, with an audit trail on every write
- **Grade approval queue** — teacher submissions are reviewed by admins before they count
- **Live leaderboard, school feed, stories & notifications**
- **Messaging** — one shared chat across roles with unread badges, archive, and blocking
- **Habit tracker** — custom goals, streaks, pause/archive, and a contribution-style history calendar
- **Library** — barcode ISBN lookup, borrow requests, receipts, and overdue fines
- **Quiz engine, learning materials, and Florin** (in-app currency; GCash top-ups via PayMongo are **currently disabled** — the purchase UI shows a "Coming soon" state)
- **Florin shop** — decorative backgrounds, profile cards, and avatar borders
- **Student profile** — bio, hobbies, achievements, music (paste any YouTube/Spotify/Apple Music/SoundCloud/Vimeo link), photos, and story archive
- **Midnight & Rose themes**

## Tech stack

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Backend / Auth / DB:** Supabase (Postgres, RLS, Auth, Realtime, Storage)
- **Styling:** Tailwind CSS · **Charts:** Recharts
- **Android:** Capacitor (bundled static export) · **Hosting:** Vercel

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project's values
npm run dev
```

Visit `http://localhost:3000`.

## Project structure

- `app/` — pages, one folder per role (`student/`, `teacher/`, `admin/`) plus public/auth routes
- `components/` — shared UI primitives and role components
- `lib/` — React stores/providers, pure logic (rank engine, habits), Supabase clients
- `database/migrations/` — numbered SQL migrations (schema, RLS, RPCs)
- `docs/` — full documentation (see below)

## Documentation

The full docs live in [`docs/`](docs/README.md): architecture, database, backend, API, security, payments, deployment, frontend, Android, ranks, and habits.

For database migrations, see [`database/README.md`](database/README.md).
