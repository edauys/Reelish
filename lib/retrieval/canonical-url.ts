/**
 * Canonical keys for retrieval cache correlation — deterministic, stable across share variants.
 * No scraping; URL normalization only.
 */

import type { RecipeSource } from "@/types/recipe";
import { detectSourceFromUrl } from "@/lib/extraction/url-meta";

export type CanonicalResolution = {
  canonicalKey: string | null;
  canonicalUrl: string | null;
  platform: RecipeSource;
  /** TikTok/vm short-link resolution when enabled (may equal original URL). */
  normalizedFromRedirect?: boolean;
};

const IG_HOST_RE = /^((www\.)?instagram\.com|instagr\.am)$/i;

function canonicalInstagramHref(u: URL): string {
  const path = u.pathname.replace(/\/+$/, "");
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return `https://${u.hostname.toLowerCase()}/`;
  if (segs[0] === "reel" || segs[0] === "reels") {
    const id = segs[1];
    return id ? `https://www.instagram.com/reel/${id}/` : `https://www.instagram.com/${segs.join("/")}/`;
  }
  if (segs[0] === "p") {
    const id = segs[1];
    return id ? `https://www.instagram.com/p/${id}/` : `https://www.instagram.com/${segs.join("/")}/`;
  }
  if (segs[0] === "tv") {
    const id = segs[1];
    return id ? `https://www.instagram.com/tv/${id}/` : `https://www.instagram.com/${segs.join("/")}/`;
  }
  return `https://www.instagram.com/${segs.slice(0, 4).join("/")}/`;
}

function canonicalTikTokHref(u: URL): string {
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  const path = u.pathname.replace(/\/+$/, "") || "";
  /* vm.tiktok.com and t.tiktok.com — keep host + path; redirect resolver may tighten later */
  return `https://${host}${path}/`.replace(/\/{2,}$/, "/").replace(/^https:\/\/([^/]+)\/$/, "https://$1/");
}

/**
 * Produce a lowercase stable cache key and display canonical URL string.
 */
export function canonicalSourceFromUrl(raw: string | undefined | null): CanonicalResolution {
  if (!raw?.trim()) {
    return { canonicalKey: null, canonicalUrl: null, platform: "unknown" };
  }
  let href = raw.trim();
  try {
    const u = new URL(href);
    const plat = detectSourceFromUrl(href);
    if (IG_HOST_RE.test(u.hostname)) {
      const can = canonicalInstagramHref(u);
      return { canonicalKey: can.toLowerCase(), canonicalUrl: can, platform: plat };
    }
    if (u.hostname.includes("tiktok.com")) {
      const can = canonicalTikTokHref(u);
      return { canonicalKey: can.toLowerCase(), canonicalUrl: can, platform: plat };
    }
    const strip = `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    const key = strip.toLowerCase();
    return { canonicalKey: key, canonicalUrl: href, platform: plat };
  } catch {
    return { canonicalKey: href.toLowerCase().slice(0, 2048), canonicalUrl: href, platform: detectSourceFromUrl(href) };
  }
}
