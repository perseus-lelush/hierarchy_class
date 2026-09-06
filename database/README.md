# Database

This folder holds everything that defines the **Hierarchy Class** database -
the PostgreSQL schema, row-level security (RLS) policies, server-side
functions (RPCs), and triggers. The application never talks to the database
directly; it goes through Supabase (PostgREST + Realtime + Storage), which
enforces these rules on every request.

```
database/
  migrations/    One numbered SQL file per change, applied in order (001 -> 078)
  README.md      This file
```

## Migrations

Every schema change is a numbered file in `database/migrations/`. There is no
migration-tracking table - the files **are** the history, and each one is
written to be **idempotent** (safe to re-run), so applying them is:

1. Open your Supabase project -> **SQL Editor**.
2. Run each file in numeric order (`001_...` -> `078_...`).
3. Re-running an already-applied file is safe (guards like
   `IF NOT EXISTS` / `DROP POLICY IF EXISTS` make it a no-op).

> ⚠️ Newer migrations sometimes rewrite earlier objects (e.g. `025` replaced
> the messaging functions). If you're applying from scratch, run the whole
> sequence. If you're upgrading an existing database, start from the migration
> after your last applied one - the docs index in `docs/DATABASE.md` lists
> what each file changes so you can find your place.

## Guardrails

- **RLS is the gate.** Every table has policies that scope rows by school,
  role, and ownership. Client code never runs as `postgres` or with the
  service key.
- **Privileged operations live in `SECURITY DEFINER` functions** (chat,
  notifications, grade approval, leaderboard aggregates) so the client can't
  forge identity or bypass checks.
- **Idempotent SQL only.** Because there's no tracking table, every migration
  must be safe to run twice.
