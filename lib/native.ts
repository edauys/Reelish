import { Capacitor } from "@capacitor/core";

/**
 * True when JS runs inside the Capacitor native WebView (iOS/Android shell).
 * Always false on SSR and in normal desktop/mobile browsers.
 */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
