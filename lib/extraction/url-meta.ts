import type { RecipeSource } from "@/types/recipe";

export function detectSourceFromUrl(url: string): RecipeSource {
  const u = url.toLowerCase();
  if (u.includes("instagram.com") || u.includes("instagr.am")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("facebook.com") || u.includes("fb.watch")) return "facebook";
  return "unknown";
}

/** Best-effort handle from known social URL shapes (no network). */
export function inferCreatorHandleFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.split("/").filter(Boolean);

    if (host.includes("tiktok.com")) {
      const at = path.find((p) => p.startsWith("@"));
      if (at) return at;
    }

    if (host.includes("instagram.com") || host.includes("instagr.am")) {
      const skip = new Set(["reel", "reels", "p", "stories", "tv", "explore", "accounts"]);
      const first = path[0];
      if (first && !skip.has(first) && !first.startsWith("p")) return `@${first}`;
    }

    if (host.includes("facebook.com")) {
      return null;
    }
  } catch {
    /* invalid URL */
  }
  return null;
}
