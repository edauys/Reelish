/* eslint-disable no-restricted-globals */
/**
 * Minimal service worker — enables PWA install on many Chromium browsers.
 * For production, consider Workbox via next-pwa or similar for caching strategies.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {});
