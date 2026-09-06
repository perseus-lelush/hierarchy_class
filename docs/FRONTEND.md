# Hierarchy Class - Frontend

Next.js 14 (App Router) + React 18 + TypeScript + Tailwind. Pages live in
`app/`, reusable UI in `components/`, and the data layer in `lib/`.

---

## 1. Pages by role

| Area | Pages |
|---|---|
| Public | `/` (marketing landing), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/reactivate`, `/auth/restricted` (restricted-account appeal), `/auth/incomplete` (signed-in user with no profile), `/terms`, `/privacy` |
| Student | `/student/home`, `/student/search`, `/student/messages`, `/student/learning-materials`, `/student/library`, `/student/quiz`, `/student/leaderboard`, `/student/shop`, `/student/profile`, `/student/profile/[id]`, `/student/habits`, `/student/settings` |
| Teacher | `/teacher/home`, `/teacher/workspace`, `/teacher/classroom`, `/teacher/students`, `/teacher/quiz`, `/teacher/learning-materials`, `/teacher/library-management`, `/teacher/messages`, `/teacher/settings` |
| Admin | `/admin/home`, `/admin/users`, `/admin/programs`, `/admin/students`, `/admin/teachers`, `/admin/reports`, `/admin/ranks`, `/admin/messages`, `/admin/settings` |

Each role has its own `layout.tsx` (wraps `AppShell`) and `loading.tsx`.

---

## 2. Data layer

**Stores** are React context providers mounted in `app/layout.tsx` - they
fetch on mount, refetch on a tick, and subscribe to Realtime. **Hooks** are
per-page (leaderboard, rosters, enrollment). All are Supabase-backed; there
is no mock data.

| Provider / hook | Purpose |
|---|---|
| `ClassroomHierarchyProvider` | Education levels -> programs -> year/levels -> courses -> enrollments + grade getters |
| `ChatProvider` | Shared-thread messaging (see ARCHITECTURE §5) |
| `NotificationsProvider` | Notification bell + mark read |
| `SchoolFeedProvider` | Feed/announcements |
| `StoriesProvider` | MyDay stories |
| `MaterialsProvider` | Course materials |
| `HabitProvider` | Habits, entries, pause windows + CRUD/log actions (student-scoped RLS, realtime) |
| `FriendsProvider` | Friends |
| `BannerProvider` | Header banner |
| `FlorinProvider` | Read-only currency balance (exposes `refetch` so the shop can re-sync after a purchase) |
| `ShopProvider` | Florin shop catalog, ownership, equipped loadout, purchase/equip RPC calls, avatar-border color map |
| `LibraryProvider` | Catalog + borrow flow |
| `QuizProvider` | Quiz engine |
| `TeacherTasksProvider` | Teacher tasks |
| `TeacherWorkspaceProvider` | Teacher notes/schedule/lesson plans |
| `TeacherPrefsProvider` | Teacher Home customization (`teacher_dashboard_prefs`) - presentation-only structured widget grid (size/tall/order, CSS Grid) |
| `AdminPrefsProvider` (admin layout) | Admin Home customization (`admin_dashboard_prefs`) - presentation-only structured widget grid (size/tall/order, CSS Grid); empty by default, presets available from the customizer |
| `useMyProfile` | Current profile + avatar upload |
| `useSchoolProfiles` | School roster by role |
| `useRankStore` (`RankProvider`) | School-wide rank state - `rankOf(profileId)` + `sorted` (best-first); realtime refetch on `student_rank_state` |
| `useMyEnrollment` / `useAdminEnrollments` | Enrollment status |
| `useAccountRequests` | Deactivate/delete requests |
| `useAppeals` | Restricted-account appeals (list, approve/restore, deny) - admin review surface in Admin Settings |

---

## 3. Design system

- **Tokens** in `app/globals.css` (`--bg`, `--surface`, `--border`, `--muted`,
  `--text`, `--gold`, ...). **Midnight** on `.dark` (default), **Rose** on
  `.pink`, picked by `ThemePicker` (settings, every role) and persisted in
  `localStorage` under `hc-theme`. The legacy light theme (`:root`) is no
  longer offered in the picker.
- **Fonts** loaded once in `app/layout.tsx` (Google Fonts): **Inter** (body),
  **Cinzel** (display - `font-display`), **IBM Plex Mono** (labels -
  `font-mono-ui`). `body` uses the Inter stack, so the in-app pages and the
  public landing/auth pages share the same type.
- **Inside/outside blend** - the role dashboards use the same typography as
  the public pages: every section eyebrow is a mono uppercase label
  (`.section-label` in `app/globals.css`, e.g. LATEST SCHOOL FEED, WEAKEST
  SUBJECT, SUBJECT STATS, HABIT TRACKER, WEEKLY PROGRESS, the teacher
  workspace card headers, and the admin home section headers), the big
  greetings ("Good morning, ...") and the student profile name render in
  Cinzel, and the sidebar brand is the crown mark (`CrownMark`).
- **Tailwind** with the token set in `tailwind.config.ts`; a few utility
  classes (`text-navy`, `bg-tile`, `border-base`, ...) are defined in
  `globals.css` so they follow the theme variables. The content globs scan
  `app/`, `components/`, **and `lib/`** - so class strings defined in lib
  are actually generated.
- **Cards**: `CornerFrame` - flat 1px hairline border, 10px radius, no shadow.
- **Accent**: Great Falls (`--gold`) - used for ranks, fills, primary accents.
- **Shared UI** in `components/ui/`: `RankTriangle` (the inverted-triangle
  rank emblem: layered glow + rank fill, no letters inside the shape, rank
  label beneath) + `RankBadge` (triangle + bar / EX score + track, fed by the
  rank engine), `StatBar`, `StatRadarChart`,
  `EnrolledBadge`, `UserAvatar` (+ theme-adaptive `DefaultAvatar`), `CornerFrame`,
  `CrownMark` (logo), `CoinIcon`.
- **Home intelligence components** in `components/dashboard/`:
  `RankDistribution` (tier counts + mean bar + top students - used school-wide
  on the admin home and filtered to own students on the teacher home) and
  `SemesterProgress` (progress + days remaining from the active semester
  dates, with an empty state that links to declaring a semester).

### 3.1 UI plan and rationale

The whole interface follows one idea: **flat, quiet, typographic - the data
is the decoration.** No gradients, no glows, no drop shadows, no hero
images inside the card system. Every card is a flat panel defined only by a
1px hairline border; color is used sparingly (one accent, one warning tone,
(the **single deliberate exception** is the rank emblem - `RankTriangle`
carries a restrained layered glow so EX reads as legendary/glowing while
remaining minimalist when the glow is reduced; everything else stays flat).
neutrals everywhere else) so the rank bar and the numbers stand out.

Layout:

- **Sidebar** - fixed-width icon rail on the left (the app brand at the
  top, nav icons below, avatar + sign-out at the foot). The active item gets
  a subtle background tint and a 2px accent left-border; hovering shows a
  small tooltip label. Icons come from the already-loaded icon set - no new
  icon dependency.
- **Top bar** - school name on the left; on the right the currency pill
  (coin icon + balance + small "+") and a notification bell with a small
  unread dot.
- **Search bar** - flat rounded rectangle under the top bar (students,
  teachers, people). `QuickSearchBar`'s magnifier sits at the original
  placement (left-4, vertically centered, `pl-11` input) and was made
  clearly visible in v1.7.66 (18px, thicker stroke, `--muted` color, gold on
  focus) - it was low-contrast in the Rose theme before.
- **Content** - on desktop the student home is a two-column grid: the left column is
  the school feed (StoriesRail + feed posts), the right column stacks the
  five cards in a fixed order: **Profile/rank card → Weakest Subject →
  Subject Stats → Habit Tracker → Weekly Progress** (16px gap between). On Android phones (< 768px, `md:hidden`) the identity/rank card appears prominently directly below the header as the first card on Home, reusing the existing `ProfileRankCard` (same avatar, name, level, `RankBadge` bar/EX score, and equipped profile-card background), followed by search, stories, and the feed; the right column is hidden and its stat widgets remain accessible via the drawer. Tablet (768px+) keeps the previous layout.

Why this design?

- **Tokens over hex.** Every color routes through CSS variables, so the
  Midnight/Rose theme and any future rebrand happen in one file
  (`app/globals.css`), not across hundreds of pages.
- **Shared primitives.** `CornerFrame`, `RankTriangle`/`RankBadge`, `UserAvatar`,
  `EnrolledBadge` are used by student, teacher, and admin pages alike - fix
  them once and every role picks up the change (this is how the rank
  redesign reached all roles without per-page edits).
- **Command-center primitives** (added in 1.4.25 modernization): `CornerFrame`
  is now a real card primitive (hairline border, surface bg, 10px radius,
  compatible defaults - existing callers that pass their own border/background
  keep theirs). `Button` (primary/gold/outline/danger/ghost pills), `Stat`
  (number + mono label), `Chip` (neutral/gold/success/warn/danger - all
  token-driven, no hardcoded emerald/blue/red), `Bar` (thin progress),
  `MiniBars` (compact 7-day trend), and `Modal` (PostEditor's shell, now
  shared). Theme-aware accent utilities live in `globals.css`:
  `text/bg/border-gold-token`, `bg/border-gold-soft`, `bg/border-warn-soft` -
  these track `--gold`/`--warn` so Rose gets Mountain Mist instead of the
  fixed Great Falls hex. Admin home is structured as bands (header → current
  state → hierarchy → pipeline → attention → workflow → communication) with
  skeleton loading and composed empty states.
- **One accent.** The rank system is the game; the accent (Great Falls) is
  reserved for it plus primary actions. Everything else is neutral greys so
  nothing competes.
- **Admin Students - second reference implementation (1.4.25).**
  `app/admin/students/page.tsx` is the management/workflow companion to the
  Admin Home command center. It keeps the same design grammar - hairline
  `CornerFrame` cards, `section-label` eyebrows, `Stat` snapshot strip
  (registered / active / expiring within 7 days / revoked, computed from the
  live enrollment statuses), a compact search bar with a live result count,
  and a two-column roster + detail layout. List rows carry `UserAvatar`,
  `RankBadge` pill, and an enrollment `Chip`; the detail panel shows identity
  with `RankBadge` + `Bar` progress, a stat strip (grades / courses /
  average), enrollment (dates + Enroll/Renew/Revoke via `Button`), the
  academic cascade (education level → program → year level), and the
  per-course breakdown. Native `confirm()` dialogs were replaced with  a `Modal`-based destructive confirmation. Skeleton loading mirrors the real
  geometry, empty states are composed `EmptyState`s, and every status uses
  tokens (no amber/red/emerald) so Rose stays correct.
- **Admin Programs - hierarchy management (1.4.25).**
  `app/admin/programs/page.tsx` manages the Education Level → Program → Year
  Level → Course → Students drill-down and keeps that hierarchy visible at
  every step: a mono breadcrumb trail (clickable to jump back), a compact
  4-`Stat` hierarchy snapshot (education levels / programs / year levels /
  courses - all derived from the live store, no fake metrics), and a
  drill-down grid of management cards. Cards carry `Chip` child counts, a
  chevron affordance, and shared `Button` icon actions (edit/delete). Create
  and edit forms now open in the shared `Modal` shell (with the entity context
  in the eyebrow/description), and destructive deletes use the shared `Modal`
  confirmation instead of native `confirm()`. Composed `EmptyState`s per step
  with inline create actions, skeleton cards on first load, `UserAvatar` +
  `RankBadge` in the student roster, and token-only colors throughout.
- **Admin Teachers - workforce management (1.4.25).**
  `app/admin/teachers/page.tsx` manages the teaching workforce with the same
  design grammar as Students/Programs: a header band (`font-display` title +
  mono "Teacher management · N registered" line, with a pending-grades `Stat`
  anchored right), a compact 4-`Stat` snapshot computed entirely from live
  store data (teachers / assigned courses / distinct classes / pending
  teacher tasks), and a two-column directory + detail layout. Roster rows
  carry `UserAvatar`, a course/class workload line, and a warn `Chip` when
  the teacher has pending tasks. The detail panel shows identity with a
  pending-grades `Chip`, a 3-`Stat` strip (courses / students / grades
  submitted), and `section-label` sections for assigned courses (with
  section, student count, and average), recent grading activity, and
  assigned tasks. The legacy `ActionButton` assign form was replaced with the
  shared `Button` (gold submit + ghost toggle), task statuses use token
  `Chip` variants, and empty/loading states are composed `EmptyState`s and
  geometry-matching skeletons. Every number derives from existing hooks
  (`useSchoolProfiles`, `useTeacherTasks`, `useClassroomHierarchy`) - no new
  queries, no mock data, no `confirm()` on this page.
- **Admin Ranks - the ladder as the hero (1.4.25).**
  `app/admin/ranks/page.tsx` treats the rank ladder as the visual centerpiece:
  a gold-haired `CornerFrame` "The ladder" band renders D → C → B → A → S → S+
  → S++ → EX through the shared `RankTriangle` emblem (rank identity in the
  triangle, neutral letters below - the same visual language as the landing
  page ladder and `RankDistribution`), each tier with its product note
  (Fresh start … Exceptional) and the real season-reset rule (S and above → C, A
  and below → D). Below it: live standings (rank position,
  `UserAvatar`, `RankBadge` + bar/EX score) and a season-control rail -
  Declare semester (`declare_semester`, shared `Button` + inputs), End season
  (`end_season_for_school`), and Season history (`get_school_season_history`
  with peak `RankBadge`, final → reset mono line, and an "EX achieved"
  `Chip`). The destructive End-season action now opens the shared `Modal`
  confirmation (what changes, who it affects, irreversible) instead of native
  `confirm()`. Loading uses geometry-matching skeletons, empty states are
  composed `EmptyState`s, and surrounding UI is token-only. All RPC calls and
  handlers are byte-for-byte unchanged - this page is standings + season
  management; the rank engine and its DB-only config RPCs
  (`get_rank_config` / `update_rank_config`) remain untouched.
- **Admin Settings - the configuration surface (1.4.25).**
  `app/admin/settings/page.tsx` brings the last legacy admin page onto the
  shared grammar. The header follows the reference pages: a `font-display`
  "System configuration" title with a mono "Portal appearance · account
  management" line, and a live pending-account-requests `Stat` (warn tone
  when > 0) anchored right. The three existing sections (Appearance,
  Feedback & report, Account requests) now use `section-label` eyebrows with
  `CornerFrame` surfaces instead of inline `text-gold`/`text-navy` headers.
  The account-request list replaces plain text states with geometry-matching
  skeleton rows, a warn-token error banner, and a composed `EmptyState`;
  pending rows use `UserAvatar` + name/role metadata with shared `Button`s
  (gold Approve with check icon, outline Deny with X icon), and resolved
  requests render a token `Chip` (success/danger). The version footer is now
  mono-faint. All data hooks (`useAccountRequests`), the `resolveRequest`
  handler, `ThemePicker`, `FeedbackForm`, and `APP_VERSION` are unchanged.
  A **Restricted accounts** section (v1.7.66) lists restricted users and open
  appeals (`useAppeals`) with gold Restore + outline Deny `Button`s wired to
  the `resolveAppeal` bridge implementation - restoring an account clears
  `restricted_at`, denying leaves it restricted and the appeal resolved.
- **Admin Users - the school directory (1.4.25, v1.7.66).**
  `app/admin/users/page.tsx` is the directory surface: a header band with a
  `font-display` "School directory" title, mono "Users · N registered" line,
  and a students `Stat` (with the teacher count as its hint) anchored right.
  A compact control bar holds the search input (with a live mono result-count
  chip, styled like the reference pages' `focus:border-gold` inputs), the
  All/Students/Teachers role tabs (active state uses `border-gold-token`),
  and a shared outline `Button` "Refresh" (new reusable `IconRefresh`). The
  roster rows use `UserAvatar` (with `profileId` so equipped avatar borders
  follow), name + level metadata, a role `Chip` (gold for teachers, neutral
  for students - replacing the old static `bg-gold/20 text-gold` pill), and
  `RankBadge` for students. **The Deactivate button/action was removed in
  v1.7.66** - school admins cannot deactivate/suspend/ban accounts directly
  (the `adminSetUserDeactivation` action is gone); instead the row
  offers **Restrict** (temporarily block a suspicious account, sets
  `profiles.restricted_at`, triggers the restriction email) / **Restore**
  (clears `restricted_at`), and deactivation requests flow through the
  existing `account_requests` approve/deny workflow. Plain text states were
  replaced with
  geometry-matching skeleton rows, a warn-token error banner, and composed
  `EmptyState`s (distinct "No users yet" vs "No users found" with a clear
  search & filters action). All filtering semantics, `useSchoolProfiles`
  (`excludeSelf`), `useRankStore`, and the `refetch` handler are unchanged.
- **Teacher Students - the roster + detail surface (1.4.25).**
  `app/teacher/students/page.tsx` keeps its two-column roster + detail
  workflow but on the shared grammar: a header band (`font-display` "My
  students" title, mono "Student roster · N at school" line, and a roster-
  average `Stat` derived from approved grades anchored right), a
  `section-label` roster card with a search input carrying a live mono
  result-count chip, and dense rows (`UserAvatar` with `profileId`,
  `EnrolledBadge`, and the level/identity line - no rank next to the name
  and no Tags/Favorite pills, per the v1.7.66 minimalist search cleanup;
  rank lives in the detail panel). Selection now
  uses `border-gold-token` / `hover:border-gold-soft` instead of the old
  `border-sealion` treatment. The detail card leads with the student identity
  box, then a 2-`Stat` strip (Average / Enrollment), then
  `section-label` sections for Rank progress (with bar/EX score) and
  Student details (level + student ID). Plain text states were replaced
  with geometry-matching skeleton rows, a warn-token error banner, and
  composed `EmptyState`s ("No students yet" / "No students found" with a
  clear-search action). All teacher-scoping is byte-for-byte unchanged: the
  roster is `useSchoolProfiles({ role: "student" })` (RLS school boundary)
  with per-student program/section identity derived from the existing
  `useClassroomHierarchy` enrollments, plus `useSchoolEnrollments` and
  `useRankStore` - no new queries, no broadened scope.
- **Teacher Settings - the teacher configuration surface (1.4.25).**
  `app/teacher/settings/page.tsx` mirrors Admin Settings' grammar while
  staying teacher-specific: a header band (`font-display` "Preferences and
  account" title + mono "Teacher settings · appearance, feedback, account"
  line, no invented stats), then `section-label` `CornerFrame` sections for
  Appearance (`ThemePicker`) and Feedback & report (`FeedbackForm` - up to
  3 attachments, 2 MB each, JPG/PNG/WebP/GIF/PDF, uploaded to the private
  `feedback` bucket before submit). The
  Account section keeps its warn-tone card (`CornerFrame tone="warn"`,
  replacing the old inline `border-warn-soft`). Deactivate account is now
  **self-service and immediate** (the deactivate bridge call in
  `lib/server/accountOps.ts` sets `profiles.deactivated_at`, then signs out) - a
  confirm modal explains nothing is deleted and that reactivation is possible.
  Request account deletion opens a strong warning modal (permanent, needs
  admin approval) with a **Download My Data** link to `/api/export-account`
  (own-data JSON export, RLS-gated) before submitting the `account_requests`
  row. Admins approve/deny deletion through the bridge implementation
  `resolveDeletionRequest` (role + same-school verified server-side), with a
  destructive confirm dialog on approve. Deactivated users are redirected by
  `middleware.ts` to `/auth/reactivate` and can only reach that minimal flow
  until they reactivate; the version footer is mono-faint.
- **Teacher Classroom - the grade workspace (1.4.25).**
  `app/teacher/classroom/page.tsx` keeps its four-step wizard (programs →
  sections → courses → students) and every grade handler, modernized onto the
  shared grammar. The header band pairs a `font-display` "Grade submission"
  title with a mono "Classroom · …" line, a live `Stat` (My courses) and an
  active-semester `Chip` (`school_year · semester_label`). Each step has a
  shared ghost `Button` Back, a `section-label` prompt, and a mono breadcrumb
  of the current program/section/course path; selection cards use
  `hover:border-gold-soft` + chevron affordances and composed `EmptyState`s
  for the no-courses / no-sections / no-students cases. The Course categories
  editor uses `Chip` for the running total (warn when ≠ 100), shared
  `Button`s (outline + Add, gold + Save, danger icon-square Remove replacing
  the old ✕), and the same validation flow. The Submit grades card replaces
  the hardcoded amber semester block and green success banner with
  warn-soft/gold-soft token banners, token-ified category pills, `UserAvatar`
  student rows with the same score/max inputs, and a full-width gold `Button`.
  The leaderboard now uses `UserAvatar` + `RankBadge` (replacing the inline
  rank pill), and Grade history maps type → neutral `Chip` and approval
  status → `Chip` (approved success / pending warn / rejected danger). All
  handlers (`handleBack`, `updateDraft`/`removeDraft`, `handleSaveWeights`,
  `handleSubmitGrades`), the category-key slug/unique logic, teacher scoping
  (`getCoursesByTeacher(profile.id)`), and store calls are byte-for-byte
  unchanged - no grade math, weights, or submission/approval behavior was
  touched.
- **Teacher Quiz - the quiz builder (1.4.25).**
  `app/teacher/quiz/page.tsx` modernizes the create-a-timed-quiz workflow:
  a header band (`font-display` "Quiz builder" + mono "Create timed quizzes ·
  published to your courses" line, with a live **My quizzes `Stat`** derived
  from `useQuizStore().quizzes` filtered to `getCoursesByTeacher(profile.id)`).
  The builder card is organized with `section-label` sections - Quiz details
  (title / course / time with mono-faint labels) and Questions (with an
  "N added" `Chip`) - and every action uses the shared `Button` (outline +
  Add question, gold + Publish quiz, danger + Remove with `IconTrash`
  replacing the plain text link). The correct-option highlight moved from
  static `border-gold` to `border-gold-token`. The published-quizzes list
  gains a count `Chip`, composed `EmptyState` ("No quizzes published"), and
  dense rows with a question-count `Chip` + mono time limit. Loading now uses
  a builder-geometry skeleton (guarding against the false "no courses" flash
  while the profile loads), the quiz-store error renders as a warn-token
  banner, and the no-courses case is a composed `EmptyState`. All quiz
  handlers (`updateQuestion`, `updateOption`, `setCorrect`, `addQuestion`,
  `removeQuestion`, `handleSubmit`), the title/course/time validation, teacher
  scoping, and `addQuiz` behavior are byte-for-byte unchanged.
- **Teacher Learning Materials - the upload workspace (1.4.25).**
  `app/teacher/learning-materials/page.tsx` keeps its two-column upload
  workflow on the shared grammar. The header band replaces the old inline
  "Upload status" panel with a `font-display` "Teaching materials" title,
  mono "Upload lessons · manage your materials" line, and a live **My
  materials `Stat`** (from `useMaterials` filtered to `m.mine`). The upload
  form uses `section-label` + mono-faint labels, a shared `Button`
  "Choose file" in the dashed drop zone, and a shared primary `Button`
  "Add material" (replacing the legacy `ActionButton`/`PlusIcon`). The
  Manage uploads card gains a count `Chip`, geometry-matching skeleton rows,
  a warn-token error banner, and a composed `EmptyState` ("No materials
  uploaded"). Material rows keep their title/meta/description/date but the
  Open link hover is token-based and Delete is a shared danger `Button` with
  `IconTrash`. Deleting now opens the shared `Modal` confirmation (what is
  removed, who it affects, irreversible) before calling the same
  `deleteMaterial(id)` handler. All upload logic (`handleAddMaterial`, the
  title/validation flow, subject sync effect, `createMaterial` payload,
  teacher scoping via `getCoursesByTeacher(profile.id)`) is byte-for-byte
  unchanged.
- **Teacher Library Management - the librarian desk (1.4.25).**
  `app/teacher/library-management/page.tsx` completes the teacher shell with
  the same grammar. The header band (`font-display` "Librarian desk" + mono
  "Library management · approve, track, return") carries a live **Books out
  `Stat`** (derived from `books.filter(status === "borrowed")`) and a gold
  `Button` "Add book" (`IconPlus`). All four sections use `section-label`
  eyebrows with count `Chip`s (gold catalog / warn pending / neutral out):
  the catalog search gains a live mono result-count chip, book status maps to
  `Chip` (available/requested → success tone, borrowed → neutral - preserving
  the earlier token sweep), Edit is a shared outline `Button` (`IconPencil`),
  pickup requests use shared gold Approve (`IconCheck`) + outline Decline
  (`IconX`) `Button`s with the same disabled/validation behavior, "Mark
  returned" is a gold `Button`, and the history-lookup input's stray static
  `border-gold` was normalized to the standard `focus:border-gold` ring.
  Plain text states were replaced with geometry-matching skeleton rows
  (guarding the catalog against a false empty flash), a warn-token error
  banner, and composed `EmptyState`s for each section. No native `confirm()`
  exists on this page (audit confirmed) and no destructive in-page action
  warranted an invented confirmation - the Add/Edit book modals are separate
  components and were left untouched. All library logic (`ApproveRow`
  handlers, `approveRequest`/`declineRequest`/`returnBook`,
  `historyForBook`, catalog filtering, `useLibraryStore`) is byte-for-byte
  unchanged.

  **Large-catalog / discoverability pass (1.4.25).** The Full Catalog section
  now runs a client-side discovery pipeline - `books` → search
  (title/author/genre/ISBN) → status filter → sort → paginate - all memoized
  so a large catalog stays cheap and the store is untouched. A compact
  discovery bar adds four status filter pills with live counts (All /
  Available / Borrowed / Requested) and a sort select (Title A-Z / Z-A,
  Author A-Z / Z-A - no invented date fields; books have no created date).
  Pagination is client-side at 25 rows/page with a mono "Showing X-Y of Z
  books" line, Prev/Next `Button`s, numbered pages when ≤ 7 pages (else a
  compact "X / Y" indicator), and page-reset on any search/filter/sort
  change.  Search now also matches `isbn`, and the no-result empty state
  clears both search and filters. The page's other three sections (requests,
  borrowed, history) are  unchanged.
- **Teacher Home - the structured personal dashboard (1.4.25).**
  Teacher Home is a widget dashboard the teacher builds themselves;
  there is **no developer-defined default** - a teacher with no saved layout
  (or a legacy `{hidden, order}` row from the first-generation customizer)
  sees an empty Home: "Build your own command center" with a **Customize in
  Settings** CTA. There is no Customize button on Home itself - the entry
  point lives in **Settings -> Home Dashboard -> Customize Home**
  (`/teacher/home?customize=1` opens the builder in place). Quick Actions
  remain as navigation shortcuts.
  The page deliberately uses the **same outer content column as every
  other app page (Admin Home included)** - the standard AppShell
  (`max-w-[1600px] mx-auto`, 100px sidebar gap, `main` padding) with no
  full-bleed or width overrides.

  **Widget model** (`lib/teacherPrefsStore.tsx`): the prefs row stores
  `layout` JSONB as `{ "widgets": [{ id, size, tall, order }] }` - the same
  table, no new migration. `HOME_WIDGETS` is the single registry of 12
  supported widgets (Teaching State, My Classes, Grading Status, Recent
  Submissions, Students Needing Attention, My Students, School Feed,
  Assigned Tasks, Today's Schedule, Today's Lesson Plans, Pinned Notes,
  Upcoming Lesson Plans), each with a label and description. Every widget
  is a **projection of existing data** (classroom hierarchy, ranks, tasks,
  workspace, school feed); the schedule/lessons/pinned-notes projections
  are read-only and deep-link into the Workspace tools
  (`/teacher/workspace?tool=…`). No x/y coordinates are ever persisted -
  the teacher controls WHICH widgets, their ORDER, and their SIZE; the
  layout engine decides position.

  **One layout engine - CSS Grid.** The dashboard is a 12-column CSS Grid
  (`grid-cols-12`, `gap-4`, normal row flow - no dense packing, no
  compactor, no coordinates). A widget's `size` maps to a column span:
  small = 3, medium = 6, large = 9, full = 12. `tall` maps to
  `row-span-2` (rows are the fixed `auto-rows-[15rem]` unit below). Widgets flow row by
  row in saved order; one that doesn't fit the current row simply starts
  the next one. Below `md` every widget becomes full width (one column).
  The grid is `width: 100%` of the content column, tiles are plain
  `CornerFrame` cards - no absolute positioning, no negative margins, no
  overflow escaping the grid. Rows are a **fixed unit**
  (`auto-rows-[15rem]`): content-sized rows made `tall` invisible for
  widgets whose content already filled the row (a row-span-2 tile's
  content is distributed across both rows), so with a fixed row height
  `tall` always spans 2 rows + gap and visibly grows for every widget in
  every layout. Cards contain their content (overflow-hidden + internal
  scroll in view mode).

  **View mode is a static grid** - a plain map of `CornerFrame` cards
  with no drag/resize machinery at all. **Edit mode renders the SAME
  grid** (`components/teacher/WidgetTile.tsx`) with chrome added: a gold
  strip is the **@dnd-kit sortable** drag handle (reorder only - the
  transform is temporary and disappears on drop, and the strip is
  keyboard-operable: Tab, Space, arrows), and a remove button. Resize
  handles are revealed only when needed, so a resting card stays clean:
  hovering a card shows four tiny mid-edge grips (N/E/S/W - thin 24x3 /
  3x24 bars on an invisible GENEROUS hitbox (48x24 / 24x48, extending
  ~12px outside/inside the edge - the bar stays tiny, only the pointer
  target is forgiving), and moving the pointer onto a corner reveals
  that corner for diagonal resize. E/W change width
  (right = small -> medium -> large -> full, left = reverse), N/S change
  height (S down / N up = tall on, reverse = off), corners change both;
  arrow keys mirror each drag. After any change CSS Grid reflows the
  dashboard - widgets below simply move down. **Save layout** persists
  the draft;
  **Cancel** discards it; **Clear Home** (two-step confirm) empties the
  dashboard. A **Presets** button in the toolbar opens a VISUAL preset
  picker: each of the six developer-created starting arrangements (Daily
  Focus, Class Overview, Grading Focus, Teaching Day, Student Attention,
  Communication) is a card led by a miniature dashboard preview, plus a
  blank "Customize yourself" card for an empty Home. The presets are
  designed compositions, not random mixes - every 12-column row is fully
  occupied (no dead space), the hero widget gets the most height (feeds
  and attention lists are `tall`), and content-heavy widgets pair with
  stat widgets in the 3-column rails. Previews are generated from each
  preset's real widget definitions (`components/dashboard/
  PresetPreview.tsx` - a mini 12-column grid where each tile carries the
  widget's actual span and `tall` row span) and render a simplified
  version of each widget's REAL content - feed tiles show a post with an
  author line and ADMINISTRATOR badge, class tiles show course rows with
  averages, grading tiles show stat blocks, attention tiles show alert
  rows - so the preview can never drift from the layout and reads like
  the actual Home. The same `PresetCard`/`PresetPicker` components serve
  Admin Home. Picking a preset loads it into the draft only, and nothing
  persists until Save.
  Removing a widget never touches its data, and it returns to the
  Available Widgets picker.

  **Migration** (`normalizeHomePrefs`, same JSONB column): the previous
  free-form era `{widgets: [{id, x, y, w, h}]}` converts width to the
  nearest size (w <= 3 small, <= 6 medium, <= 9 large, else full) and
  height to tall (h >= 7); the preset era `{id, size, order}` is kept;
  the BSP tree shape converts each leaf to a placement; legacy
  `{hidden, order}` rows become the empty dashboard. Unknown widgets are
  dropped, duplicates keep their first occurrence, invalid sizes fall
  back to medium. The old Notes / Schedule / Lesson Plan **management UI
  is not on Home** - those tools live only in the Workspace
  (`/teacher/workspace`), one source of truth. react-grid-layout and its
  CSS were removed; @dnd-kit/core + @dnd-kit/sortable power the
  reorder drag.

  **Teacher Workspace** (`app/teacher/workspace/page.tsx`, `/teacher/workspace`,
  added to `TEACHER_NAV_ITEMS` right after Home): an internal rail (vertical
  on desktop, horizontal scroll on mobile) with five tools - **Overview**
  (today's schedule, today's lesson plans, pinned notes, pending/overdue
  tasks, each with a jump link), **Notes** (search, add, inline edit, pin,
  delete - `addNote`/`updateNote`/`togglePinNote`/`removeNote`),
  **Schedule** (same add/remove form plus a responsive weekly view that
  stacks days on mobile), **Lesson Plans** (add, inline edit, delete,
  All/Upcoming/Past filter - `addLessonPlan`/`updateLessonPlan`/
  `removeLessonPlan`), and **Tasks** (status-filtered full task management
  through the same `teacherTasksStore` as Home). Workspace tabs are now
  URL-addressable (`?tool=overview|notes|schedule|lessons|tasks`) so Home
  projections land on the right tool (inside a Suspense boundary for
  `useSearchParams`). Home and Workspace share the same `TaskItem` component
  (`components/teacher/TaskItem.tsx`) for task actions (accept, decline +
  reason, done, reopen, delete). The Workspace reuses the app-level
  providers already in memory - no new queries, no duplicated systems, no
  Subject Tracker yet (Phase 2). Day/time helpers were extracted to
  `lib/teacherDayUtils.ts` so both surfaces render "today" identically.
- **Admin Home - the customizable command center (1.4.25).**
  Admin Home is a widget dashboard using the **same structured dashboard
  model as Teacher Home** (shared `lib/dashboardShared.ts` primitives:
  `WidgetSize` small=3 / medium=6 / large=9 / full=12, `SPAN_CLASS`, and the
  `WidgetTile` resize/reorder chrome). Like Teacher Home it is **EMPTY BY
  DEFAULT**: an admin with no saved row (or a malformed one) sees the empty
  command-center state - there is no developer-forced default arrangement.
  A saved personal layout is authoritative, and a preset is only applied
  when the admin explicitly picks one.

  **Widget model** (`lib/adminPrefsStore.tsx`): the prefs row stores
  `layout` JSONB as `{ "widgets": [{ id, size, tall, order }] }` in the new
  `admin_dashboard_prefs` table (migration 055 - own-row RLS via the
  profiles join: an admin reads/writes only their own row, `admin_id`
  unique, `school_id` must match their school; no cross-admin access).
  `ADMIN_WIDGETS` is the registry of 13 widgets - School Snapshot, Semester
  Progress, Hierarchy Health, Academic Health, Attention Center, Grade
  Pipeline, Enrollment Health, Teacher Workload, Pending Grade Submissions,
  Account Requests, Teacher Tasks, Recent Activity, School Feed &
  Announcements - each with a description and a default size. Per the
  sizing policy, EVERY widget supports all four sizes
  (small/medium/large/full); nothing is locked to a minimum, so School
  Feed and Pending Grade Submissions can shrink to `small` and the card
  content adapts (posts wrap, buttons wrap, long strings break). Every
  widget is a **projection of existing Admin Home data** (classroom
  hierarchy, ranks, tasks, enrollment, account requests, posts) - no new
  queries, no invented metrics, no duplicated business logic.
  `ADMIN_PRESETS` offers six developer-created starting arrangements
  (School Operations, Academic Overview, Communication, Administration
  Focus, Academic Health, School Communication) - selecting one loads it
  into the draft only, and it becomes the admin's layout after Save; any
  preset widget can then be manually resized to any size.

  **Entry point moved to Admin Settings.** There is no "Customize" button
  on Admin Home. `/admin/settings` has a **Home Dashboard** section
  ("Customize which information appears on your Admin Home and how it is
  arranged") whose **Customize Home** button links to
  `/admin/home?customize=1` - the page enters the builder and strips the
  param. The builder edits the real Admin Home in place; there is no
  separate builder page and no Admin Workspace.

  **One layout engine - CSS Grid** (identical to Teacher Home): 12 columns,
  `gap-4`, normal row flow, `auto-rows-[15rem]` fixed rows so `tall`
  (row-span-2) visibly grows; below `md` everything stacks full width.
  **View mode is a static grid** of `CornerFrame` cards (warn tone for
  Attention Center; `SemesterProgress` and `RankDistribution` render
  directly since they self-frame; the Pending Grades tile keeps the
  `#pending-grades` anchor the Attention Center links to). **Edit mode** is
  the same grid with `WidgetTile` chrome: a gold strip is the @dnd-kit
  sortable drag handle (order only, keyboard-operable), hover reveals the
  four tiny mid-edge resize grips (E/W cycle the widget's supported sizes,
  N/S toggle tall), corner handles appear on corner proximity and resize
  both axes, all live during pointer movement. A sticky toolbar holds **Add
  widget** (picker shows only widgets not already placed; removed widgets
  return to it), **Presets** (the same visual preset picker as Teacher
  Home - six cards with miniature dashboard previews: School Operations,
  Academic Overview, Communication, Administration Focus, Academic
  Health, School Communication - plus the blank "Customize yourself"
  card), **Clear Home** (two-step confirm - empties the dashboard; the
  data is never touched), **Cancel** (discards the session), and **Save
  layout** (persists the draft; saving an empty draft is a valid personal
  layout - an empty Home shows the build-your-own state). Removing a widget never touches its data, and the existing
  workflows are intact: pending grade Approve/Reject, account request
  Approve/Deny, and school post/announcement Edit/Delete (via the shared
  `PostEditor`) all work from the widgets, and the New post / Announcement
  header commands stay available in view mode. Administrator-created posts
  carry an **Administrator** badge (`authorRole` from the feed's profiles
  join) in the student/teacher feed and the admin feed rows alike.
- **Student Library - the discovery catalog (1.4.25).**
  `app/student/library/page.tsx` now runs the same client-side discovery
  pipeline as the teacher catalog but stays a student-facing surface - no
  librarian controls, no admin metrics. The header band uses `font-display`
  "Library" + mono "Discover books · check availability · find your next
  read" with a live **Available `Stat`** (gold tone, "N in catalog" hint).
  The catalog is now the full catalog (not just available books): search
  matches title/author/genre/ISBN, four status filter pills (All / Available
  / Borrowed / Requested) carry live counts, the existing genre filter and a
  new sort select (Title/Author A-Z/Z-A) sit on the right, and client-side
  pagination bounds the list at 25 rows/page with a mono "Showing X-Y of Z"
  line, Prev/Next + numbered pages, and page-reset on any control change.
  Rows are compact cover + title/author·genre + status `Chip` (Available →
  success, Requested → warn, Borrowed → neutral) + chevron, opening the
  shared `Modal` book detail (genres as eyebrow, gold hairline, same
  Request-to-borrow / disabled action, `requestBorrow` handler unchanged).
  The "My requests & loans" and "Borrow history" panels keep their exact
  logic on the shared grammar with count `Chip`s, composed `EmptyState`s,
  and mono dates. Loading uses catalog-geometry skeleton rows, the store
  error renders as a warn-token banner, and the no-result state clears
  search + filters. `useLibraryStore`, `requestBorrow`, all borrow rules,
  and the student scoping are byte-for-byte unchanged.
- **Shared read-only Book Detail - DISCOVER → VIEW → DECIDE (1.4.25).**
  `components/library/BookDetailModal.tsx` is the single read-only detail
  surface for both library audiences. It renders through the shared `Modal`
  (genres as eyebrow, title as description, gold hairline) and displays only
  real `LibraryBook` fields: cover, title, author, genre, description, ISBN
  (when present), and a status `Chip` (Available → success, Requested →
  warn, Borrowed → neutral). A `context` prop scopes the copy - students
  (default) get "Pending librarian approval" / "Due …" / "Currently
  borrowed" and never see borrower identity; teachers get the loan line
  (`Loaned to … · borrowed … · due …`) and pickup-request copy. Actions live
  at the page level via an `action` slot: the student page passes its gold
  Request-to-borrow button (or the disabled "Request already sent" / "Not
  available right now" state - `requestBorrow` unchanged), the teacher page
  passes nothing, so no management control ever leaks into the read-only
  view. `components/library/BookCover.tsx` was extracted as the shared cover
  renderer (the inline copies in both pages are gone - one definition).
  Student catalog rows open the detail on click; teacher catalog rows are
  now clickable to inspect (`title="View book details"`) with the Edit
  `Button` stopping propagation so EditBookModal stays the only editing
  path. `bookStatusChip` / `bookStatusLine` are shared named exports used by
  the student rows and the modal alike.
- **Library modals on the shared shell (1.4.25).** `AddBookModal.tsx` and
  `EditBookModal.tsx` dropped their hand-rolled `fixed inset-0 … bg-black/50`
  overlays for the shared `Modal` primitive, closing the last non-shared
  dialog in the library system. Add keeps the full Scan-barcode / Enter-
  manually flow (html5-qrcode camera lifecycle and cleanup, scanner-device
  input, OpenLibrary lookup, "Scan again" retry, found / not-found banners)
  token-ified (`bg-gold-token`, `hover:border-gold-soft`, `border-gold-soft`
  banners); the review form gains a `section-label` "Book information"
  eyebrow, mono-faint field labels wired to inputs via `htmlFor`/`id`, the
  shared `BookCover` preview, a shared gold "Add book" submit (`IconPlus`,
  same disabled/`submitting` guard, identical `addBook` payload incl. the
  `"Uncategorized"` fallback) plus an outline Cancel. Edit keeps the exact
  `updateBook` payload, the shared-`BookCover` preview, gold "Save changes",
  and the **two-step delete safety flow** - a danger "Delete this book"
  `Button` reveals the warn-soft panel (explicit "removes it from the
  library for everyone and can't be undone" copy) with danger "Yes, delete"
  + outline Cancel, all calling the same `deleteBook(id)`. Both modals close
  through the shared `Modal`'s ✕/backdrop (Add stops the scanner first, as
  before). No native `confirm()`, no hardcoded colors, no static gold, and
  the broken `hover-bg-gold-token` classes are gone; the two pre-existing
  `<img>` lint warnings were eliminated by the shared `BookCover`.
- **No hardcoded status colors (1.4.25 cleanup).** A full sweep removed every
  remaining `red`/`emerald`/`blue` Tailwind color from the codebase - errors,
  warnings, and destructive actions use `text-warn` / `bg-warn-soft` /
  `border-warn-soft`; success/positive states use `text-gold-token` /
  `bg-gold-soft`; informational/neutral states use `bg-tile text-muted`; the
  solid danger buttons use `bg-warn text-on-accent`; and the notification
  type dots resolve through theme tokens. This is what makes Rose readable
  everywhere. The one exception is the `gold` static hex in `tailwind.config.ts`
  (eyebrows, focus rings, small accents) - it is a neutral gray-blue that
  reads identically in both themes and is scheduled for `-token` migration.
  The broken `hover:bg-gold hover:text-on-accent` pattern (a plain CSS class
  can't take a Tailwind `hover:` variant, so the text never changed color) was
  also replaced app-wide with `hover-bg-gold-token hover-text-on-accent`,
  which actually flips the label to dark on gold.
- **Beta round-2 (v1.30).** Signup reliability fixes from the production
  investigation (Android CORS + JWT bridge auth, 429/JSON error fidelity,
  duplicate-email regex, 72-byte password cap); Instagram-style StoryEditor
  (caption, flip, color-pen drawing composited via canvas) before
  publishing; display-name rename with a DB-enforced 30-day cooldown
  (migration 076) in the About editor; friend add/remove confirmations and
  the friends manager; private profile/friends/history toggles in the
  profile menu; shared circle `Spinner`/`InlineLoader` across all loading
  states; GitHub links moved to `perseus-lelush`.
- **Penpot Messages implementation (v1.28.0).** `components/chat/
  MessengerView.tsx` was rebuilt to match the Penpot messaging frames
  (student/teacher/admin share it): list header with segmented control
  (All / Groups / Archived), desktop Archived pill with count, icon-only New
  Chat button, All / Groups / Direct filter chips, 24px-icon pill search,
  72px conversation rows (48px avatars, 10px meta timestamps, 20px accent
  unread badges), corrected bubble tail radii (theirs bottom-right 4px,
  mine bottom-left 4px per the design CSS), mono uppercase day separators,
  icon-only 44px send button, and the New Chat dialog (centered 480px modal
  with scrim on desktop, full-screen sheet + 56px accent FAB on mobile).
  Groups/pin/typing/attach/call affordances from the design are deferred -
  no backing data model or behavior exists yet (conversations are strict
  1:1 pairs), so the Groups tab shows an honest empty state instead of dead
  UI.
- **Full-app visual + UX consistency audit (1.4.25).** A cross-app sweep
  closed the last gaps between the modernized reference pages and the
  remaining surfaces. All three native `window.confirm` dialogs were replaced
  with the shared `Modal` confirm: `app/student/profile/page.tsx` (remove
  profile picture) and `components/chat/MessengerView.tsx` (delete
  conversation, block user) - `window.confirm` is now gone from the entire
  codebase. `MessengerView` (shared by student/teacher/admin messages) also
  swapped its legacy `ActionButton` Send for the shared primary `Button` and
  token-ified its static gold (my-message bubbles `bg-gold` →
  `bg-gold-token`, unread badge, archived-tab border, hover borders, empty-
  state icon tile), so chat now adapts correctly in Rose. `app/teacher/home`
  replaced its three remaining `ActionButton` submits (Add note / Add to
  schedule / Add lesson plan) with the shared gold `Button` - the reference
  teacher page is now fully on the shared action language. `app/student/profile`
  token-ified its edit-photo modal (`bg-gold`/`text-gold` → `-token`, static
  hover border → `-soft`). After the sweep the shared
  `components/ui/ActionButton.tsx` has no consumers left (the only remaining
  `ActionButton` is a local function in `app/student/shop/page.tsx` - a
  distinct student-gaming surface kept as-is) and is a candidate for removal.
- **Admin Reports - the analysis surface (1.4.25).**
  `app/admin/reports/page.tsx` is the last admin page on the shared grammar
  and the reference for school-analysis reporting. The header band uses
  `font-display` "School reports" + mono "Live academic excellence · rank
  distribution · teacher activity" with a live **School excellence `Stat`**
  (gold tone, hint line) anchored right. The four summary tiles became
  shared `Stat`s (excellence in gold, the rest neutral) in a compact grid;
  every section header is now `.section-label` with a one-line explanation;
  the rank distribution uses the shared `Bar` (gold fill, same count/
  student-width math); grade-type, course-average, top-performer and
  teacher-activity lists are hairline `divide-y` rows with mono tabular
  values; top performers carry their real `RankBadge` (unranked students
  render no badge - never mislabeled "D"); the below-75 list keeps its
  warn-soft treatment; and all section empties use composed `EmptyState`s
  ("All clear" for attention). Loading is a geometry-matching skeleton and
  the store `error` renders as a warn-token banner. All ten `useMemo`
  report calculations (`schoolAverage`, `rankDistribution`,
  `gradeTypeBreakdown`, `programAverages`, `courseAverages`, `topPerformers`,
  `needsAttention`, `teacherActivity`, `studentStats`) and every data source
  are byte-for-byte unchanged.
- **Real data everywhere.** No mock UI - every number on screen is fetched
  from Supabase (rank state, grades, habits, weekly progress) and updates
  through Realtime.

### 3.2 Color palette (tokens)

Both themes share the same token names; only the values differ. **Never
hardcode a hex in a component** - use the token via `var(--token)` or the
Tailwind utility classes that map to them.

#### Dark theme (default, `.dark`)

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#0f0f11` | Page background |
| `--kettle` | `#141214` | Sidebar background |
| `--surface` | `#17181b` | Cards / panels |
| `--surface-strong` | `#1a1b1e` | Hover / active panels |
| `--tile` | `#1a1b1e` | Inputs, chips, icon tiles, pills |
| `--border` | `#232327` | Card hairline (line-soft) |
| `--line` | `#2a2b2f` | Progress tracks, stronger lines |
| `--text` | `#f0f0f1` | Primary text |
| `--muted` | `#9a9ba1` | Secondary text |
| `--faint` | `#6c6d73` | Labels / captions / section headings |
| `--gold` | `#9ea7b3` | **Accent** (Great Falls) - ranks, fills, primary actions |
| `--sealion` | `#7f8995` | Fills, active borders |
| `--asphalt` | `#464c55` | Avatar placeholders, spark bars |
| `--warn` | `#c98f8f` | Salmon warning text ("tracking" pill, unread) |
| `--warn-fill` | `#8a5f5f` | Sparkline low bars |
| `--low-fill` | `#5b5f66` | Lowest stat fill |
| `--btn` | `#525b69` | Primary button fill (lifted above the page) |
| `--on-accent` | `#141214` | Dark text that always sits on the accent |
| `--shadow` | `0 0 0 1px var(--border)` | The only "shadow" - a hairline |

#### Rose theme (girls, `.pink`)

Built from the five requested colors: **Mountain Mist #98979C**, **Cavern
Pink #D9BBBD**, **Oyster Pink #EAD0D1**, **Fair Pink #F6E8E7**, **Athens
Gray #EEEEF0**. Primary text deepens Mountain Mist (mixed toward `#141214`)
so small text stays readable on the pastel surfaces.

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#eeeeF0` (Athens Gray) | Page background |
| `--kettle` | `#ead0d1` (Oyster Pink) | Sidebar background |
| `--surface` | `#f6e8e7` (Fair Pink) | Cards / panels |
| `--surface-strong` | `#fbf3f2` | Hover / active panels |
| `--tile` | `#f0e3e2` | Inputs, chips, icon tiles, pills |
| `--border` | `#d9bbbd` (Cavern Pink) | Card hairline |
| `--line` | `#cba9ab` | Progress tracks, stronger lines |
| `--text` | `mix(#98979c 55%, #141214)` | Primary text (Mountain Mist deepened) |
| `--muted` | `#98979c` (Mountain Mist) | Secondary text |
| `--faint` | `mix(#98979c 52%, #f6e8e7)` | Labels / captions |
| `--gold` | `#98979c` | **Accent** (Mountain Mist) |
| `--sealion` | `#98979c` | Fills, active borders |
| `--asphalt` | `#d9bbbd` | Avatar placeholders, spark bars |
| `--warn` | `#b0605a` | Salmon warning text |
| `--warn-fill` | `#b47a74` | Sparkline low bars |
| `--low-fill` | `#c4a2a4` | Lowest stat fill |
| `--btn` | `#d9bbbd` (Cavern Pink) | Primary button fill |
| `--on-accent` | `#4a4245` | Dark rose text on the pink accent |
| `--shadow` | `0 0 0 1px var(--border)` | The only "shadow" |

#### Legacy light theme (`:root`, no longer offered in the picker)

| Token | Value | Used for |
|---|---|---|
| `--bg` | `#e9eaed` | Page background |
| `--kettle` | `#e1e2e6` | Sidebar background |
| `--surface` | `#f5f6f8` | Cards / panels |
| `--surface-strong` | `#f7f8fa` | Hover / active panels |
| `--tile` | `#edeef1` | Inputs, chips, icon tiles, pills |
| `--border` | `#d6d8dd` | Card hairline |
| `--line` | `#c8cbd1` | Progress tracks, stronger lines |
| `--text` | `#23252a` | Primary text |
| `--muted` | `#565a63` | Secondary text |
| `--faint` | `#8b8e97` | Labels / captions |
| `--gold` | `#8a94a0` | **Accent** (Great Falls, deepened for light surfaces) |
| `--sealion` | `#8a95a1` | Fills, active borders |
| `--asphalt` | `#b6bbc3` | Avatar placeholders, spark bars |
| `--warn` | `#b0605a` | Salmon warning text |
| `--warn-fill` | `#b47a74` | Sparkline low bars |
| `--low-fill` | `#a7acb4` | Lowest stat fill |
| `--btn` | `#3d434e` | Primary button fill (deep slate, visible on light) |
| `--on-accent` | `#141214` | Dark text on the accent |
| `--shadow` | `0 0 0 1px var(--border)` | The only "shadow" |

**Design rules of thumb:**
- Use tokens/utilities, never hardcode hex values.
- Cards are flat: 1px hairline border (`--border`), 10px radius, no glow.
- One accent (`--gold`), one warning tone (`--warn`), neutrals everywhere
  else.
- New features that read/write data follow the store pattern (provider +
  Supabase + Realtime) and get a numbered migration in `database/migrations/`.

### 3.3 Public web (landing + auth)

The public surface is a **dark cinematic marketing page** (separate from the
flat token dashboard look, but built on the same tokens and fonts):

- **Landing (`/`)** - a server component that redirects logged-in users to
  their role home, otherwise renders `components/landing/Landing.tsx`:
  a fixed atmospheric background (`components/landing/Background.tsx` -
  crown watermark, floating **king/queen chess silhouettes**, flowing
  ribbons, film grain, vignette; dark-mode only via `.landing-bg`),  a glass
  navbar with the crown mark, and a hero whose display headline **"Make school
  feel like a game worth playing"** (the business tagline, rendered huge) fills
  the viewport with a per-letter cascade entrance, a shimmer sweep on the
  accent words "game" and "playing", twinkling sparkles, and a pulsing halo
  ring around the crown. The mono eyebrow below carries the brand's action
  line **"Climb the ranks"**, and the paragraph underneath supports it with
  current product copy: approved grades fill the rank bar, habits build
  streaks, and Florin unlocks page backgrounds, profile-card art, and avatar
  borders equipped from the wardrobe - all live in realtime. The CTAs point to
  the auth card. The page moves end to end: a scroll
  progress bar, scrollspy navbar, staggered card pops and hover glows on the
  roles/features cards, a three-step **How it works** section with an
  animated connector line, a rank ladder (D -> EX) whose tiles light up one
  by one on scroll, hover-reactive tech badges, the auth card, and a footer
  with GitHub, Terms, Privacy, and the version (from `lib/version.ts`).
- **Auth card** - `components/auth/AuthCard.tsx`: a slowly rotating conic
  hairline border around a token surface card, with a mount entrance,
  gentle float bob, ambient glow, hover lift, and a live/secure/version
  footer line. `components/auth/AuthTabs.tsx` embeds the **real**
  `LoginForm` / `SignupForm` behind a sliding-pill tab switcher - no mock
  auth. `LogoLockup` shows the 38px crown + shimmering Cinzel wordmark.
  Fields glow gold on focus (border + ring + icon via `group-focus-within`),
  the submit button sweeps a shine across on hover, errors shake in, and
  success states pop in with a drawn checkmark. `/login`, `/signup`,
  `/forgot-password`, `/reset-password` all reuse the same card +
  background, so the outside and the login pages blend.

  **Signup** (`components/auth/SignupForm.tsx`) supports only **Student**
  and **Teacher** - there is no administrator option in the UI, in the
  signup bridge (`lib/server/authOps.ts`), or in the `handle_new_user()`
  database trigger. Each role
  collects first/last name, optional middle name, and a **school-issued
  identifier** (Student ID / Faculty ID, unique within the school), plus
  email, password, and a school picked from the live `registration_enabled`
  schools list (`lib/useSchools.ts` - no hardcoded schools). Password
  strength is enforced client-side and server-side (`lib/signupValidation.ts`).
  On success the form shows the **Check your email** confirmation state with
  a resend link (`resendSignupConfirmation`) - login is refused until the
  email is confirmed.

  **Login** (`components/auth/LoginForm.tsx`) is email + password only - no
  school, campus, or role selector. After auth the app resolves the user's
  role and school from their `profiles` row (database truth) and redirects
  to the right home (`/student/home`, `/teacher/home`, or `/admin/home`).
  Unconfirmed accounts see the confirmation-required state; deactivated
  accounts are sent to `/auth/reactivate` by middleware.
- **Legal** - detailed `docs`-backed prose pages at `/terms` and `/privacy`
  (`components/landing/LegalLayout.tsx`); the signup form requires checking
  the Terms & Privacy agreement before it submits.
- **Attribution** - the footer links to the maintainer's GitHub
  (`github.com/joshan-lucmayan`).

---

## 4. Key flows (user-facing)

1. **Rank visibility** - `RankBadge` reads the **non-linear rank engine**
   (per-entry isolated fill -> power curve x weight share -> fill-first bar -
   see `docs/RANK_SYSTEM.md` for the full math). The rank letter is the hero
   (D -> C -> B -> A -> S -> S+ -> S++ -> **EX**); beneath it sits the bar as
   `N / 100` (or the open-ended EX score, uncapped, no `/100`).
   Student home/profile cards show the full badge; search results,
   leaderboard rows, and teacher/admin rosters show a compact `{rank} Rank`
   pill. The student **Season History** (peak rank per season from
   `get_season_history`, via `components/profile/SeasonHistory.tsx`) is
   opened from the profile card's three-dot menu (alongside **View As**, a
   presentation-only preview mode that hides owner controls) on
   `/student/profile`. Data flows through `lib/rankStore.tsx` (mounted in
   `app/layout.tsx`).

   The student profile also renders a tabbed **Achievements / Music /
   Photos** section (`components/profile/Achievements.tsx` +
   `lib/useAchievements.ts`) inside the profile card: the owner posts a raw
   certificate image (public `certificates` storage bucket, avatars-style
   owner-folder RLS, certificate-specific 10 MB cap) with title, school year,
   date awarded and school from the "Post Achievement" action at the top of
   the Achievements tab. Achievements display as a **title-only 3×3 grid**
   (Load More for more, newest first); clicking a tile opens the Achievement
   Detail modal (full title, School Year, Date Awarded, School, owner
   delete), and **VIEW RAW IMAGE** opens the certificate in a dedicated
   full-screen viewer - both modals render through a `document.body` portal
   so they stay centered on the viewport. Other students see the same tabs
   read-only on `/student/profile/[id]`.

   The **Music tab** (`components/profile/Music.tsx` + `lib/useMusic.ts`)
   is post-music-by-link: the owner pastes a YouTube / Spotify / Apple Music
   / SoundCloud / Vimeo URL, `POST /api/resolve-music` resolves
   title/artist/cover server-side (keyless oEmbed for YouTube/SoundCloud/
   Vimeo, keyless iTunes lookup for Apple Music, and keyless Spotify oEmbed
   with the artist parsed from the public page when oEmbed omits it - Spotify
   tracks, albums, playlists, artists, episodes and shows all resolve; free
   and open, per-IP rate limited, no credentials anywhere, no SSRF, only
   whitelisted platform endpoints are fetched), and one **Post**
   action resolves and saves to `student_music` in a single step. Cards show
   the cover, title and artist and link out to the original track; the owner
   can remove their own posts. Photos remains a UI placeholder.

   **Entering scores** (what makes ranks move): the ONLY way scores reach the
   engine is grades - there is no separate rank-entry page. A teacher
   configures each course's categories on `/teacher/classroom` - add, remove
   or edit category labels and weights (array saved via
   `save_course_rank_weights`, weights summing to 100%) - then enters each
   student's earned score and the "out of" max (e.g. 24 out of 50). The
   submit form's category picker shows exactly the course's configured
   categories. **Semester gate (044):** if the admin hasn't declared an
   active semester yet, the submit form is blocked with a "contact your
   admin" notice - enforced both in the UI (via `get_active_semester`) and
   at the database level (a BEFORE INSERT trigger rejects the write). The
   admin approving a grade in Admin -> Grade Submissions triggers
   `process_score_entry` automatically (type label -> category key
   via the course's rows, `score/max_score`, the **active semester** as
   period, course weights, exactly-once).
   Rejecting (or deleting) an approved grade **reverts its rank effect**
   (the feed entry is removed and the rank/bar are recomputed from the
   period-start baseline through the remaining grades - even a bulk clear of
   all course data collapses cleanly). Admins declare the semester
   (start/end dates) and watch the standings / run the season end from
   `/admin/ranks`.
2. **Search** - `QuickSearchBar`: typing shows results; **clicking a result
   opens an in-place profile preview** (`ProfileModal`) without leaving the
   page; **Enter** goes to the full search results page.
3. **Messaging** - `MessengerView` is shared across all roles (implemented
   from the Penpot design in v1.28.0): conversation list with All / Groups /
   Archived segmented control, All / Groups / Direct filter chips, archived
   pill + New Chat button, and a searchable directory dialog (480px modal on
   desktop, full-screen sheet plus FAB on mobile) to start threads; the chat
   pane has role captions, the conversation options menu (mark unread,
   archive, delete, block), and design-exact bubbles/day separators; send,
   archive, delete (per-user), block, mark unread all work; the nav shows an
   unread dot (`MessagesBadge`) until all threads are read. The Groups tab
   renders an honest empty state - conversations are strict 1:1 pairs (no
   group-thread backend yet).
4. **Grades** - teacher submits (pending) -> admin approves/rejects -> approved
   grades flow to student stats and the leaderboard in realtime.
 5. **Habits** - a full personal habit tracker (`/student/habits`): five
    default habits per student (Study 5x/week Mon-Fri, Exercise 4x/week,
    Reading 30 min/day, Sleep 8 h/day, Focus 60 min/day) plus custom habits
    with a goal type (completion / count / duration / quantity), a target,
    daily vs weekly frequency, and Mon-Sun scheduled days. The dashboard shows
    the current week, weekly completion %, current + best streak, a Today list,
    per-habit details (target, schedule, this week, historical completion rate,
    current + best streak), pause/resume/archive, and delete (hard delete
    cascades through entries and pause windows), plus a contribution-style
    history calendar - weeks as columns, days as rows, month labels across the
    top, and every day box visible (gold = completed, red = missed, bordered
    empty = not filled, light = future) from the start of the year or the
    habit's first entry, with a habit picker as the only control.
    Archived habits land in an **Archived** section on the same page where they
    can be restored (history preserved) or deleted forever. Streaks follow the habit's scheduled days (a missed scheduled day
    breaks; unscheduled days and pause windows never do). Weekly targets sum
    across the week; daily targets require each scheduled day to hit the
    target. Stats are computed from real `habit_entries` rows by the pure
    `lib/habitLogic.ts` module (unit-tested). Entries upsert on
    `(student_id, habit_id, entry_date)` - duplicates are impossible at the
    DB level. Habits never touch the rank engine or grades.

   Reliability details (1.4.25): the habits page derives the detail modal's
   habit live from the store, so after **Edit** the modal immediately shows
   the new name/target, after **Pause** the Today section hides and the
   Resume button appears, and after **Archive/Delete** the modal closes
   instead of lingering on stale state. `pauseHabit` closes any already-open
   pause window before opening a new one (a double-tap can never create
   duplicate open windows, which used to make Resume fail), `archiveHabit`
   selects the row and moves it into the archived list instantly, the home
   widget's check buttons show busy + error feedback, and the provider keeps
   `loading` until the profile resolves so the page never flashes an empty
   state. User guide: `docs/HABITS.md`.
6. **Theming** - a `ThemePicker` (Midnight / Rose) replaces the old
   dark/light toggle. It lives on every role's settings page; the choice is
   stored in `localStorage` (`hc-theme`) and applied by the layout script
   before first paint, so the whole app switches without a flash. The
   **default avatar** (`components/ui/DefaultAvatar.tsx`) is an inline SVG
   that adapts to the theme through CSS variables: gray silhouette in
   Midnight, Cavern Pink silhouette in Rose - so girls without a profile
   photo still get a feminine placeholder. Version shown in settings too
   (from `lib/version.ts`).
7. **Florin shop & wardrobe** - `/student/shop` is the store (buy only),
   `/student/profile` holds the **Wardrobe** (`components/profile/Wardrobe.tsx`)
   where owned items get equipped. Three decoration types: **page
   backgrounds** (render behind every student page via `PageBackdrop` - the
   backdrop is static and only renders when a background is equipped; with
   nothing equipped the page keeps its flat token background, which is the
   default for every new student), **profile card backgrounds** (render behind the
   student's rank/name card on home, their own profile, the viewed profile
   `/student/profile/[id]`, and the in-place `ProfileModal`), and **avatar
   borders** (colored rings on `UserAvatar` wherever a `profileId` is
   passed - feed, chat, search, leaderboard, profiles, rosters). Buying and
   equipping run through SECURITY DEFINER RPCs (`purchase_shop_item`,
   `equip_shop_item`, `unequip_shop_item`) so a student can never mint coins
   or equip items they don't own. `ShopProvider` keeps a school-wide loadout
   map (`decorColorOf`, `profileCardOf`) so each user's decorations follow
    them across the app. The shop page has no balance of its own - the Florin
    pill in the header (next to the notification bell) shows the balance and
    opens the **Buy Florin** top-up modal (`FlorinPurchaseModal`). **Online
    top-ups are currently disabled** (`PAYMENTS_ENABLED = false` in
    `lib/paymentsConfig.ts`): the modal shows a "Coming soon" state with the
    balance and no purchase path, and the payment APIs respond 503 (see
    [PAYMENTS.md](./PAYMENTS.md)); the profile pencil (on
    the avatar) opens the photo/name editor.
8. **Academic info (admin)** - Admin -> Students -> Academic info picks
   education level -> program -> year/level (or **None** to clear); saving
   auto-enrolls the student in that year's courses via `autoEnrollInSection`
   and the roster/identity updates everywhere through realtime.
8. **Command-center homes** - the Admin and Teacher homes now open with a
   school/classroom intelligence layer on top of their existing workflows:

   - **Admin (`/admin/home`)**: semester progress + school snapshot (students,
     teachers, courses, sections, programs), **Hierarchy Health** (rank
     distribution D -> EX with counts, mean bar, EX count, top 5 - school
     wide via `useRankStore`), **Academic Health** (approved-only averages per
     program using the shared weighted-average helper), **Grade Pipeline**
     (pending / oldest pending / approval rate / submissions per week + a
     7-day volume chart), **Enrollment Health** (active / expired / revoked /
     expiring-within-7-days via `useAdminEnrollments`), **Teacher Workload**
     (open + overdue tasks), an **Attention Center** (aging submissions,
     expiring enrollments, account requests, overdue tasks - each links to
     the right screen), and a compact **Season Progression** trend from
     `get_school_season_history`. The pending-grades workflow, posts,
     announcements, and activity timeline are preserved below (activity now
     carries explicit type labels: submitted/approved/rejected,
     assigned/accepted/completed/declined).
   - **Teacher (`/teacher/home`)**: header with date, quick-action pills
     (grades, materials, quiz, students, messages, library), **My Teaching
     State** (classes today, courses, students, awaiting approval,
     submissions per week + an "up next" schedule line), **My Classes**
     (assigned courses with section, student count, weighted average, pending
     count - links to the classroom), **My Students** (rank distribution
     restricted to the teacher's own students - never school-wide),
     **Grading Status** (awaiting approval / approved / rejected /
     no-grades-yet) with a **Recent Submission Activity** list, an
     **Attention Center** (declining students, overdue assigned tasks, pending
     grading - each links to the right screen; composed "all clear" empty
     state), then the feed + workspace (today's schedule, lesson plans,
     pinned notes, assigned tasks).

   Both homes share the command-center primitives (`Button`, `Stat`, `Chip`,
   `Bar`, `MiniBars`, `Modal`) and the shared `components/ui/icons.tsx`
   semantic icons, so the two command centers look like one product.

9. **Public landing & auth** - visitors at `/` get the marketing page;
   logged-in users are bounced to their role home. Sign in/up happens in the
   same animated card on the landing, `/login`, or `/signup` - all share
   `AuthCard` + `AuthTabs` + the real Supabase forms. Forgot/reset follow the
   same shell.

10. **Account lifecycle** - student and teacher **Settings** pages offer
    self-service deactivation (immediate, reversible, nothing deleted) and
    admin-approved permanent deletion (with a Download My Data link to
    `/api/export-account`). Admin Settings has no deactivate/delete controls;
    the account section tells the admin to contact the developer. See §5
    for the full lifecycle flow.

---

## 5. Account lifecycle (user-facing)

### Settings pages

**Student Settings** (`/student/settings`) and **Teacher Settings**
(`/teacher/settings`) each expose:

- **Deactivate Account** - sets `profiles.deactivated_at` via the
  deactivate bridge call (`lib/server/accountOps.ts` through
  `/api/bridge/account/deactivate`), then signs the user out and redirects to
  `/login?deactivated=1`. Nothing is deleted; the user can reactivate by
  logging back in.
- **Request Account Deletion** - opens a warning modal explaining the
  request is permanent, requires admin approval, and recommending a data
  download first. The modal links to `/api/export-account` (Download My Data).
  On confirmation, a `deletion` request is inserted into `account_requests`.

**Admin Settings** (`/admin/settings`) has:

- An **Account requests** section listing pending deletion requests from
  students and teachers, with Approve/Deny buttons.
- A **Your account** section that says admin account changes require
  developer intervention. There is no self-service deactivate or delete for
  admins.

### Reactivation flow

```
Login
  ↓
deactivated_at detected (middleware check)
  ↓
/auth/reactivate
  ↓
Reactivate Account  ──or──  Stay Deactivated
  ↓                              ↓
/welcome-back notification    sign out → /login?deactivated=1
  ↓
role home
```

- `middleware.ts` checks `profiles.deactivated_at` on every request. If
  set, the user is redirected to `/auth/reactivate` regardless of which
  page they tried to reach (except the lifecycle API allowlist,
  `/auth/callback`, `/forgot-password`, `/reset-password`).
- The `/auth/reactivate` page shows a "Welcome back" message with two
  buttons: **Reactivate Account** (clears `deactivated_at`, creates a
  "Welcome back!" notification, redirects to role home) or **Stay
  Deactivated** (signs out, redirects to `/login?deactivated=1`).
- Simply logging in does NOT silently reactivate. The user must explicitly
  choose to reactivate.

### Deactivated-profile behavior

- **Search:** `useSchoolProfiles` filters `.is('deactivated_at', null)` -
  deactivated users are excluded from active user searches.
- **Friends:** `friendsStore` filters out deactivated peers from the friends
  list.
- **Leaderboard:** the `get_school_leaderboard` RPC filters
  `deactivated_at IS NULL` - deactivated students do not appear.
- **Profile viewer:** viewing a deactivated user's profile (`/student/profile/[id]`
  or teacher equivalent) shows a neutral "This account is deactivated" state
  instead of the normal personal profile.
