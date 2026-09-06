# Hierarchy Class - Security

Security is layered: **route guards -> client checks -> RLS -> SECURITY
DEFINER functions**. The database policies are the real gate; everything
else is UX and defense in depth.

---

## 1. Authentication

- **Supabase Auth** with email/password. A database trigger auto-creates a
  `profiles` row on signup (migration 003, hardened in 059).
- **Public signup accepts only `student` and `teacher`.** The signup UI, the
  signup bridge (`lib/server/authOps.ts`), and the `handle_new_user()`
  database trigger all reject
  `role = admin`; a forged role or school UUID fails at the database level.
  Admins are provisioned by the platform owner only (service role) - see
  [ADMIN_PROVISIONING.md](./ADMIN_PROVISIONING.md).
- **School authority comes from `profiles.school_id`.** The school must exist,
  be active, and be open for registration (`schools.registration_enabled`);
  arbitrary school UUIDs are rejected by the bridge and the trigger.
- **Email confirmation is mandatory.** Signup sends a confirmation link
  (`NEXT_PUBLIC_SITE_URL` in production), login refuses unconfirmed accounts,
  and middleware enforces `email_confirmed_at` on every request.
- **Session**: `@supabase/ssr` cookies. `middleware.ts` refreshes the session
  cookie on every request and redirects appropriately:
  - Logged out -> `/login` (destination preserved)
  - Wrong role for the prefix (`/student`, `/teacher`, `/admin`) -> bounce to
    their own home
  - Signed-in user on `/login`/`/signup` -> their home
  - Deactivated account -> `/auth/reactivate`
  - Restricted account (school-admin action for suspicious users) -> `/auth/restricted` (appeal flow)
  - Authenticated with no profile -> `/auth/incomplete`
- **Role and school are database truth.** The authoritative role is
  `profiles.role` and the authoritative school is `profiles.school_id` -
  **never** `auth.users.user_metadata`. A user who edits their own
  `user_metadata.role` / `user_metadata.school_id` changes nothing:
  middleware, RLS, and the server-side bridge modules all resolve from the
  `profiles` row by
  `profiles.user_id = auth user id`. The `protect_profile_columns` trigger
  additionally blocks users (and school admins, for school_id and admin
  promotion) from editing these columns.
- **Admin accounts are service-role only.** A school admin can never promote
  anyone to admin, never demote an existing admin, and never edit an existing
  admin's authorization fields (`role` / `school_id` / `user_id`) -
  `protect_profile_columns` raises on any such change and
  `profiles_admin_update` cannot even target admin rows. Only the
  developer/service-role provisioning path (migration 059 §8-9) creates or
  modifies admin accounts.
- **Owner inserts are school-bound.** `stories_own_create`,
  `achievements_own_insert`, `music_own_insert`,
  `quiz_attempts_student_create`, `borrow_requests_student_create`, and
  `account_requests_own_create` all require `school_id = my_school_id()` in
  their WITH CHECK, so a user can never plant a row in another school's
  namespace (migration 059 §10).

## 2. Authorization (RLS)

Every table has policies. Three consistent patterns:

1. **School scope** - the row's `school_id` must match the caller's school
   via a `profiles` lookup (the SECURITY DEFINER helpers `my_school_id()` /
   `my_role()` in migration 059, or an `EXISTS (SELECT 1 FROM profiles ...)`
   subquery). **No policy reads `auth.jwt()` / `user_metadata` for
   authorization** - user-editable metadata is never trusted.
2. **Role scope** - students see only their own data; teachers see what they
   teach plus school-wide read-only data; admins see the school.
3. **Ownership scope** - personal rows (profile, notifications, chat side,
   habits) are gated by `profile_id = my profile`.

**Grade privacy** is the strictest case: students read only their own
approved entries; the leaderboard is an aggregate-only RPC that never exposes
raw grade rows.

## 3. Server-side trust boundaries

- **No client INSERT/UPDATE on privileged tables.** Notifications are created
  only by SECURITY DEFINER functions. Conversations are mutated only through
  RPCs - the client has no direct UPDATE on `conversations`.
- **Message sender identity is forced by RLS** (`from_id = my profile`), so a
  user can't send as someone else.
- **Blocks are enforced server-side** in `ensure_conversation` and
  `send_chat_message` (either direction blocks both).
- **Protected columns** on `profiles` (role, school_id, user_id,
  academic_excellence, rank, librarian flag, student_id, faculty_id) cannot
  be changed by the user themselves. School admins can edit student/teacher
  rows in their own school, but can never change `school_id`, promote anyone
  to admin, or edit admin rows - enforced by the `protect_profile_columns`
  BEFORE UPDATE trigger plus the `profiles_admin_update` RLS policy (service
  role is the only exception, used by developer provisioning).
- **Payments cannot be completed from the browser.** Florin top-ups
  (GCash via PayMongo) credit only through `complete_payment()`, a SECURITY
  DEFINER RPC with EXECUTE revoked from PUBLIC/authenticated/anon and granted
  solely to `service_role`. The webhook route verifies PayMongo's HMAC-SHA256
  signature over the raw body (timing-safe comparison) before parsing, then
  cross-checks reference number, checkout session id, amount, currency, and
  payment status before completing anything. Row locking plus a pending-only
  gate make completion idempotent - duplicate or replayed webhooks can never
  double-credit. Full details: [PAYMENTS.md](./PAYMENTS.md). **Note: the
  top-up feature is currently switched off** (`PAYMENTS_ENABLED = false` in
  `lib/paymentsConfig.ts` - checkout refuses with 503 and the purchase modal
  shows a "coming soon" state).

## 4. Client-side hardening

- **Role routing is enforced in `middleware.ts`** on every request - it
  resolves `profiles.role` (database truth) against the
  `/student|/teacher|/admin` prefix and bounces mismatches to the user's own
  home; RLS remains authoritative for data. Lifecycle-limited accounts
  (restricted, deactivated, no profile, unconfirmed email) are locked to
  their recovery flow plus a small allowlist of API prefixes
  (`/api/bridge/`, `/api/auth`, `/api/version`) - they never get the full
  API surface; every API route authenticates its own callers regardless.
- **No service-role keys in the browser.** All client code uses the anon key.
- **Upload validation** (`lib/uploadUtils.ts`): MIME whitelist, size caps,
  extension derived from MIME (with fallback), UUID file paths. Storage
  buckets are private with owner/school policies.
- **Feedback attachments** (v1.7.66): files upload to the private
  `feedback` bucket at `{school_id}/{user_id}/{uuid}.ext` (storage RLS binds
  both folders), the API route re-validates every path against the caller's
  own school/user folder before storing `feedback_reports`, and only
  same-school admins can read objects back. The developer email gets signed,
  expiring links - files are never public. Submissions require a signed-in
  user and are always attributed; delivery goes to the `FEEDBACK_INBOX`
  environment variable (never hardcoded, so the repo carries no personal
  email addresses). An unset inbox still stores the report - only the email
  leg is lost, loudly (server log + failure note in the API response).
- **Signup anti-enumeration (v1.28.0).** Every "already exists" outcome -
  taken email, taken student ID, taken faculty ID (pre-checks and the
  database's unique indexes alike) - returns the exact same generic response
  (`"If the account is eligible, a confirmation email has been sent."`, no
  field errors, same status). Which identifier is taken is logged
  server-side only, so an attacker cannot probe for registered accounts via
  signup responses.
- **Cross-instance rate limiting (v1.28.0).** Abuse-sensitive open routes
  are limited per IP through Upstash Redis (`lib/server/rateLimit.ts`), so
  counters survive cold starts and hold across serverless instances - never
  in process memory: signup **5/hour**, resend-confirmation **3/hour**,
  music resolution **30/minute**. Exceeding a limit returns 429 with
  `Retry-After`. Without the `UPSTASH_REDIS_REST_*` env vars the limiter
  fails open with a loud server error - production must set them. Supabase
  Auth's own rate limits are the second layer on the auth endpoints.
- **Strict CSP with per-request nonce (v1.28.0).** `middleware.ts` issues a
  fresh nonce on every request and sets the Content-Security-Policy on every
  response. In production `script-src` is `'self' 'nonce-…' 'strict-dynamic'`
  - **no `'unsafe-inline'` and no `'unsafe-eval'`**; the theme flash-guard
  bootstrap script and Next.js's own inline scripts carry the nonce
  (`'unsafe-inline'` stays only for `style-src`, which React style
  attributes require). The CSP also fixes the Next.js middleware-bypass
  class of issues outright: the app runs Next.js ≥ 14.2.25
  (CVE-2025-29927), and the middleware's role/lifecycle redirects fire even
  with forged `x-middleware-subrequest` headers.
- **No version disclosure (v1.28.0).** `poweredByHeader: false` in
  `next.config.js` - responses carry no `x-powered-by`.
- **Checkout redirects fail closed (v1.28.0).** The PayMongo checkout
  success/cancel URLs are built only from the deployment's `NEXT_PUBLIC_SITE_URL`
  (`lib/siteUrl.ts`); the client-controlled `Origin` header is never used,
  so a request cannot influence where a payment redirect lands. (Checkout
  is currently disabled anyway - `PAYMENTS_ENABLED = false`.)
- **No client-side Florin minting** - balance write policies were removed
  (migration 022) and money movement happens only inside guarded RPCs:
  `purchase_shop_item` debits, and the payment webhook's `complete_payment`
  credits (see [PAYMENTS.md](./PAYMENTS.md)).
- **Theme/UX is not a security boundary** - the Midnight/Rose theme and
  cosmetic states never gate data.

## 5. Account lifecycle security

**Self-service deactivation** is a reversible flag (`profiles.deactivated_at`),
set only by the account holder through their own session (anon key + RLS) -
no admin step, no service role, enforced server-side by `middleware.ts`.
**School admins cannot deactivate other users** - enforced at the database
level since migration 061: `protect_profile_columns` raises whenever a
non-service-role caller sets or clears another user's `deactivated_at` (the
UI and its action were already removed in v1.7.66; 061 closes the
raw-API path). Self-service deactivate/reactivate still works because those
change the caller's own row.

**Account restriction** (`profiles.restricted_at`, migration 060) is the one
admin-initiated lifecycle action, for suspicious accounts. The admin (same
school only, never on admin accounts) sets `restricted_at`; the user can
still authenticate but middleware routes them to `/auth/restricted`, where
they see the notice and can submit an appeal (`account_appeals`, one open
appeal per user enforced by a partial unique index). Resolving an appeal
restores access (approved) or keeps the restriction (denied). A restriction
notice email goes out server-side through the trusted Resend path - never
from the browser. `restricted_at` itself is admin-controlled: non-admins
cannot set or clear it on any account (migration 061).

**Permanent deletion** is deliberately server-side because Supabase Auth user
deletion (`auth.admin.deleteUser`) requires privileged access:

1. **Same-school authorization** - the bridge module
   (`lib/server/accountOps.ts`) verifies the admin's
   `school_id` matches both the request's `school_id` and the target
   profile's `school_id`.
2. **Admin-only approval** - only users with `role = 'admin'` can approve
   deletion requests. The approval is an atomic claim on the pending row, so
   two admins approving concurrently can never double-delete or leave the
   request pending after a successful deletion.
3. **Server-side verification** - the admin's identity is verified via
   `supabase.auth.getUser()` and the `profiles` table (RLS + bridge module).
4. **Service-role isolation** - the `SUPABASE_SERVICE_ROLE_KEY` is used
   ONLY for the irreversible step (`auth.admin.deleteUser` + storage
   cleanup). It is server-only, never `NEXT_PUBLIC_`, never committed, and
   callers must authorize BEFORE using it.
5. **Storage ownership cleanup** - after auth deletion (which cascades the
   profile and personal data), storage objects (avatars, certificates,
   stories, materials, feed images) are collected and removed using the
   service-role client.
6. **RLS** - all pre-deletion reads (request lookup, profile verification,
   storage path collection) go through the admin's own session with normal
   RLS policies.
7. **Deactivated-user middleware enforcement** - deactivated users are
   redirected by `middleware.ts` on every request and cannot reach any app
   page except `/auth/reactivate`, login, signup, and callback routes.

**Data export** (`/api/export-account`) uses the caller's own session with
normal RLS - no service role, no bypass. A user can only export their own
data.

## 6. Known deployment caveats

- **Fake-auth fallback**: if `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are
  missing, middleware blocks nothing and stores render empty states - fine
  for UI work, a hazard if env vars are forgotten in production. Always set
  them in the deploy environment.
- **`NEXT_PUBLIC_SITE_URL` is required in production.** It is the base for
  email confirmation links and password recovery redirects. Without it,
  signup email confirmation cannot work in production (the signup bridge
  rejects signup with a configuration error) and checkout refuses to build
  payment redirects.
- **`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are required in
  production.** Without them the per-route rate limiters fail open (see §4)
  and an error is logged on the first request - a silent gap if forgotten.
- **Non-secure contexts**: `crypto.randomUUID()` throws over plain HTTP on a
  LAN; `lib/randomId.ts` falls back to a safe random id so uploads and
  optimistic updates still work.
