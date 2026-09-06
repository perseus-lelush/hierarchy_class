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
  version: "1.29.0",
  versionCode: 129000,
  packageName: "com.hierarchyclass.app",
  fileName: "hierarchy-class-v1.29.0.apk",
  /** Public path served from /public. */
  publicPath: "/downloads/hierarchy-class-v1.29.0.apk",
  sizeBytes: 7723953,
  /** SHA-256 of the exact distributed binary. */
  sha256: "6adf1e01957ddf7011452405a79311b9bcc56f142f56154a41ef7df17a0eedb4",
} as const;

export function apkDownloadUrl(): string {
  return APK_RELEASE.publicPath;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}