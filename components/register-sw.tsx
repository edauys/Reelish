"use client";

import { useEffect } from "react";
import { isCapacitorNative } from "@/lib/native";

/**
 * Registers a minimal service worker for PWA install prompts on supported browsers.
 * In the Capacitor native WebView we skip registration and clear any stale SWs so
 * fetches are not intercepted (avoids odd caching/auth issues while testing the shell).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (isCapacitorNative()) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          regs.forEach((r) => {
            void r.unregister();
          });
        })
        .catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
