# Deployment

How Hierarchy Class is built, hosted, and shipped to production. The stack is
split across five services, each with one job:

| Service | Role |
|---|---|
| **GitHub** | Source of truth, version control, and the trigger for deployments |
| **Vercel** | Hosts the Next.js site, builds and deploys, auto-deploys from GitHub |
| **Supabase** | PostgreSQL database, authentication, Row-Level Security, Realtime/messaging, file & image storage |
| **Cloudflare** | DNS, domain routing, DDoS protection, security, CDN / caching |
| **Digital Plat Dev** | Domain registrar - owns and manages the website domain |

---

## 1. GitHub - source code

- Store the entire codebase (the `hierarchy_class/` Next.js app, migrations,
  docs) in a repository on GitHub (`main` branch).
- Keep secrets **out** of the repo: `.env*`, `.scrt.txt`, `.pem`, `.key` are
  gitignored. Environment variables live in the hosting platform (Vercel),
  not in source.
- Every meaningful change ships as a commit with a clear message. The repo
  is connected to Vercel so a push to `main` automatically triggers a
  production deploy (see section 2).

## 2. Vercel - hosting and deployment

Vercel is where the Next.js application actually runs.

**Connecting:**

1. In Vercel, **Add New Project** and import the GitHub repository.
2. Framework preset: **Next.js** (detected automatically from
   `package.json`).
3. Build settings use the defaults (`next build`), root directory is the
   project root.

**Environment variables** (set in Vercel project settings - never in the
repo):

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings -> API (anon/public key) |
| `NEXT_PUBLIC_SITE_URL` | The deployment origin, e.g. `https://your-production-domain` - **required** as the base for email confirmation links and password recovery redirects |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings -> API (service_role key) - **server-only**; used by account deletion, the signup duplicate-identifier check, the feedback attachment signing, payment server routes, and `scripts/provision-admin.mjs` |
| `RESEND_API_KEY` | Resend -> API Keys - **server-only**; required for the feedback email, restriction notices, and account-deletion confirmation. Without it those emails are skipped (feedback is still stored) |
| `FEEDBACK_INBOX` | Your email address - the ONLY delivery for user feedback (email-only since v1.28.0, nothing is stored in the database). **Required for feedback to work**; without it the feedback route returns 503 |
| `UPSTASH_REDIS_REST_URL` | Upstash console -> database -> REST API - **server-only; required in production**. Backs the cross-instance rate limiters (signup, resend-confirmation, music resolution). Without it the limiters fail open with a logged error - do not deploy without them |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console -> database -> REST API (pair with the URL above) |
| `PAYMONGO_SECRET_KEY` | **Currently unused** - Florin top-ups are switched off (`PAYMENTS_ENABLED = false` in `lib/paymentsConfig.ts`). Required again only when payments are re-enabled. See [PAYMENTS.md](./PAYMENTS.md) |
| `PAYMONGO_WEBHOOK_SECRET` | **Currently unused** (checkout disabled) - but keep it set if the webhook endpoint stays registered, so already-paid sessions keep verifying. See [PAYMENTS.md](./PAYMENTS.md) |

**Deployments:**

- Every push to `main` builds and deploys automatically (Production).
- Pull requests get their own preview deployments automatically.
- Rollbacks: Vercel keeps deployment history - you can promote any previous
  deployment back to production.

## 3. Supabase - database, auth, and storage

Supabase is the entire backend: PostgreSQL database, authentication, Row
Level Security, Realtime, and file/image storage.

- **PostgreSQL database** - all tables (profiles, habits, grades, rank
  state, shop, messages, etc.) live here. Schema changes ship as numbered
  migrations in `database/migrations/` (currently up to **078**) and are
  applied to the project (SQL Editor or `psql`).
- **Authentication** - Supabase Auth handles sign up / sign in / password
  reset. Email confirmation is mandatory: signup sends a confirmation link
  (built from `NEXT_PUBLIC_SITE_URL`), unconfirmed accounts are refused at
  login and by middleware. Role and school are resolved from the `profiles`
  table (database truth), never from user-editable `user_metadata`. Public
  signup accepts only students and teachers; admins are provisioned by the
  platform owner (see `docs/ADMIN_PROVISIONING.md`).
- **Row-Level Security (RLS)** - every table carries own-row / school-scoped
  policies so students can only touch their own data. `SECURITY DEFINER`
  RPCs (e.g. `purchase_shop_item`, `equip_shop_item`) enforce rules the
  client could otherwise bypass.
- **Realtime / Messaging** - tables are published to realtime so the app
  updates live (rank state, habits, notifications, messages, feed). See
  `docs/API.md` for the published channels.
- **File and image storage** - buckets for avatars, learning materials, and
  feed images with storage-level RLS and upload validation.

**Connecting the app:** the app reads `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` at runtime (Vercel env vars). No server-side
secret keys are needed for this setup - RLS is the security boundary.

## 4. Cloudflare - DNS, security, and CDN

Cloudflare sits in front of the domain and routes traffic to Vercel:

- **DNS** - the domain's DNS is managed on Cloudflare; records point the
  apex and `www` at the Vercel deployment.
- **Domain routing** - Vercel provides a `*.vercel.app` URL; the real domain
  (managed on Cloudflare) is attached to the project in Vercel project
  settings -> Domains.
- **DDoS protection & security** - Cloudflare's proxy (orange cloud) absorbs
  attacks and filters traffic before it reaches Vercel. SSL/TLS is
  terminated at the edge (Full/Strict with a Vercel origin cert).
- **CDN / caching** - static assets are served from Cloudflare's edge cache;
  dynamic Next.js routes pass through to Vercel. Cache rules can be tuned
  per path (e.g. cache `/` and static assets aggressively, never cache
  authenticated routes).

**Typical record setup (Cloudflare):**

| Type | Name | Value |
|---|---|---|
| A / CNAME | `@` | Vercel's deployment IP / target |
| CNAME | `www` | Vercel target |
| CAA | `@` | lets Vercel / Cloudflare issue certs |

## 5. Digital Plat Dev - domain registrar

Digital Plat Dev owns and manages the website domain (registration,
renewals, WHOIS). The domain's **nameservers** are pointed at Cloudflare so
Cloudflare controls DNS while the registrar keeps ownership:

1. Register/renew the domain at Digital Plat Dev.
2. In Digital Plat Dev's panel, set the domain's nameservers to Cloudflare's
   (the two nameservers Cloudflare shows when you add the site).
3. Cloudflare now handles DNS records; changes there go live without
   touching the registrar.

---

## End-to-end request path

```
Student/Teacher/Admin
        │
        ▼
   Cloudflare          (DNS resolution, DDoS protection, CDN cache, TLS)
        │
        ▼
      Vercel           (serves the Next.js app; build + auto-deploy from GitHub)
        │                        │
        ▼                        ▼
   Supabase Auth      Supabase PostgreSQL + Realtime + Storage
   (sessions)         (data, RLS, live updates, files)
        ▲
        │
    GitHub            (source of truth, triggers Vercel deploys)
```

## Releasing a change

1. Commit to `main` on GitHub.
2. Vercel picks up the push and runs `next build`; on success it promotes
   the new deployment to production.
3. If a migration changed the schema, apply it to Supabase (SQL Editor) -
   the app tolerates the migration being applied slightly before/after the
   deploy because migrations are additive (numbered `0NN_*.sql`).
4. Verify on the live domain (DNS through Cloudflare, HTTPS enforced).

## Rolling back

- **App:** Vercel -> Deployments -> promote a previous deployment.
- **Database:** restore from a Supabase point-in-time backup, or apply a
  corrective migration. Never mutate production schema by hand outside the
  migrations convention.
