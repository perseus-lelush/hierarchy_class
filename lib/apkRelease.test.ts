import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APK_RELEASE, apkDownloadUrl, formatApkSize } from "./apkRelease.ts";

// Read (not import) package.json - avoids JSON import-attribute requirements.
const pkgVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8")
).version as string;

test("APK release metadata matches the distributed artifact contract", () => {
  assert.equal(APK_RELEASE.packageName, "com.hierarchyclass.app");
  const num = (v: string) => v.split(".").map(Number);
  const [aM, am, ap] = num(APK_RELEASE.version);
  const [pM, pm, pp] = num(pkgVersion);
  const cmp = aM - pM || am - pm || ap - pp;
  assert.ok(
    cmp <= 0,
    `APK version ${APK_RELEASE.version} must not be newer than package.json ${pkgVersion}`
  );
  assert.equal(APK_RELEASE.versionCode, 131000);
  assert.equal(APK_RELEASE.sizeBytes, 7729685);
});

test("download URL is versioned and served from the public downloads path", () => {
  assert.equal(apkDownloadUrl(), `/downloads/hierarchy-class-v1.31.0.apk`);
  assert.match(apkDownloadUrl(), /^\/downloads\/hierarchy-class-v\d+\.\d+\.\d+\.apk$/);
  assert.equal(APK_RELEASE.fileName, apkDownloadUrl().split("/").pop());
});

test("checksum is a well-formed SHA-256 hex digest", () => {
  assert.match(APK_RELEASE.sha256, /^[a-f0-9]{64}$/);
});

test("size formatter renders MB with one decimal", () => {
  assert.equal(formatApkSize(APK_RELEASE.sizeBytes), "7.4 MB");
});
