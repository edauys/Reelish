import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor shell for Reelish (Next.js stays the source of truth).
 *
 * - `webDir` is a minimal stub copied into native projects; the WebView normally loads
 *   `server.url` (your deployed app or local dev URL via CAPACITOR_SERVER_URL).
 * - Do not point webDir at `.next/` — Capacitor does not run the Next dev server.
 *
 * Default dev URL targets the **host Mac from the iOS Simulator** (`127.0.0.1` maps to the host).
 * For a **physical device**, set `CAPACITOR_SERVER_URL` to your Mac’s LAN IP (see docs/CAPACITOR.md).
 * Avoid bare `localhost` in synced config — it often fails in WKWebView/simulator setups.
 *
 * @see docs/CAPACITOR.md
 */
const DEFAULT_IOS_SIM_DEV_SERVER = "http://127.0.0.1:3000";
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || DEFAULT_IOS_SIM_DEV_SERVER;

const isHttpDev = Boolean(serverUrl.startsWith("http:"));

const config: CapacitorConfig = {
  appId: "app.reelish",
  appName: "Reelish",
  webDir: "capacitor-www",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: isHttpDev,
        },
      }
    : {}),
  ios: {
    contentInset: "automatic",
  },
  android: {
    // LAN `http://` dev server: cleartext + mixed content rules align with `server.cleartext`.
    allowMixedContent: isHttpDev,
  },
};

export default config;
