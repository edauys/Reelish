import type { NextConfig } from "next";

/**
 * Reelish MVP — Next.js config
 *
 * PWA note: We ship a web app manifest in /public/manifest.json and a minimal
 * service worker for installability and offline shell. Full push/cache strategies
 * can be added later (e.g. with a Next.js PWA plugin).
 */
const nextConfig: NextConfig = {
  // Allow dev tools / iframe in development if needed
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
