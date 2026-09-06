# Android - Standalone App (Capacitor)

> Package: `com.hierarchyclass.app` - `versionName 1.30.1` - `versionCode 130001` - **minSdk 24, target/compileSdk 36**
> Stack: Capacitor 8.5 (core/android/browser) + statically exported Next.js frontend bundled in the APK

## Architecture

```
APK (com.hierarchyclass.app)
 └─ MainActivity (Capacitor WebView)
     └─ bundled frontend: android/app/src/main/assets/public/   ← from out/ (static export)
          ↓ https://localhost (local asset server; no browser UI, no Custom Tabs)
     ├─ Supabase (auth, Postgres+RLS, Realtime, Storage)  ← direct HTTPS, public anon key
     └─ Deployed backend https://www.hierarchyclass.com   ← /api/bridge/*, /api/payments/*,
                                                             /api/feedback, /api/resolve-music,
                                                             /api/export-account, /api/version
```

- The **frontend is bundled**: launching the app never loads `hierarchyclass.com` for UI.
- **Auth is direct Supabase** (`supabase-js` in the WebView; session persists in WebView localStorage
  via `@supabase/ssr`'s browser client - reliable across cold starts, so no native storage adapter).
- Server-only operations (signup with school-eligibility checks, account lifecycle, payments, email,
  music resolution, data export) run on the deployed Next.js backend and are called through
  `lib/bridgeClient.ts` → `app/api/bridge/*` (the same implementations the web app uses via
  `lib/server/*`). Secrets stay server-side; only `NEXT_PUBLIC_*` values are inlined.
- The previous Bubblewrap TWA is archived untouched at `../android-twa/` (same keystore; see
  `../android-twa/README.md` for its history). The standalone app signs with the SAME
  `android-twa/android.keystore` and a higher versionCode, so it installs over TWA builds as an update.

## Authentication boot flow (components/native/NativeRootGate.tsx)

"/" serves static HTML that IS the minimal entry screen (logo + spinner), so a cold start never
flashes a Home or login page. One client gate owns the whole boot decision - no setTimeout, no
timeouts-based races, no second auth system:

1. `auth.getSession()` (local, offline-safe): no session → **Login** directly (the redundant
   "Log In / Create an Account" chooser was removed - `Login` owns the "Welcome back" greeting and
   the Create an Account path, so a fresh install / signed-out cold start lands on Login).
2. `auth.getUser()` (network-validated, refreshes tokens): failure with a 4xx → the stored session
   is expired/invalid → `signOut()` clears it (plus the role hint) → Login.
3. Profile row (`profiles.role`, database truth - never `user_metadata`): restricted →
   `/auth/restricted`, deactivated → `/auth/reactivate`, unverified email → `/login?unverified=1`,
   valid role → `router.replace(/<role>/home)` (Student/Teacher/Admin home), no profile →
   `/auth/incomplete`.
4. Offline with a persisted session: the last known role (`lib/native.ts` localStorage hint) routes
   to the role home; no logout happens just because the network is down.

After login, the role home is loaded with `location.replace` - the login page leaves the history
stack, so hardware back from the role home exits the app instead of re-entering the auth flow.
After logout (`components/auth/LogoutButton.tsx`) the Login screen is shown and the session stays
cleared across restarts.

## Android navigation

- **Student:** header hamburger on Home (< xl) → `MobileDrawer` (the same `STUDENT_NAV_ITEMS` the
  desktop `SideNav` uses; Home, Messages, Materials, Library, Quiz, Leaderboard, Shop, Habits,
  Profile, Settings + logout). Sub-pages show a back arrow. xl+ pivots to the desktop SideNav.
- **Back header:** on Android the sub-page header's back arrow returns to the **menu selection**
  (top-level menu pages reopen the drawer; drill-down pages like a viewed profile go back to the
  previous context) and the title shows the current menu name (Materials, Library, Quiz,
  Leaderboard, Shop, Habits, …) instead of "Back to Home". Drawer navigation replaces its pushed
  history entry, so there are no stale entries or back loops.
- **Platform isolation:** the drawer history manipulation above is strictly Android-only
  (`isNativeApp()`). On web/desktop/tablet/mobile-browser the drawer keeps the original behavior:
  nav items are plain `<Link>`s with normal `router.push` history and an auto-close on route
  change. The back arrow on web returns to Home (`router.push("/student/home")`) exactly as before.
- **Collapsing header:** on Android the header collapses to a compact back/menu-only bar when
  scrolling down - title, app name, and icons are fully removed from layout - and returns to the
  full header when scrolling up (`lib/useCollapsibleHeader.ts`, a single rAF-throttled scroll
  listener: no jitter, no duplicate listeners). Web/desktop/tablet keep their fixed header.
- **Teacher/Admin:** role bottom nav on phones (`TeacherBottomNav` / `AdminBottomNav`, self-hidden
  at md+) with Home, role areas, Settings and logout; md+ pivots to the desktop SideNav. The
  teacher/admin phone block screen (`DeviceWarning`) is web-only - native phones get the real app.

## Android back button (components/native/NativeBackButton.tsx)

ONE global `App.addListener("backButton")` listener mounted from the root layout (native only):

1. An open overlay (Modal / SearchOverlay / ProfileModal / FlorinPurchaseModal - registered in
   `lib/nativeBackHandler.ts`; the topmost handler wins) consumes the press and closes itself.
2. Otherwise, if the WebView has in-app history (`canGoBack`) → `history.back()` (the MobileDrawer
   participates through its own pushed history entry).
3. Otherwise - at the root (role home, boot screen) → `App.exitApp()`, standard Android behavior.

The boot screen registers a root handler while it is up, so stale authenticated history behind "/"
after a sign-out is unreachable. No duplicate listeners, no browser interference, no logout loops.

## Prerequisites (this machine - verified 2026-08-28)

- **JDK 21** (`/usr/lib/jvm/java-21-openjdk`) - Capacitor 8's Android module needs Java 21 (JDK 17 fails with `invalid source release: 21`).
- Android SDK `~/Android/Sdk` (build-tools 37, platform 36, platform-tools) with `ANDROID_SDK_ROOT` set.
- Node + the repo's npm dependencies (includes `@capacitor/core|android|browser` + dev `@capacitor/cli`).

## Build

```bash
# 1. Statically export the frontend into out/ (moves middleware/api aside, restores after).
#    The APK distribution file under public/downloads is intentionally NOT bundled
#    (out/downloads is stripped - the in-app download page links the production origin).
npm run export:android

# 2. Copy out/ into the native project + update plugins
npx cap sync android

# 3a. Debug APK
cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleDebug --no-daemon
#    → app/build/outputs/apk/debug/app-debug.apk

# 3b. Signed release APK + AAB (requires android/keystore.properties, see Signing)
cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk ./gradlew assembleRelease bundleRelease --no-daemon
#    → app/build/outputs/apk/release/app-release.apk
#    → app/build/outputs/bundle/release/app-release.aab
```

**Deployment prerequisite:** the Android app calls `https://www.hierarchyclass.com/api/bridge/*`.
Those routes ship with this repo - deploy the web app BEFORE distributing APK builds, otherwise
signup/account operations fall back to the bridge client's generic offline error (login, being
direct Supabase, works regardless).

## APK distribution & update system

- **Distribution:** beta/standalone users sideload the direct APK from the website's `/download`
  page, which serves `public/downloads/hierarchy-class-v<version>.apk` and shows the real
  version / size / SHA-256 from `lib/apkRelease.ts` (update that file to match the exact audited
  `app-release.apk` after each release).
- **Update detection:** the app (only inside Capacitor) fetches
  `https://www.hierarchyclass.com/android-version.json` on launch and compares versions
  numerically (MAJOR/MINOR/BUG_FIX - never lexicographic). The installed versionCode follows the
  project convention (`MAJOR×100000 + MINOR×1000 + BUG_FIX`), so an up-to-date install never shows
  a false update banner. If a newer version exists it shows a non-blocking banner with a
  **Download Update** action that opens the official `/download` page on the production origin
  (`components/pwa/AndroidUpdateChecker.tsx`).
- **No silent updating** - installing a new APK is always a manual user action. If Google Play is
  added later, Play handles updates itself (store AAB, Play App Signing); this direct-APK checker
  would then be unnecessary.
- **`public/android-version.json`** must be kept in sync with `lib/apkRelease.ts` and
  `android/app/build.gradle` on every release (`latestVersion`, `versionCode`, `downloadUrl`,
  `releaseNotes`).

## Signing

`android/keystore.properties` (gitignored, mode 600) holds the release signing material:

```
storeFile=../../android-twa/android.keystore
storePassword=…
keyAlias=android
keyPassword=…
```

The keystore is the original Bubblewrap keystore (untracked); its certificate SHA-256 is the one
already published in `public/.well-known/assetlinks.json`. Without `keystore.properties`,
`assembleRelease` produces an unsigned APK and `signingConfig` is skipped.

## Versioning

Bump `versionCode`/`versionName` in `android/app/build.gradle` at a native release (versionCode
must always increase for Play). The web version in `package.json` is independent (see
`docs/ANDROID.md`).

## Device/permissions notes

- Permissions: `INTERNET` + `CAMERA` only. CAMERA backs the in-app QR scanner (html5-qrcode via
  WebView getUserMedia); Capacitor's bridge surfaces the runtime prompt and denies gracefully.
- PayMongo checkout and other external URLs open in the system browser via `@capacitor/browser`
  (`Browser.open`) - the app shell itself never renders browser chrome.
- The PWA service worker / update prompt / install banner are intentionally disabled inside the
  app (`lib/native.ts` guards); updates ship as new APK builds.
- Known benign log line at startup: `Error injecting safe area CSS` (Capacitor 8 SystemBars
  races the first page paint; the app uses native `env(safe-area-inset-*)` and is unaffected).

## Testing status

**2026-08-30 - physical device (POCO 22111317PG, ADB 71a314040000):** install ✓, launch ✓, MainActivity ✓ (no TWA/browser), entry screen ✓ (branding, tagline, purpose, Log In, Create an Account), login ✓ (fields, validation, Supabase invalid-credential error, forgot/signup nav), signup ✓ (all fields, scroll, CREATE ACCOUNT reachable), forgot-password ✓ (submission, generic success state, no fake success), keyboard ✓ (Next advancement on all forms, Enter advances focus, terminal Go submits), back button ✓ (priority: overlay → history → exit; all auth-screen traversal verified), offline ✓ (login shows "You're offline" message, forgot shows connection error, no fake success), deep-link ✓ (fake code → reset-password invalid state, no crash), lifecycle ✓ (background/resume, recent apps, force-stop/relaunch), form abuse ✓ (rapid taps, no duplicate navigation), visual ✓ (consistent 52px buttons, rounded-xl, safe-area, dark-theme, no Portalyx contamination). Web suite green (tsc, lint, 160/160 tests, build, PWA).

NOT tested: real-account login/session persistence on hardware, authenticated role flows, password-reset end-to-end (requires recovery email), camera QR, PayMongo checkout, Play Store publication.
