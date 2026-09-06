/**
 * Metadata for the officially distributed Android APK.
 *
 * The binary itself lives at `public/downloads/<fileName>` so that after
 * deployment it is served directly from the production domain:
 *   https://www.hierarchyclass.com/downloads/<fileName>
 *
 * Every value here must match the REAL audited artifact.
 * Update after building the release APK with:
 *   cd android && ./gradlew assembleRelease
 *   sha256sum app/build/outputs/apk/release/app-release-unsigned.apk
 *   ls -la app/build/outputs/apk/release/app-release-unsigned.apk
 */

export const APK_RELEASE = {
  version: "1.28.0",
  versionCode: 128000,
  packageName: "com.hierarchyclass.app",
  fileName: "hierarchy-class-v1.28.0.apk",
  /** Public path served from /public. */
  publicPath: "/downloads/hierarchy-class-v1.28.0.apk",
  sizeBytes: 7693760,
  /** SHA-256 of the exact distributed binary. */
  sha256: "c35c59d0188d852544d2279eb799aab35c9e8dd13429920131d0b5622abfb9fe",
} as const;

export function apkDownloadUrl(): string {
  return APK_RELEASE.publicPath;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}