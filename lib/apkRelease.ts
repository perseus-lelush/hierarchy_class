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
  version: "1.30.3",
  versionCode: 130003,
  packageName: "com.hierarchyclass.app",
  fileName: "hierarchy-class-v1.30.3.apk",
  /** Public path served from /public. */
  publicPath: "/downloads/hierarchy-class-v1.30.3.apk",
  sizeBytes: 7729017,
  /** SHA-256 of the exact distributed binary. */
  sha256: "dadf542617b2fe9910ef8a76673edcfe6f61edafc0bc062a92741fb76f1ccc67",
} as const;

export function apkDownloadUrl(): string {
  return APK_RELEASE.publicPath;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}