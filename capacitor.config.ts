import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Standalone Android (Capacitor) configuration for Hierarchy Class.
 *
 * The frontend is the statically exported Next.js bundle in out/ (built by
 * `npm run export:android`), bundled into the APK and served from the local
 * asset server - the app UI never loads from hierarchyclass.com. Backend
 * traffic (Supabase, the /api bridge on the deployed site) goes over HTTPS
 * to the approved origins only.
 */
const config: CapacitorConfig = {
  appId: "com.hierarchyclass.app",
  appName: "Hierarchy Class (Beta)",
  webDir: "out",
  android: {
    // Keep modern WebView defaults; no mixed content ever.
    allowMixedContent: false,
  },
};

export default config;
