/**
 * Optional HEAD-follow to normalize vm/t short links → host URL for canonicalization + OG fetch targets.
 * Gated behind REELISH_RETRIEVAL_RESOLVE_SHORT_URLS=1 — TikTok occasionally blocks automated requests.
 */

const SHORT_RE = /\b(?:vm\.tiktok\.com|(?:www\.)?tiktok\.com\/t\/)\b/i;

export function maybeShortSocialUrl(raw: string | undefined): boolean {
  return Boolean(raw && SHORT_RE.test(raw));
}

export async function resolveShortSocialUrlHref(raw: string): Promise<string | null> {
  if (process.env.REELISH_RETRIEVAL_RESOLVE_SHORT_URLS !== "1") return null;
  if (!maybeShortSocialUrl(raw)) return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    const res = await fetch(raw.trim(), {
      method: "HEAD",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept: "*/*",
        "User-Agent": "ReelishRetrievalResolve/1.0 (+https://reelish.app)",
      },
    });
    clearTimeout(t);
    const url = res.url;
    try {
      new URL(url);
      return url;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}
