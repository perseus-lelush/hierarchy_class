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
  version: "1.31.1",
  versionCode: 131001,
  packageName: "com.hierarchyclass.app",
  fileName: "hierarchy-class-v1.31.1.apk",
  /** Public path served from /public. */
  publicPath: "/downloads/hierarchy-class-v1.31.1.apk",
  sizeBytes: 7730081,
  /** SHA-256 of the exact distributed binary. */
  sha256: "f80b15d6e863f608cab81e20b6a933b35f084017df5e0d7a7a74ad9c89c734ab",
} as const;

export function apkDownloadUrl(): string {
  return APK_RELEASE.publicPath;
}

export function formatApkSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}