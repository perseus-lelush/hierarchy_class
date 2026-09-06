# Hierarchy Class - Database

This document covers the PostgreSQL schema behind the app: the main tables,
how row-level security (RLS) is structured, storage buckets, and the complete
migration index. Migrations live in `database/migrations/` - see
[`database/README.md`](../database/README.md) for how to apply them.

---

## 1. Schema overview (by domain)

### Identity & school

| Table | Purpose | Key columns |
|---|---|---|
| `schools` | The tenant (a school/campus), registered by the platform owner | name, abbreviation, active, **registration_enabled** (whether the school accepts public signup - migration 059) |
| `profiles` | One row per app user (student/teacher/admin) | user_id, role, school_id, full_name, **middle_name** (nullable), first_name, last_name, **student_id** / **faculty_id** (school-issued identifiers, unique within school), avatar_url, bio, hobbies, tags, favorite_subject, educational_level, program, level_label, section (legacy), is_librarian, **deactivated_at** (self-service deactivation timestamp, nullable), **restricted_at** (school-admin restriction timestamp, nullable - migration 060) |
| `account_appeals` | Appeals from restricted users (migration 060) | user_id, reason, status (pending/approved/denied), reviewed_by, reviewed_at; one OPEN appeal per user (partial unique index) |
| `feedback_reports` | Legacy feedback/bug report rows (migration 060). **No longer written** - feedback is email-only (FEEDBACK_INBOX) since v1.28.0; existing rows stay admin-readable | user_id, page, message, attachment_paths (paths into the private `feedback` bucket) |
| `account_requests` | Deletion requests (deactivation is now self-service) | requester_id, type ('deletion'), status |

### Academics (the hierarchy)

| Table | Purpose |
|---|---|
| `programs` | Self-referencing (`parent_id`): education levels at the top (`parent_id` NULL), programs nested under them (`parent_id` set) |
| `sections` | Year/grade level inside a program (e.g. Year 1, Grade 12) |
| `courses` | Individual subjects, assigned to a teacher, in a section |
| `course_enrollments` | Student ↔ course membership |
| `grade_entries` | The core grade row: student, course, type (a category LABEL - any label the teacher configured for the course), score + `max_score` (“out of”), `approval_status` ('pending'/'approved'/'rejected'), submitted_by |
| `course_rank_categories` | Per-course category rows (course_id, category_key, label, weight %) - teachers add/remove/edit them freely; replaced the fixed four (Quiz/Exam/Activity/Participation) in migration 040 |
| `teacher_tasks` | Tasks assigned to teachers (e.g. "submit grades") |

### Social & communication

| Table | Purpose |
|---|---|
| `school_feed_posts` | Feed posts / announcements (post_type, audience) |
| `stories` / `story_views` | MyDay stories with 24h expiry + view tracking |
| `friends` | Same-school friend pairs |
| `conversations` | ONE shared row per participant pair + per-side read/archive/delete state |
| `chat_messages` | Message rows inside a conversation |
| `chat_blocks` | Blocked pairs (either direction blocks both) |
| `notifications` | Per-user notifications (created only by RPCs) |

### Student life

| Table | Purpose |
|---|---|
| `habits` | Student-defined habits (name, category, goal type + target, daily/weekly frequency, scheduled days Mon-first, status active/paused/archived). Five defaults seeded per student by migration 053: Study 5x/week (Mon-Fri), Exercise 4x/week, Reading 30 min/day, Sleep 8 h/day, Focus 60 min/day |
| `habit_entries` | Daily habit records: one row per (student, habit, date) enforced by a UNIQUE constraint; `value` holds the amount logged (1 for a check-off, minutes/pages for duration/quantity goals) |
| `habit_pauses` | Pause windows per habit (started_at, ended_at NULL while paused). Paused days are skipped by streak math - a pause never breaks a streak and never generates missed days |
| `florin_balances` | Read-only currency balance (no client minting) |
| `shop_items` | Florin shop catalog - three types: `background` (page backdrop), `avatar_border` (avatar ring), `profile_card` (viewed-profile card background). Seeded by migrations 050-052 |
| `shop_ownership` | Which items each student owns (unique per student + item) |
| `student_shop_loadout` | What each student currently has equipped (page background + avatar border + profile card), school-readable so decorations show on other users' avatars and cards |
| `student_achievements` | Posted certificates (migration 056): four student fields - title, school_year, date_awarded, school - plus the raw certificate image public URL in the `certificates` bucket; owner insert/delete via profiles join, same-school read |
| `student_music` | Post-music-by-link posts (migration 057): original `music_url`, `platform`, resolved `title`/`artist`/`album_cover_url`; owner insert/delete via profiles join, same-school read. No audio is stored - only metadata + the external link |
| `library_books`, `library_borrow_requests`, `library_borrow_log` | Library catalog + borrow flow |
| `quizzes`, `quiz_questions`, `quiz_attempts` | Quiz engine |
| `learning_materials` | Course materials with storage file paths |
| `banner_config` | Admin-managed header banner |
| `enrollment_status` | Admin-managed enrollment: status, started_at, expires_at |
| `teacher_notes`, `teacher_schedule`, `teacher_lesson_plans` | Teacher's own workspace (notes/schedule/lessons) |
| `teacher_dashboard_prefs` | Teacher Home customization: which widgets appear and how they're arranged (layout JSONB `{widgets:[{id,size,tall,order}]}`) - presentation-only, own-row RLS |
| `admin_dashboard_prefs` | Admin Home customization, same model as teacher (migration 055) - presentation-only, own-row RLS |

### Payments (GCash via PayMongo - migrations 067-069)

| Table | Purpose |
|---|---|
| `florin_packages` | Authoritative package catalog (server-validated; the client never sets price or Florin amount): `id` text key, `name`, `florin_amount`, `price_php`, `currency`, `active`, `sort_order`. Seeded: 50/39.00, 120/79.00, 300/179.00, 650/349.00. Authenticated read only |
| `payment_transactions` | One row per purchase attempt: student + school FKs, **package/florin/amount/currency snapshots** taken at checkout, status CHECK (`pending`/`completed`/`failed`/`cancelled`/`expired`), provider (`paymongo`) session + payment ids, unique internal `reference_number`, timestamps + `failure_reason`. RLS: student reads own, admin reads same-school, **no client write policies**; a partial unique index allows at most one pending transaction per student |
| `processed_webhook_events` | Webhook deduplication ledger with `UNIQUE (provider, event_id)`; written only after safe completion so retries stay crash-safe. RLS enabled with zero policies - no browser access, service-role only |

Full flow and security model: [PAYMENTS.md](./PAYMENTS.md).

### Admin-only reference tables

`programs`, `sections`, `courses`, `course_enrollments`, `banner_config` are
managed from the admin pages and are read-only for everyone else.

---

## 2. RLS model

**Row-level security is the gate for everything.** No policy, no data. The
pattern is consistent across tables:

1. **School scoping** - every school-scoped table confirms the row belongs to
   the caller's school via `profiles` (database truth): the SECURITY DEFINER
   helpers `my_school_id()` / `my_role()` (migration 059) or an
   `EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() ...)` subquery.
   **`auth.jwt()` / `user_metadata` is never used for authorization** - the
   user can edit their own metadata, so all policies resolve school and role
   from the `profiles` row instead.
2. **Role scoping** - students, teachers, and admins see different slices:
   - Students: only their own rows (grades, habits, enrollment) or
     school-wide rows that are safe to share (roster, feed, leaderboard
     aggregates).
   - Teachers: rows for courses they teach; school-wide roster and
     enrollment status (read-only).
   - Admins: everything in their school.
3. **Ownership scoping** - personal data (profile, notifications, chat
   per-side state, habits) is gated by `profile_id = my profile`.

### Grade privacy (the strictest case)

- Students read **only their own approved** `grade_entries`.
- Teachers read rows for courses they teach.
- Admins read the whole school.
- The leaderboard is an **aggregate-only** `SECURITY DEFINER` function
  (`get_school_leaderboard`) - raw grade rows are never exposed.

### Protected columns

A BEFORE UPDATE trigger on `profiles` (`protect_profile_columns`, hardened
in migration 059) blocks:

- **users** from changing `role`, `school_id`, `user_id`, `academic_excellence`,
  rank, the librarian flag, and their school-issued `student_id` / `faculty_id`;
- **school admins** from changing `school_id` or `user_id` and from promoting
  anyone to `admin` (they can manage student/teacher rows in their own
  school, including `deactivated_at` and student/faculty IDs);
- **service role** is exempt - that is the platform-owner provisioning path.

The `profiles_admin_update` RLS policy adds a WITH CHECK that rejects any
update whose target row is an admin, so a school admin can never edit admin
rows or promote a user to admin at the policy level either.

---

## 3. Storage buckets

All buckets are **private** except `certificates`; access is enforced by
storage RLS policies.

| Bucket | Purpose | Access |
|---|---|---|
| `avatars` | Profile pictures | Owner upload/delete; school-wide read via signed URLs |
| `materials` | Teacher course materials | Teacher (own school) upload; school-wide read |
| `feed` | Feed post images | Admin/author upload |
| `myday` | Story images | Author upload; 24h signed URLs |
| `banners` | Admin banner images | Admin only |
| `certificates` | Achievement certificate images (public bucket) | Owner folder upload/delete (`{auth uid}/...`); public read so any viewer can open the raw certificate |

Paths follow `{school_id}/{profile_id}/{uuid}.{ext}` (no bucket prefix inside
the object name - storage policies parse the folder as
`{school}/{profile}/...`).

---

## 4. Server-side functions (RPCs)

Privileged or multi-row operations that can't be done safely under plain RLS
live in `SECURITY DEFINER` functions:

| Function | Purpose |
|---|---|
| `create_notification` | One notification, same-school check |
| `notify_admins` | Fan-out to all admins (grade submissions) |
| `notify_post_audience` | Fan-out announcements by audience (admin only) |
| `ensure_conversation` | Find-or-create shared thread, block-aware, race-free |
| `send_chat_message` | Insert message, bump both sides' preview, block-aware |
| `set_conversation_read` / `set_conversation_archived` | Per-side state |
| `delete_conversation` | Sets my history cutoff; clears shared preview once both sides deleted |
| `get_unread_counts` | Unread per conversation from read_at + cutoff |
| `get_school_leaderboard` | Aggregate-only rankings (approved grades) |
| `approve_grade_submission` | Batch approve/reject + one notification per teacher |
| `effective_enrollment_status` | Enrolled/expired/revoked at read time |
| `refresh_expired_enrollments` | Bulk expiry (optional hardening) |

Triggers: profile auto-create on signup, protected-column guard on `profiles`.

---

## 5. Migration index (apply in order)

All files live in `database/migrations/`.

| File | Contents |
|---|---|
| 001 | Core schema: schools, profiles, materials, library, quizzes, chat, friends, feed, banner, florin + base RLS |
| 002 | Fix RLS recursion (school-scoped reads via JWT metadata) |
| 003 | SECURITY DEFINER trigger: auto-create profile on signup |
| 004 | School-wide `profiles` SELECT policy |
| 005 | Fix `auth.jwt()` RLS syntax |
| 006 | Programs, sections, courses, enrollments, grade_entries, teacher_tasks + RLS |
| 007-009 | Library description, add-book (cover/isbn), teacher-task delete policy |
| 010 | Profile avatar column + storage |
| 011 | JSONB array defaults |
| 012 | Quizzes link to courses |
| 013 | Friends RLS (same-school) |
| 014 | notifications + RLS, conversations.last_read_at, chat RPCs, notify fan-out |
| 015 | stories + story_views + myday bucket |
| 016 | enrollment_status + effective-status function |
| 017 | profiles first/last name backfill |
| 018 | feed posts: author_id, audience, image_path + storage bucket |
| 019 | materials RLS + bucket |
| 020 | grade approval_status, hardened grade RLS, account_requests |
| 021 | banner bucket |
| 022 | Security hardening: profile column guard, chat insert identity, friends same-school, no client Florin, leaderboard aggregate RPC |
| 023 | Messaging overhaul: dedupe + unique pair, archive/delete/last_message_at, chat_blocks, rewritten RPCs, get_unread_counts, approve_grade_submission, admin profile update, nullable feed title |
| 024 | Feed `post_type` (post vs announcement), teacher read on enrollment_status, effective_enrollment_status teacher branch |
| 025 | Messaging thread rewrite: one shared row per participant pair (per-side read/archive/delete; delete = history cutoff), rewritten ensure_conversation / send_chat_message / get_unread_counts + set_conversation_read / set_conversation_archived / delete_conversation RPCs; leaderboard RPC fix (live approved average, program + educational level); notifications `cleared_at`; profiles `educational_level` |
| 029 | Habit tracker: `habit_entries` table + RLS (school-scoped through profiles) |
| 030 | Teacher workspace: `teacher_notes`, `teacher_schedule`, `teacher_lesson_plans` + RLS |
| 031 | Messaging delete fix: `delete_conversation` clears the shared last-message preview once both sides have deleted |
| 032 | Education Level Management: `programs.parent_id` self-reference so levels -> programs -> year/levels nest; idempotent orphan reparenting |
| 033 | `profiles.program` column - the program saved from Academic info (level · program · year) |
| 034 | Non-linear rank engine: `rank_config` (weights/k/ex_step/tiers/season reset map), `student_rank_state` (rank/bar/EX score/peak/highest), `rank_period_entries` (per-grade feed rows with stored weights/before-state), `season_history_log`, `rank_history_log` (event audit) + school-scoped RLS + SECURITY DEFINER RPCs (`preview_rank_update`, `confirm_and_apply_score_entry`, `process_score_entry`, `reset_period_category_totals`, `end_season`, `get_season_history`, `get_dual_rank_display`, `get_rank_config`, `update_rank_config`) |
| 035 | Admin rank ops: `end_season_for_school` (reseed every ranked student - admin only) + `get_school_season_history` (all season logs for a school) |
| 036 | Auto-feed: `grade_entries.rank_fed_at` + `feed_approved_grade_to_rank` trigger - approving a grade automatically runs `process_score_entry` (Exam->exam, Quiz->quiz, Activity/Assignment->activity, Participation->participation, score/max_score) into the current period; exactly-once per grade |
| 039 | `Participation` added as a valid `grade_entries.type` (CHECK widened); feed maps it to the rank `participation` category |
| 037 | Revert: `rank_period_entries.source_grade_id` + before-state columns (rank/bar/ex/peak at apply time); `revert_grade_rank_feed(p_grade_id)` deletes the feed, restores the before-state, and REPLAYS all later entries through the engine math; rejection or deletion of an approved grade now undoes its rank effect (`feed_reverted` event) and re-approval feeds again |
| 038 | Teacher-grade flow: `grade_entries.max_score` (“out of” scores), `course_rank_weights` (per-course category percentages, teacher-saved, sum 100), `school_semesters` (admin-declared active semester = the feed's grading period); `preview/confirm/process_score_entry` take optional `p_weights`; feed uses score/max_score + course weights + active-semester period |
| 040 | Dynamic categories: `course_rank_categories` replaces `course_rank_weights` (dropped); `grade_entries.type` CHECK dropped (type now stores a category label); `save_course_rank_weights` takes an ARRAY of {key,label,weight} and replaces the whole set (add/remove/edit in one call, must sum 100); `get_course_rank_weights` returns the array or the school default four; the feed maps label -> key via the course's rows (legacy built-in fallback) and stores per-entry weights; `revert_grade_rank_feed` replay rewritten category-agnostic so reverts never break for custom categories |
| 041 | Students seed at **D** (not C): `student_rank_state` defaults for current/peak/highest -> 'D'; preview's synthetic state + revert replay anchor default to D; existing rows replayed from a D/0 seed through their period entries so live data matches the new "start at the bottom, fill to 100%, then promote" rule |
| 042 | Season-end reset keys off the FINAL rank (S mid-season ending at A resets to D); the PEAK stays in `season_history_log.peak_rank`, drives `highest_rank_ever`/`ex_achieved`, but no longer decides the reset |
| 043 | Auto-adopt grading period: `confirm_and_apply_score_entry` adopts the caller's period instead of raising "Period mismatch" (rank/bar carry over, the new period's entries form the next feed); backfills all approved-but-unfed grades |
| 044 | Semester gate: `guard_grade_submission_requires_semester` BEFORE INSERT trigger on `grade_entries` blocks ANY grade submission when the school has no active semester (teachers must ask the admin to declare it first) |
| 049 | **PER-ENTRY ISOLATED FILL (permanent, supersedes 047):** the period-cumulative category running average and the composite blend across categories (S) are removed. Each grade entry computes its own fill independently from its own score and category weight share - `entryPct = earned/possible*100`, `Adjusted = 100*(min(entryPct,100)/100)^k`, `fillChange = ((Adjusted-50)/50)*(100/n)*weightShare` where `weightShare = w[cat]/sum(ALL configured weights)`. Applied in `preview_rank_update`, `revert_grade_rank_feed` (both branches), and the replay; the EX >= 50 check uses the UNCAPPED adjusted of the single entry (`Adjusted_uncapped = 100*(entryPct/100)^k`). 046's period-baseline clear fix is kept; existing states replayed with the new math |
| 048 | Publish app tables to `supabase_realtime`: `profiles`, `grade_entries`, `student_rank_state`, `rank_period_entries`, `rank_history_log`, `habit_entries`, `chat_blocks`, `chat_messages`, `notifications` were subscribed to via postgres_changes but never in the publication, so no realtime event ever reached the browser (rank bars, habits, messages, notifications all silently required a full reload). Idempotent add |
| 050 | Florin shop: `shop_items` (catalog, seeded), `shop_ownership` (unique per student + item), `student_shop_loadout` (equipped background + border, school-readable for decorations) + RLS + `purchase_shop_item` / `equip_shop_item` / `unequip_shop_item` SECURITY DEFINER RPCs (no client-side Florin writes) + publish shop tables to realtime |
| 051 | Third shop type: `profile_card` (viewed-profile card background). Extends the `shop_items.type` CHECK, adds `student_shop_loadout.profile_card_item_id`, extends `equip_shop_item`/`unequip_shop_item` for the new slot, seeds 4 SVG card backgrounds |
| 052 | Girls' theme shop: renames the `Golden Hour` background to `Samurai Sword` and seeds the two pink page backgrounds (Pink Butterfly, Pink Cat) for the Rose theme |
| 053 | Full habit tracker: new `habits` table (goal type/target, daily vs weekly frequency, Mon-first `scheduled_days`, status) + `habit_pauses` pause windows, both RLS-protected (own-row students, school-wide admins) and published to realtime. Re-keys `habit_entries` onto `habits.id` (backfills legacy `habit_type` rows, drops the column) and moves the uniqueness constraint to `(student_id, habit_id, entry_date)`. Seeds the five default habits for every student |
| 054 | Teacher dashboard prefs: `teacher_dashboard_prefs` (own-row RLS via profiles join, `teacher_id` unique, layout JSONB `{widgets:[{id,size,tall,order}]}`) - presentation-only Home customization, empty by default |
| 055 | Admin dashboard prefs: `admin_dashboard_prefs` (own-row RLS via profiles join, `admin_id` unique, layout JSONB) - same presentation-only model as teacher, empty by default |
| 056 | Student achievements: `student_achievements` (title, school_year, date_awarded, school, image_path; owner insert/delete via profiles join, same-school read) + public `certificates` storage bucket (owner folder write/delete mirroring avatars, public read) |
| 057 | Student music: `student_music` (music_url, platform, title, artist, album_cover_url; owner insert/delete via profiles join, same-school read) - metadata resolved server-side (keyless oEmbed for YouTube/SoundCloud/Vimeo, iTunes lookup for Apple Music, Spotify keyless oEmbed with optional Web API upgrade), links out only |
| 058 | Account lifecycle: `profiles.deactivated_at` (self-service, reversible deactivation; no data deleted). Deletion-safe FKs - school-required records (`grade_entries`, `course_enrollments`, `rank_period_entries`, `season_history_log`, `rank_history_log`, `library_borrow_log`, teacher/admin attribution on `learning_materials`/`quizzes`/`teacher_tasks`/`library_books`) switch to ON DELETE SET NULL (preserved + anonymized when the profile is deleted); `quiz_attempts` switches to CASCADE (personal). `get_school_leaderboard` excludes deactivated students |
| 059 | **Auth/registration restructure:** `schools.registration_enabled` (platform-owner controlled); `profiles.middle_name` + `student_id` + `faculty_id` with partial unique indexes `(school_id, student_id)` / `(school_id, faculty_id)` (NULL-safe); hardened `handle_new_user()` (rejects `role='admin'` and non-registered schools at the DB level, persists new fields, forces `is_librarian` to teacher-only, skips florin for provisioned accounts); SECURITY DEFINER helpers `my_school_id()` / `my_role()`; all `auth.jwt() -> user_metadata` school-read policies rewritten to profiles truth (`profiles_school_reads_all`, materials/books/quizzes/feed/banner/programs/sections/courses/enrollments/stories/achievements/music); removed `profiles_user_inserts_own` (trigger-only profile creation) and `schools_admin_write` (platform-owner managed; also fixed the `profiles.id = auth.uid()` bug); hardened `protect_profile_columns` + `profiles_admin_update` (school admins can't move users across schools, can't promote to admin, and can't modify an existing admin account at all - no demotion, no authorization-field edits; only the service-role provisioning path creates/modifies admins); fixed cross-school write holes (`quizzes_teacher_create`, `banner_admin_insert`, `grade_entries_teacher_write`/`delete` now school-scoped for admins); owner-insert policies (`stories_own_create`, `achievements_own_insert`, `music_own_insert`, `quiz_attempts_student_create`, `borrow_requests_student_create`, `account_requests_own_create`) now require `school_id = my_school_id()` |
| 060 | **v1.7.66 hardening:** `profiles.restricted_at` (admin-only restriction of suspicious accounts - separate from self-service `deactivated_at`); `account_appeals` (one open appeal per user, partial unique index, own-create + same-school-admin read/resolve policies, realtime); `feedback_reports` + private `feedback` bucket (`{school_id}/{user_id}/{uuid}.ext`, owner write + same-school-admin read); `get_profile_email()` SECURITY DEFINER (returns a user's auth email only to a same-school admin - used by restriction notices); `send_chat_message` now creates an in-app notification with a link straight into the conversation (role-appropriate `/student|teacher|admin/messages?with=<sender>`, skipped when the recipient read the thread within 2 minutes) |
| 061 | **Deactivation is self-service only** - `protect_profile_columns` now raises when any non-service-role caller sets or clears another user's `deactivated_at` (the UI/action were already removed in v1.7.66; this closes the raw-API path found in the production audit) and blocks non-admins from changing `restricted_at` (admin-controlled state) |
| 062 | **Fix `appeals_own_create`** - the migration-060 policy's unqualified `user_id` inside the `EXISTS` subquery resolved to `profiles.user_id` (`p.id = p.user_id`, never true), so appeals could never be submitted; now correlates `account_appeals.user_id` explicitly |
| 063 | **Fix `send_chat_message`** - 060 rewrote it against a `participant_id`/`other_user_id` schema that does not exist (all message sends failed with `42703`); restored the real `user_a_id`/`user_b_id` logic (025 semantics: other side revived from archive, `deleted_at` untouched) and kept the 060 notification with the `?with=<sender>` link |
| 064 | **Fix storage owner policies** - feedback + myday owner write/update/delete compared folder 2 to `auth.uid()` but client paths use the profile id (broken since 059's `profiles.id != auth.uid()` fix); now resolve the caller's profile id; fixes feedback uploads and pre-existing story image uploads |
| 065 | **Feedback owner read** - reporters can read (and the Storage API can delete) their own feedback attachments; admin read unchanged |
| 066 | **Rank history student read** - `rank_history_school_read` tightened: students read only their own `rank_history_log` rows (needed by the student-facing History feature); admins/teachers keep school-wide read |
| 067 | **GCash payment system:** `florin_packages` (server-authoritative catalog, seeded 50/39.00, 120/79.00, 300/179.00, 650/349.00), `payment_transactions` (full lifecycle with package/amount snapshots + five-state CHECK), `processed_webhook_events` (`UNIQUE (provider, event_id)` dedup); RLS: authenticated package reads, student-own + school-scoped admin transaction reads, no client writes anywhere |
| 068 | **`complete_payment(p_transaction_id)` SECURITY DEFINER RPC** - locks the row FOR UPDATE, processes only `pending` transactions (idempotent, terminal states final), completes the payment, credits `florin_balances`, and inserts the ledger entry; EXECUTE revoked from authenticated/anon and granted to `service_role` only |
| 069 | **Payment hardening:** `complete_payment` re-issued with an explicit `REVOKE ... FROM PUBLIC` (Postgres grants PUBLIC EXECUTE on new functions by default) and a balance **upsert** so a missing `florin_balances` row can never swallow a paid credit; partial unique index `(student_id) WHERE status = 'pending'` caps open checkouts at one per student |
| 070 | **Library overhaul:** `library_books.location` (shelf/rack), `library_borrow_requests.requested_days` (student-chosen loan length; approval uses it instead of the old hardcoded 14), and `library_borrow_log.due_date` + `overdue_days` + `fine_amount` (due date captured on the borrowed event; fine of PHP 10/day levied on the returned event) so fines/receipts stay accurate after the book's borrow fields are cleared |
| 071 | **Library student request RPC:** `request_library_book(p_book_id, p_days)` SECURITY DEFINER function atomically inserts the borrow request AND flips the book to `requested`. Fixes the student request flow - students can't UPDATE `library_books` under RLS (`books_teacher_update` is teacher-only), so the old two-step client write silently failed and the book never showed as requested |
| 072 | **Library borrow log RLS policies:** `library_borrow_log` was RLS-enabled with no policies, silently blocking every client read/write (history, fines, receipts all returned nothing). Adds `borrow_log_student_read` (own rows), `borrow_log_teacher_read` (school-scoped), and `borrow_log_teacher_insert` (teachers/librarians only) |
| 073 | **Rename shop items:** `Pale Gold Ring` → `Pearl Ring`, `Gold Ribbon` → `Royal Ribbon` — item names contained "gold" but the actual colors/appearance (`#C2C7CF` light gray, no accent) did not match |
| 074 | **Profile privacy (v1.29 beta):** `profiles.profile_private` / `friends_private` / `history_private` toggles; rank history hidden from other students when the owner sets history_private (replaces 066 own-rows-only); friend-list rows hidden from outsiders when either party is private |
| 075 | **Group chat (v1.29 beta):** unified conversations for 1:1 + groups (`is_group`/`title`/`created_by`, nullable `user_b_id`), `conversation_members` with per-member read/archived/deleted state, `is_chat_participant()`, group-aware RLS + RPCs (send/read/archive/delete/unread), `create_chat_group` / `add_chat_group_members` / `leave_chat_group` |
| 076 | **Display-name rename (v1.30):** `profiles.name_changed_at` + `guard_profile_name_change` trigger - self-service renames once per 30 days (DB-enforced), non-blank rule, re-derives `full_name`/`initials`; service-role and same-school staff exempt |
| 047 | ~~Restore composite bar fill~~ **SUPERSEDED by 049** - 045's weight-dominant experiment was briefly reverted, then permanently replaced by per-entry isolation (049) |
| 046 | Period baseline: `student_rank_state` gains `period_start_rank/bar/ex_score/peak` (captured when the grading period is adopted); `revert_grade_rank_feed` now recomputes order-independently from the baseline + all remaining current-period entries, so bulk-clearing all grades (admin → clear course data) collapses the state to the baseline (D/0 for a fresh student) instead of leaving a stale bar residue; old-period deletions keep the anchor + replay path |


> Numbers 026-028 were created and removed during the rank-system rollback;
> the sequence is intentionally 025 -> 029.

---

## 6. Account lifecycle (migration 058)

Migration 058 introduces self-service deactivation and deletion-safe foreign
keys. The two behaviors are independent:

### Deactivation (`profiles.deactivated_at`)

- **Self-service.** Any student or teacher sets `deactivated_at` to the current
  timestamp; no admin step required.
- **Reversible.** Reactivation clears the timestamp. Nothing is deleted on
  deactivation.
- **Server-enforced.** `middleware.ts` redirects deactivated users to
  `/auth/reactivate`; they can only reach that page, login/signup, and
  callback routes. The profile's `deactivated_at` column is checked on every
  request.
- **Indexed.** A partial index (`idx_profiles_deactivated`) covers only
  rows where `deactivated_at IS NOT NULL`.
- **Excluded from:** the leaderboard (`get_school_leaderboard` filters
  `deactivated_at IS NULL`), active user searches (`useSchoolProfiles`
  filters `.is('deactivated_at', null)`), and friend lists (`friendsStore`
  excludes deactivated peers).
- **Admins** cannot deactivate their own account through the app.
- **DB-enforced self-service only (061).** `protect_profile_columns` raises
  when any non-service-role caller sets or clears another user's
  `deactivated_at` - a school admin can no longer deactivate a user through
  the raw API either (the restriction state is the admin-controlled path).
  `restricted_at` is likewise admin-only: non-admins cannot set/clear it.
- **No profile row?** An authenticated auth user without a `profiles` row
  (e.g. accounts created before the `handle_new_user` trigger existed) is
  routed to `/auth/incomplete` and can only sign out; completing the account
  is a platform-owner action (insert the profile via the service-role path).

### Permanent deletion (admin-approved)

1. Student/teacher submits a deletion request via `account_requests` (type
   `'deletion'`).
2. A same-school admin reviews the request in **Settings → Account requests**.
3. On approval, the bridge module `resolveDeletionRequest`
   (`lib/server/accountOps.ts`) atomically claims the pending request, then uses the
   **service-role client** (`lib/supabase/serviceClient.ts`) to call
   `auth.admin.deleteUser()`.
4. `auth.users` → `profiles` cascades via `ON DELETE CASCADE` (migration 001),
   removing the profile row.
5. Migration 058's FK changes determine what happens to related data.

### Deletion-safe FK behavior

Migration 058 reclassifies foreign keys into two categories:

#### School-owned historical data → `ON DELETE SET NULL`

These records are **preserved** when the profile is deleted; the referencing
column is set to `NULL`, removing the identity while keeping the school's
academic record intact.

| Table | Column(s) | Purpose |
|---|---|---|
| `grade_entries` | `student_id`, `submitted_by` | Student grades + teacher attribution |
| `course_enrollments` | `student_id` | Course membership history |
| `rank_period_entries` | `student_id` | Per-grade rank feed entries |
| `season_history_log` | `student_id` | Historical season outcomes |
| `rank_history_log` | `student_id` | Rank change audit log |
| `learning_materials` | `uploaded_by` | Teacher-uploaded materials |
| `quizzes` | `created_by` | Teacher-created quizzes |
| `teacher_tasks` | `assigned_by` | Admin-assigned teacher tasks |
| `library_books` | `borrowed_by` | Library book ownership (borrower identity removed) |
| `library_borrow_log` | `student_id` | Library borrow history |

#### Personal data → `ON DELETE CASCADE`

These records are **removed** with the profile. Most were already cascading;
migration 058 switches `quiz_attempts` from `NO ACTION` to `CASCADE` so it no
longer blocks deletion.

| Table | What it holds |
|---|---|
| `student_achievements` | Posted certificates |
| `student_music` | Music link posts |
| `stories` / `story_views` | MyDay stories |
| `habits` / `habit_entries` / `habit_pauses` | Habit tracker data |
| `quiz_attempts` | Personal test results (changed from NO ACTION → CASCADE) |
| `chat_messages` / `chat_blocks` | Messaging data |
| `notifications` | Notification records |
| `florin_balances` / `shop_ownership` / `student_shop_loadout` | Florin currency and shop items |
| `student_rank_state` | Current rank state |
| `friends` | Friend relationships |
| `school_feed_posts` | User-authored feed posts |

#### Storage cleanup

After the DB cascade, the bridge module collects storage paths from the
(now-deleted or about-to-be-deleted) DB rows (avatar, certificates, stories,
materials, feed images) and removes them from Supabase Storage using the
service-role client. This is best-effort per bucket - failures are reported
back but never leave a half-deleted account.
