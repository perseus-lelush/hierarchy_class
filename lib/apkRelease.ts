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
  version: "1.30.1",
  versionCode: 130001,
  packageName: "com.hierarchyclass.app",
  fileName: "hierarchy-class-v1.30.1.apk",
  /** Public path served from /public. */
  publicPath: "/downloads/hierarchy-class-v1.30.1.apk",
  sizeBytes: 7728285,
  /** SHA-256 of the exact distributed binary. */
  sha256: "9a431685e3653183139ed3cda8505b63c8e8baf2837b0e1b3bd4ab67ef05e9bd",
} as const;

export function apkDownloadUrl(): string {
  return APK_RELEASE.publicPath;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}