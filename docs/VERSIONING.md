# Versioning - Hierarchy Class

How the app version is stored, bumped, and consumed. The current release
version lives in **two files that must always say the same thing**:

| File | Role |
|---|---|
| `package.json` → `"version"` | Canonical release version (also the source for `package-lock.json`) |
| `lib/version.ts` → `APP_VERSION` | The user-visible constant imported by app code |

---

## 1. Where the version is consumed

- **`next.config.js`** inlines `NEXT_PUBLIC_APP_VERSION` into the client
  bundle: on Vercel it is the deployment's commit SHA, everywhere else it
  falls back to `v${package.json:version}`. The app-update system uses this
  to identify a build.
- **`/api/version`** serves the running version; the web PWA and the
  standalone Android app both compare it (numerically - MAJOR / MINOR /
  PATCH, never lexicographic) to decide whether to show the update banner.
- **Android native shell** (`android/app/build.gradle`) is bumped **only at
  a native release**: `versionName "X.Y.Z"` and
  `versionCode = major*10000 + minor*100 + patch` (e.g. `1.27.116` →
  `127116`). The `versionCode` must always increase for Play/APK installs.
  The web version in `package.json` is independent - see
  [`ANDROID.md`](./ANDROID.md). The distributed APK's exact version/size/
  SHA-256 is recorded in `lib/apkRelease.ts` and
  `public/android-version.json`.
- **Release commits** are titled `update vX.Y.Z: <one-line summary>` so the
  history reads as a changelog.

## 2. Bump rules (version styling)

The scheme is `MAJOR.MINOR.PATCH` (currently `1.Y.Z`):

| Segment | When to bump | Examples |
|---|---|---|
| **MAJOR** | Reserved for a breaking platform overhaul (architecture/data-model resets). None shipped yet. | - |
| **MINOR** | New user-facing features land. Reset PATCH to `0`. | `1.28.0 → 1.29.0` (group chat + voice calls), `1.29.0 → 1.30.0` (story editor, renames, signup fixes) |
| **PATCH** | Fixes, hardening, and cleanups with no new feature surface. | `1.27.115 → 1.27.116` |

A release commit should cover everything that ships together - feature work
plus the security/fix commits it includes - and the message body lists the
highlights (see `update v1.28.0` for the reference style).

## 3. Release checklist

1. Pick the new version per the table above.
2. Bump **all three** places so they can never drift:
   ```bash
   sed -i 's/"version": "OLD"/"version": "NEW"/' package.json
   sed -i 's/APP_VERSION = "OLD"/APP_VERSION = "NEW"/' lib/version.ts
   npm install --package-lock-only   # sync package-lock.json
   ```
3. Commit with the release message style:
   `update vX.Y.Z: <headline>, <secondary>, ...`
4. Ship a native build (only when needed): bump `android/app/build.gradle`
   `versionName`/`versionCode`, rebuild the APK, then update
   `lib/apkRelease.ts` + `public/android-version.json` with the audited
   size/SHA-256 - see [`ANDROID.md`](./ANDROID.md).
