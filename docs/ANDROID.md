# Android - Hierarchy Class PWA & Trusted Web Activity

> ⚠️ **ARCHITECTURE MIGRATED (2026-08-30, v1.25.113):** the Android app is now a **standalone
> Capacitor application** with the Next.js frontend bundled inside the APK - it no longer uses a
> Trusted Web Activity, Custom Tabs, or the website as its frontend source. See
> [`android/README.md`](../android/README.md) for the current architecture, build, and signing
> docs. The Bubblewrap TWA implementation described below was fully audited and verified
> (checksum fix, byte-identical reproducible release build, DAL verified) and is archived intact
> at [`android-twa/`](../android-twa/README.md); this document's TWA/PWA sections remain accurate
> as the archive's reference and for the web PWA half (PWA manifest, service worker, offline
> model, caching policy all still serve the website).

> **Package:** `com.hierarchyclass.app` - **TWA build:** `1.15.90` (`versionCode 11590`, archived) - **Standalone build:** `1.31.1` (`versionCode 131001`) - **Web:** `1.31.1` (`package.json:version`)
> **PWA:** `public/manifest.json` + `public/sw.js` (vanilla, no Workbox) → **TWA via Bubblewrap** → APK/AAB

This document is the single source for Android delivery, offline architecture, and PWA security. It reflects the actual implementation in `app/layout.tsx`, `public/manifest.json`, `public/sw.js`, `middleware.ts`, `android/twa-manifest.json`, and `public/.well-known/assetlinks.json`.

---

## 1. Architecture

```
Next.js 14.2.5 App Router (React 18, Tailwind)
  ↓  HTTPS production deployment (https://www.hierarchyclass.com)
  ↓  PWA manifest (public/manifest.json) + Service Worker (public/sw.js, CACHE_STATIC hc-static-v1)
  ↓  Trusted Web Activity (Bubblewrap, android/twa-manifest.json)
  ↓  Android APK (debug) / AAB (Play Store release)
```

- **Web is the product.** The TWA is a Chrome Custom Tabs wrapper that shows the PWA fullscreen (no address bar when Digital Asset Links verified). No native rewrite, no Capacitor/Tauri.
- **Rank authority stays server-side.** `lib/rankEngine.ts` is pure math, but the authoritative transition is `Teacher/Admin → Server RPC (approve_grade_submission, confirm_and_apply_score_entry) → Postgres + RLS → realtime → UI`. See `docs/RANK_SYSTEM.md` and `lib/rankEngine.ts:1-100`.
- **Realtime:** Supabase Realtime channels in `lib/rankStore.tsx`, `lib/classroomHierarchyStore.tsx`, `lib/chatStore.tsx` - never cached, never queued offline.

---

## 2. PWA Foundation (already implemented, milestones M1→M7)

**Manifest** `public/manifest.json:1-41`
- `name: Hierarchy Class`, `short_name: Hierarchy Class`, `description`, `start_url: /`, `scope: /`, `display: standalone`, `display_override: [window-controls-overlay]`, `orientation: any`, `background_color: #0f0f11`, `theme_color: #0f0f11`, `categories: [education]`, `lang: en`
- Icons: `192×192 any`, `512×512 any`, `512 maskable` (51px padding on #0f0f11), `icon.svg any`
- Linked via `app/layout.tsx:37` `metadata.manifest: "/manifest.json"` → `<link rel="manifest">`

**Icons** `public/icons/`
- `icon-192.png` 192×192 (5.0k), `icon-512.png` 512×512 (19k), `maskable-512.png` 512 (17k, safe area), `apple-touch-icon-180.png` 180 (4.6k) - generated via `sharp` from `public/icon.svg` (crown #9ea7b3 on #141214 `rx="6"`). Source brand `public/brand/*` preserved. No new logo.

**Viewport & safe areas** `app/layout.tsx:24-32`
- `viewport: { width:"device-width", initialScale:1, viewportFit:"cover", themeColor:[light #e9eaed, dark #0f0f11] }`
- `app/globals.css:98-126` `min-height:100dvh/100svh` fallback, `.pb-safe` utilities, `env(safe-area-inset-*)` in `AppShell.tsx:32`, `BottomNav` `paddingBottom: env(safe-area)`, `Modal.tsx:38-49` `max(1rem,env(safe-area))`.

**Service Worker** `public/sw.js:1-105`
- Vanilla (no Workbox) - 3.6k, `CACHE_STATIC hc-static-v1`, `PRECACHE` `/offline` + manifest + icons.
- `install`: `cache.addAll(PRECACHE)`; no `skipWaiting` (user-approved via `message SKIP_WAITING`).
- `activate`: `clients.claim()` + old cache cleanup.
- `fetch`:
  - `if (method!=="GET") return` - mutations never cached
  - Bypass: `hostname includes supabase.co`, `pathname /api/`, `/payment/`, `/auth/` → `return` (NetworkOnly)
  - Navigate `request.mode==="navigate"` → `NetworkFirst` never `cache.put` (protects `decideAuthRoute` + `middleware.ts` + role HTML), fallback `caches.match("/offline")` or 503
  - Static `/_next/static/*`, `/icons/*`, `/brand/*`, `/hc_bg/*`, `*.png|jpg|jpeg|svg|webp|ico|woff2` → `CacheFirst` + background revalidate `cache.put` on `ok`
  - Else `NetworkOnly` (no leak)

**Offline page** `app/offline/page.tsx:1-29` `dynamic force-static` - dark card “You’re offline… Try again” → `/`. Precached.

**Registration & install** `components/pwa/`
- `ServiceWorkerRegistration.tsx:1-60` - `navigator.serviceWorker.register("/sw.js", {scope:"/"})` only in `isSecureContext`, `updatefound` → `waiting` → banner “Update available → Reload” `postMessage SKIPPING`, `controllerchange → reload` (no forced refresh mid-grade-entry)
- `InstallPrompt.tsx:1-50` - captures `beforeinstallprompt` (Android/Desktop), `appinstalled`, shows “Install Hierarchy Class” banner only when `deferred` exists (not fake), hides when `display-mode:standalone`
- `IOSInstallHint.tsx:1-33` - iOS detection (`/iPad|iPhone|iPod/` or `MacIntel+maxTouchPoints`), `display-mode:standalone`/`navigator.standalone`, `localStorage hc-ios-hint-dismissed`, shows “Tap Share → Add to Home Screen” once
- All mounted in `app/layout.tsx:118-120` inside `<body>` (outside providers).

**Middleware** `middleware.ts:102-105` `matcher: "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"` - excludes `sw.js`, `manifest.json`, `offline`, `public/.well-known/assetlinks.json` (`*.json` not excluded? manifest explicitly, assetlinks via `well-known` path not matched due to `offline` prefix? Actually `public/.well-known/assetlinks.json` is served at `/.well-known/assetlinks.json` → pathname `/.well-known/assetlinks.json` does not match `_next/static` but does not end with `svg|png|jpg...` so without exclusion it would go through middleware. We explicitly exclude `manifest.json` and `sw.js` and `offline`; `assetlinks.json` is under `.well-known` not excluded - but middleware will see `/.well-known/assetlinks.json` and try to auth it; however `assetlinks.json` must be public (no auth). We should ensure `assetlinks.json` is also excluded - currently not, but `git` shows `public/.well-known/assetlinks.json` will be served as static at `/.well-known/...` which may be treated as `.*\.(?:svg|...)$`? It ends with `json`, not matched, so it **would** go through middleware. We need to also exclude `\.well-known` or `assetlinks`. Add `\.well-known` to matcher. *TODO* - see Known Risks.

---

## 3. Offline Model - What Works, What Requires Network

**Students do NOT control rank.** Rank is never mutated locally, never queued offline, never faked. Flow is:

```
Teacher/Admin action (enter score, save weights, submit)
  → Server RPC (e.g. approve_grade_submission, confirm_and_apply_score_entry, saveCourseRankWeights)
  → lib/rankEngine.ts validation + migration guard tests + RLS + paymongo webhook
  → Postgres authoritative update
  → Supabase Realtime broadcast
  → Student UI (RankProvider, WeeklyProgress, Leaderboard) syncs
```

`lib/rankEngine.ts:190-800` `DEFAULT_RANK_CONFIG {k:1.8, weights:{exam:0.4,quiz:0.2,activity:0.25,participation:0.15}}` is pure; `resolveConfig` validates weights sum to 1. No client queue.

### SAFE offline (cached, no auth)

- App shell HTML fallback: `app/offline/page.tsx` (static, no data)
- Icons: `public/icons/*`, `public/icon.svg`, `favicon-*`
- Fonts: `fonts.googleapis.com` (preconnect in layout, but not SW-cached unless static pattern matches)
- Next static: `/_next/static/*` (hashed, `CacheFirst` 30d via SW)
- Brand/background images: `/brand/*`, `/hc_bg/*`

### NETWORK-REQUIRED (never cached, blocked with explanation when offline)

- Login/supabase `auth` (`lib/supabase/client.ts`, `middleware.ts:29-99`)
- Supabase reads: `profiles`, `rankStore`, `classroomHierarchyStore`, `schoolFeedStore`, `chatStore`, `habitStore`, `shopStore`
- Realtime: chat, rank, grade, notifications
- Sending messages: `components/chat/MessengerView.tsx:158-164` guards `useOnline()` → `actionError: "You’re offline - connect to send…"` + `OfflineBanner`, draft preserved in `draft` state
- Teacher grade submission: `app/teacher/classroom/page.tsx:177-205` `useOnline()` guard → `setSubmitError: "You’re offline - connect to submit grades. Your scores are still in the fields…"`, `handleSaveWeights` same, inputs preserved in `scoreInputs`/`maxInputs` (not cleared)
- Payments: **online top-ups are currently disabled** (`PAYMENTS_ENABLED = false` in `lib/paymentsConfig.ts`) - `components/student/FlorinPurchaseModal.tsx` shows a static "Coming soon" state with the balance and no purchase path, and `/api/payments/*` (except the webhook) refuse with 503
- Habits `toggleDay`/`recordEntry` (Supabase) will error via store (existing `error` state) - not explicitly bannered to avoid blanket noise; failure is visible in `actionError`
- Account/security: `useAccountRequests`, `deactivateAccount` etc. remain network

**Reusable primitive:** `lib/useOnline.ts:1-22` (`navigator.onLine` + `online`/`offline` events) + `components/ui/OfflineBanner.tsx:1-40` (`OfflineBanner` alert + `OfflineDot` header). Preserve design system: `border-warn-soft bg-warn-soft text-warn` + ⓧ icon.

**Never fake success:** All guards `if (!isOnline) { setError(...); return; }` - no local optimistic rank/grade/message/payment mutation.

---

## 4. Security - Caching Policy

| Bucket | Policy | Code |
|---|---|---|
| Static (hashed, no auth) | `CacheFirst` + revalidate | `public/sw.js:64-102` `isStatic` → `caches.match` → bg `fetch` + `put` |
| Navigation HTML | `NetworkFirst` never cached, fallback `/offline` | `public/sw.js:51-60` `request.mode==="navigate"` → `fetch`→`catch`→`caches.match(OFFLINE)` |
| Supabase | `NetworkOnly` bypass | `public/sw.js:44` `hostname.includes("supabase.co")` → `return` |
| `/api/*` | `NetworkOnly` | `public/sw.js:45` `pathname.startsWith("/api/")` → `return` |
| `/payment/*` | `NetworkOnly` | `public/sw.js:46` |
| `/auth/*` | `NetworkOnly` | `public/sw.js:47` |
| `POST/PUT/DELETE` | `NetworkOnly` | `public/sw.js:41` `method!=="GET"` → `return` |
| Payment webhook | Never cached, idempotent via `lib/paymongo.ts` | `app/api/payments/webhook/route.ts` `verifyWebhook` etc. |

Middleware `matcher` excludes `sw.js`, `manifest.json`, `offline` (and should also exclude `.well-known`). Auth/RBAC via `decideAuthRoute` in `middleware.ts:86-96` + `lib/authz.ts` always runs (HTML not cached). Digital Asset Links served public.

---

## 5. Android Packaging - Trusted Web Activity

**Package:** `com.hierarchyclass.app` - `android/twa-manifest.json:2`

**App name:** `Hierarchy Class` (`android/twa-manifest.json:4` `name`, `launcherName`)

**Version:** `package.json:version` (`1.31.1`) is the web release version (see [VERSIONING.md](./VERSIONING.md) for bump rules). The Android shell tracks it only at native-build time: `android/twa-manifest.json` `appVersion:1.15.90` `appVersionCode:11590` (`major*10000 + minor*100 + patch`). The archived TWA shell was built at 1.27.116 (versionCode 127116).

**Host:** `www.hierarchyclass.com` - **PRODUCTION** (Vercel). Set in `android/twa-manifest.json` `host`, `iconUrl`, `maskableIconUrl`, `monochromeIconUrl`, `webManifestUrl`, `fullScopeUrl`. The TWA scope is restricted to this host only.

**Icons:** `public/icons/icon-512.png` (any), `maskable-512.png` (maskable, 51px padding on #0f0f11).

**Signing:**
- Debug: Bubblewrap auto-generates `android/debug.keystore` (gitignored).
- Release: `keytool -genkey -v -keystore android/android.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias android` → `android/twa-manifest.json:23-26` `signingKey:{path:"./android.keystore", alias:"android"}`. **Never commit** `*.jks`, `*.keystore`, passwords. `.gitignore:29-34` `*.jks`, `*.keystore`, `android/app/build/`, `android/.gradle/`.
- Play App Signing: upload `AAB`, enroll, then use **Play signing SHA-256** for `assetlinks.json` (Play Console → Setup → App signing).

### Prerequisites - ACTUAL ENVIRONMENT (verified 2026-08-26, Arch Linux)

- **JDK 17 (active system default):** `/usr/lib/jvm/java-17-openjdk` (`java -version` → 17.0.20.1; `archlinux-java status` → `java-17-openjdk (default)`). Packages `jdk17-openjdk` + others installed; **use the explicit JDK 17 path** for Bubblewrap regardless of future default switches.
- **Android SDK root (user-level, writable):** `~/Android/Sdk`
  - AUR packages (`android-sdk-cmdline-tools-latest`, `android-sdk-platform-tools`, `android-sdk-build-tools`, `android-platform`) install a **root-owned read-only** copy under `/opt/android-sdk`. Discover with `pacman -Ql <pkg> | grep bin/`.
  - `sdkmanager` against `/opt/android-sdk` fails (`AccessDeniedException: /opt/android-sdk/.sdk`) - never usable without sudo.
  - The writable user SDK at `~/Android/Sdk` contains: `build-tools/36.1.0`, `build-tools/37.0.0`, `platforms/android-36`, `platforms/android-36.1`, `platform-tools` (adb), `emulator`, `cmdline-tools/latest` (CLI 23). `licenses/` holds the standard accepted-hash markers so Gradle/AGP sees licenses accepted.
  - Compatibility shim: `~/Android/Sdk/bin -> cmdline-tools/latest/bin` symlink (Bubblewrap ≤1.25 validates legacy `<sdk>/bin` layout).
- **sdkmanager:** `~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager` (v1.0.15985488 "Android CLI"; legacy flags still work). **adb:** `~/Android/Sdk/platform-tools/adb`.
- **Bubblewrap CLI 1.25.0**, installed user-level via `npm config set prefix ~/.local && npm i -g @bubblewrap/cli` → binary `~/.local/bin/bubblewrap` (no sudo). Config `~/.bubblewrap/config.json`: `{"jdkPath":"/usr/lib/jvm/java-17-openjdk","androidSdkPath":"$HOME/Android/Sdk"}`.
- **User shell env** (`~/.bashrc`, before the interactive guard so login+non-login shells get it):
  ```bash
  export ANDROID_HOME="$HOME/Android/Sdk"
  export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
  export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/37.0.0:$PATH"
  ```
- Production HTTPS domain (still required for production TWA verification - see below).

To rediscover paths on another machine: `pacman -Ql android-sdk-cmdline-tools-latest | grep sdkmanager`, `archlinux-java status`, `ls /usr/lib/jvm/`.

### Doctor

```bash
export PATH="$HOME/.local/bin:$PATH"
bubblewrap doctor
# → doctor Your jdkpath and androidSdkPath are valid.   ✅ (verified)
```

### Verified local build pipeline (history - loopback test builds)

> Superseded: the production domain is now configured and production artifacts have been built (see below). Kept for reference on how the pipeline was first validated before the domain existed.

```bash
cd hierarchy_class
# 1. Serve public/ locally
python3 -m http.server 8791 --bind 127.0.0.1 --directory public &
# 2. Copy twa-manifest.json → twa-manifest.localtest.json with host/icon/webManifestUrl/fullScopeUrl
#    rewritten to http://127.0.0.1:8791 (node -e transform), then:
bubblewrap update --manifest android/twa-manifest.localtest.json --directory android --skipVersionUpgrade
# 3a. Debug APK (Gradle directly):
cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew assembleDebug --no-daemon
# 3b. Release APK+AAB (non-interactive via env passwords):
export BUBBLEWRAP_KEYSTORE_PASSWORD=$(cat ~/.bubblewrap/hc-keystore.pass)
export BUBBLEWRAP_KEY_PASSWORD=$BUBBLEWRAP_KEYSTORE_PASSWORD
bubblewrap build --manifest twa-manifest.localtest.json --skipVersionUpgrade
# 4. Cleanup: kill server, rm twa-manifest.localtest.json,
#    sha1sum android/twa-manifest.json | awk '{print $1}' > android/manifest-checksum.txt
```

After cleanup the repo's canonical `android/twa-manifest.json` is untouched (placeholder domain preserved) and `android/manifest-checksum.txt` matches it, so plain `bubblewrap build` won't prompt.

### Bubblewrap init/build (production, once domain exists)

```bash
# 1. If the domain ever changes, update all host/URL keys in android/twa-manifest.json
#    (keys: host, iconUrl, maskableIconUrl, monochromeIconUrl, webManifestUrl, fullScopeUrl)
# 2. Regenerate the project from the canonical manifest:
export PATH="$HOME/.local/bin:$PATH"
bubblewrap update --manifest android/twa-manifest.json --directory android --skipVersionUpgrade
# 3. Debug APK:
cd android && JAVA_HOME=/usr/lib/jvm/java-17-openjdk ./gradlew assembleDebug --no-daemon
# 4. Release (prompts for keystore passwords; or export BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD):
bubblewrap build --manifest twa-manifest.json
```

> **Canonical regeneration (2026-08-26):** with the production domain live, `bubblewrap update --manifest twa-manifest.json --directory . --skipVersionUpgrade` was run against `https://www.hierarchyclass.com/manifest.json` - the project is generated canonically (no manual patching).
>
> **Gotcha:** `bubblewrap build` compares the manifest's SHA-1 against `android/manifest-checksum.txt`; write it WITHOUT trailing newline: `printf '%s' "$(sha1sum twa-manifest.json | awk '{print $1}')" > manifest-checksum.txt` (from `android/`). A trailing newline makes build prompt interactively. The checksum must be refreshed after **any** `twa-manifest.json` change - the v1.15.90 version bump (commit `91031cd`) forgot this and the stale checksum (still matching v1.15.87) was only caught and fixed on 2026-08-28.

### Production artifacts (2026-08-26, v1.15.90, www.hierarchyclass.com config)

| Artifact | Path | Size | Verified |
|---|---|---|---|
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | 5,052,528 B | badging: `com.hierarchyclass.app`, versionCode 11590, versionName 1.15.90; resources contain only `www.hierarchyclass.com` URLs |
| Signed release APK | `android/app-release-signed.apk` | 1,142,956 B | apksigner v1+v2+v3 verified; cert SHA-256 matches keystore AND the fingerprint served at `https://www.hierarchyclass.com/.well-known/assetlinks.json`; resources point at production host |
| Signed release AAB | `android/app-release-bundle.aab` (+ copy at `android/app/build/outputs/bundle/release/app-release-bundle.aab`) | 1,253,380 B | valid AAB (BundleConfig.pb, base/manifest, dex, resources.pb) |

These builds use the real `www.hierarchyclass.com` configuration. They remain **untested on a physical device** - see Testing.

**Re-verified 2026-08-28** (after fixing the stale `manifest-checksum.txt`, see Gotcha): `./gradlew assembleDebug` and `bubblewrap build --skipVersionUpgrade` were re-run against the same repo state. The fresh `android/app-release-signed.apk` is **byte-identical** (`cmp`) to the distributed `public/downloads/hierarchy-class-v1.15.90.apk`, so `lib/apkRelease.ts` (sha256 `7d0ac743…`, size 1,142,956 B) remains exact without re-auditing. The debug APK verifies as TWA on-device too (its `~/.android/debug.keystore` fingerprint is entry 2 of `assetlinks.json`). Physical device testing is still pending.

### Signing - CURRENT STATE

- `android/android.keystore` **exists** (gitignored via `*.keystore`, mode 600, alias `android`, RSA-2048, validity 30y). Password stored user-level outside the repo at `~/.bubblewrap/hc-keystore.pass` (mode 600). Back it up to a password manager; losing it + losing Play access to the key = cannot update the app.
- Certificate SHA-256 (public info, safe to share): `8c95e7dc38449b4bd682d358986e4b606400dbe19c29ba60e155e31eef51e846`
  (`keytool -list -v -keystore android/android.keystore -alias android | grep SHA-256`)
- Decision point: if this local key becomes the upload key, its SHA-256 (or Play App Signing's re-sign key) goes into `assetlinks.json`. If you regenerate a different release/upload key later, the fingerprint changes and this keystore should be destroyed.
- `.gitignore` also now covers `android/build/`, `android/*.apk`, `android/*.aab`.

### Digital Asset Links

File: `public/.well-known/assetlinks.json:1-12` → served at `https://www.hierarchyclass.com/.well-known/assetlinks.json` (HTTP 200, byte-identical to the repo copy - verified 2026-08-28)

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.hierarchyclass.app",
      "sha256_cert_fingerprints": [
        "8C:95:E7:DC:38:44:9B:4B:D6:82:D3:58:98:6E:4B:60:64:00:DB:E1:9C:29:BA:60:E1:55:E3:1E:EF:51:E8:46",
        "B6:7B:34:DB:95:E0:97:C2:75:93:4C:04:34:55:22:FD:E8:A4:31:C1:84:69:CE:9B:52:9C:39:70:E8:10:C2:69"
      ]
    }
  }
]
```

Both fingerprints are real and re-verified against the actual keystores on 2026-08-28: entry 1 is the release keystore `android/android.keystore` (alias `android`, matches `app-release-signed.apk`); entry 2 is the local debug keystore `~/.android/debug.keystore` (alias `androiddebugkey`, added in commit `c48914a` so debug builds verify as TWA during development - it only matches debug APKs signed on machines sharing that keystore). No Play App Signing entry yet (none enrolled).

**Steps:**
1. Get SHA-256:
   - Current local keystore (exists): `keytool -list -v -keystore android/android.keystore -alias android | grep SHA-256` → `8C:95:E7:DC:38:44:9B:4B:D6:82:D3:58:98:6E:4B:60:64:00:DB:E1:9C:29:BA:60:E1:55:E3:1E:EF:51:E8:46` ✅ **verified 2026-08-26 and already inserted into `public/.well-known/assetlinks.json`**
   - Play signing (when enrolled): Play Console → Setup → App integrity → App signing key → SHA-256
2. Add it as an additional colon-separated hex entry `AB:CD:...` (64 hex chars + 15 colons) - existing entries stay.
3. Deploy `public/.well-known/assetlinks.json` → `curl -v https://www.hierarchyclass.com/.well-known/assetlinks.json` must `200` `Content-Type: application/json` with no redirect, no auth (middleware excludes `.well-known` - fixed, see Known Risks).
4. Verify: `https://developers.google.com/digital-asset-links/tools/generator` or `adb logcat | grep -i assetlinks` on device after install - TWA shows no address bar when verified; Custom Tabs (with bar) is still functional.

**Current status (2026-08-28): steps 1–3 are DONE.** Both real fingerprints are deployed and match the keystores on this machine; no Play signing entry is pending.

### Headers for PWA

`next.config.js:1-4` currently empty; no custom `headers()` needed for `assetlinks.json` (`public` serves with correct MIME). If needed, add `headers: async () => [{source: "/.well-known/assetlinks.json", headers: [{key:"Content-Type", value:"application/json"}]}]`.

---

## 6. Development & Versioning

- Single version source is `package.json:version` (web release). At a native release it flows to `android/twa-manifest.json:appVersion` + `appVersionCode` (`major*10000+minor*100+patch`; example `1.15.90 → 11590`) plus the generated `android/app/build.gradle` while manual sync is in effect. Web-only releases leave the Android artifacts and `lib/apkRelease.ts` at the last audited shell build.
- No competing version systems.
- Icon generation: `public/icon.svg` → `sharp` (already `sharp@0.34.5` via `allowScripts`) → `node scripts/generate-pwa-icons.mjs` or manual `sharp` resize (see `android/README.md`). Compressed via `build` hashing for static, but icons are `CacheFirst` 30d via SW.

---

## 7. Testing

### Automated

- `npx tsc --noEmit` (TS), `npm run lint` (ESLint), `npm run build` (Next 14), `npm test` (165 tests: `rankEngine.test.ts`, `habitLogic.test.ts`, `signupValidation.test.ts`, `authz.test.ts`, `migrationGuard.test.ts`, `paymongo.test.ts`, `paymentGuard.test.ts`, `pwaGuard.test.ts`, `appUpdate.test.ts`, `platform.test.ts`, `apkRelease.test.ts`)
- PWA validation: `scripts/validate-pwa.mjs` (manifest required fields, icons exist, sw bypass rules, no unsafe authenticated caching)
- `lib/pwaGuard.test.ts` (if added): manifest fields, icon files exist, SW never caches Supabase/API
- `lib/useOnline` hook unit not needed (thin wrapper).

### Browser / emulator (local)

No physical device claimed. Local browser verification at 320/360/375/390/412 portrait/landscape, 768/820, 1180 landscape, 1024/1366/1440/1920 - via Chrome DevTools, check `document.documentElement.scrollWidth===clientWidth` except contained `overflow-x-auto` (habits, chat, bottom nav), keyboard (`MessengerView` `calc(100dvh-140px)`), dropdown `max-h-[60dvh]`, install prompt in `Chrome → Application → Manifest`.

### Android / installed PWA / packaged

**TWA physical verification procedure (www.hierarchyclass.com build, 2026-08-26):**

1. **Uninstall** any previously installed Hierarchy Class app (old builds target other hosts - their verification state is irrelevant and can confuse results).
2. Install the new APK: `adb install android/app/build/outputs/apk/debug/app-debug.apk` (or copy `app-release-signed.apk` to the phone and open it; enable "install unknown apps" for the file manager if prompted).
3. Launch **Hierarchy Class** from the launcher.
4. ✅ EXPECT: app opens directly on `https://www.hierarchyclass.com/` with **no URL/address bar** (verified TWA). ❌ If a Chrome bar is visible: open `chrome://digital-asset-links` (or `adb shell pm verify-app-links --re-verify com.hierarchyclass.app`) and re-check; confirm the phone can reach `https://www.hierarchyclass.com/.well-known/assetlinks.json`.
5. Navigate internally (Home → Leaderboard → Shop → back) - must stay fullscreen, no bar, no browser chrome.
6. External links (e.g. PayMongo GCash checkout) are expected to open in a Custom Tab/browser - that is correct TWA behavior for off-scope URLs.
7. Login + signup: school selector must show "CSA - College of Saint Amateil"; login lands on the role home.
8. Service worker: DevTools remote debugging (`chrome://inspect`) → Application → Service Workers shows `sw.js` activated+running.
9. Update system: after the NEXT deployment, keep the app open ~15 min or background/foreground it → "New version available" appears above the bottom nav → **Update** reloads exactly once into the new version; **Later** hides it until the following deploy.
10. Regression: chat send, grade entry, offline airplane mode → `/offline` (payments top-up is disabled - the modal shows "Coming soon").

Physical Android not claimed in this env. QA checklist (reproducible on HTTPS staging):

Android 320-412 portrait/landscape: install banner (`beforeinstallprompt` → `InstallPrompt` banner) → tap Install → home screen icon (maskable 512 with safe area) → standalone (no URL bar when `assetlinks` verified, else Custom Tabs) → safe-area insets (`AppShell` bottom calc, `BottomNav` `env(safe-area)`, `Modal` `max(1rem,env)`) → BottomNav scroll → keyboard (chat `inputMode` etc.) → login (Supabase) → student/teacher/admin nav → chat send → classroom grade enter/submit → rank view (Leaderboard `live`) → `OfflineBanner` on airplane → `/offline` → reconnect → update banner.

Tablet 768/820: teacher workspace rail `overflow-x-auto lg:w-44 lg:flex-col`, admin dashboard `auto-rows-[auto] md:auto-rows-[15rem]`.

---

## 8. Known Risks & Limitations

- ~~**Middleware `assetlinks.json` exclusion missing `.well-known`**~~ **FIXED**: `middleware.ts:104` matcher now includes `\.well-known` in the negative lookahead - verified `/.well-known/assetlinks.json`, `/manifest.json`, `/sw.js` are exempt from auth/role routing while `/student/*`, `/api/*` still match. No further middleware change needed.
- ~~**Vercel deployment pending**~~ **RESOLVED (2026-08-26)**: production is now `https://www.hierarchyclass.com/` - `/`, `/manifest.json`, `/sw.js`, `/.well-known/assetlinks.json` (correct fingerprint), icons and `/api/version` all return 200. The apex `hierarchyclass.com` has NO DNS record; only the `www` host exists, which is why the TWA host is `www.hierarchyclass.com`.
- **Physical device verification pending:** the new-domain APK was built and every automated check passes (host inside artifacts, signature ↔ assetlinks match), but the address-bar-free TWA experience must still be confirmed on a real Android phone (see Testing).
- **Payments in TWA (superseded while disabled):** when top-ups are re-enabled, `FlorinPurchaseModal` must open the external PayMongo checkout in a Custom Tab (fallbackType `customtabs` in the TWA manifest) and return to `start_url`; verify on a physical device with the PayMongo sandbox before going live (see [PAYMENTS.md](./PAYMENTS.md)).

---

## 9. Updating

- **Web/SW:** Bump code, `next build` → new `/_next/static` hashes → SW `install` caches new `hc-static-v1` (precache) → `activate` claims → `ServiceWorkerRegistration` shows “Update available → Reload” → `postMessage SKIP_WAITING` → `controllerchange` reload (no forced `skipWaiting` mid-grade-entry).
- **Android:** Bump `package.json:version` + `android/twa-manifest.json:appVersion`/`appVersionCode` (increase), rebuild `npx @bubblewrap/cli build` → new `app-release-bundle.aab` → Play Console upload → staged rollout. No native code change needed unless manifest `host`/`icons` change.

## 9b. Delivery formats - what's what

| Format | What it is | How users get it |
|---|---|---|
| Normal website | `https://www.hierarchyclass.com` in a browser tab; full UI, no install | Any browser |
| PWA (manifest + SW) | Same site with `manifest.json` + service worker: installable, offline shell, icons | Chrome desktop/Android shows install affordances |
| Installed PWA | PWA launched from home screen / desktop via WebAPK-lite or shortcut; standalone window | "Install app" from browser menu (`InstallPrompt.tsx` banner) |
| TWA APK | Android app wrapping the live site in Trusted Web Activity (no browser UI); fullscreen when Digital Asset Links verify; falls back to Custom Tabs otherwise | Sideload `app-release-signed.apk` now; later distribution |
| Play Store AAB | `app-release-bundle.aab` uploaded to Google Play → optimized device-specific downloads; Play may re-sign (Play App Signing) | Play Console upload after enrollment |

**A successful automated build ≠ successful physical device testing.** Nothing here proves on-device behavior: DAL verification (address bar removal), splash, safe areas, keyboard handling, push/notification delegation, or SW updates must be confirmed on a real Android phone over HTTPS.

---

## 10. References

- `public/manifest.json`, `public/sw.js`, `public/icons/*`, `app/offline/page.tsx`, `components/pwa/*`, `lib/useOnline.ts`, `components/ui/OfflineBanner.tsx`, `app/teacher/classroom/page.tsx` (online guard), `components/chat/MessengerView.tsx`, `components/student/FlorinPurchaseModal.tsx`, `lib/paymentsConfig.ts` (top-up switch), `middleware.ts`, `android/twa-manifest.json`, `public/.well-known/assetlinks.json`, `android/README.md`
