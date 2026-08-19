/**
 * EXPERIMENTAL — gated public Instagram enrichment
 * ==================================================
 *
 * **Gate (server-only):** `REELISH_EXPERIMENTAL_INSTAGRAM_SOCIAL_FETCH=1`
 *
 * When enabled, attempts Meta’s **public oEmbed** endpoint for Instagram URLs (`api.instagram.com/oembed`).
 * - May return HTTP 401/403 or empty data — Instagram often restricts anonymous access; failure is expected and honest.
 * - Any text merged is labeled weak and unverified; never replaces multimodal evidence or honest fallbacks.
 *
 * **Default (flag off):** returns `undefined` — no network I/O.
 */
import type { UrlEnrichmentAttachment, UrlEnrichmentMerge } from "@/lib/url-enrichment/types";
import { detectSourceFromUrl } from "@/lib/extraction/url-meta";
import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import { safePublicHttpUrl } from "@/lib/url-enrichment/safe-public-url";

const OEMBED_TIMEOUT_MS = 6000;

export function isExperimentalInstagramSocialFetchEnabled(): boolean {
  return (
    process.env.REELISH_EXPERIMENTAL_INSTAGRAM_SOCIAL_FETCH === "1" ||
    process.env.REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL === "1"
  );
}

function stripHtmlish(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type OembedJson = {
  title?: string;
  author_name?: string;
  author_url?: string;
  provider_name?: string;
};

/**
 * Best-effort public oEmbed fetch. Returns undefined on any failure (network, non-OK, empty).
 */
async function fetchInstagramOembedBlock(href: string): Promise<string | undefined> {
  const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(href)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), OEMBED_TIMEOUT_MS);
  try {
    const res = await fetch(oembedUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "ReelishUrlEnrichment/1.0 (+https://reelish.app)",
      },
      signal: ac.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as OembedJson;
    const title = stripHtmlish(data.title ?? "");
    if (title.length < 12) return undefined;
    if (looksLikeIosInstagramLinkTeaser(title)) return undefined;
    const lines: string[] = [
      "[Instagram public oEmbed — weak/unverified; may be partial or stale; not a guaranteed caption]",
      title,
    ];
    if (data.author_name?.trim()) {
      lines.push(`Author (oEmbed): ${data.author_name.trim()}`);
    }
    return lines.join("\n");
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optional Instagram-specific public enrichment. Merged like other `UrlEnrichmentMerge` values.
 */
export async function experimentalInstagramSocialEnrichmentIfEnabled(
  urlRaw: string | undefined
): Promise<UrlEnrichmentMerge | undefined> {
  if (!isExperimentalInstagramSocialFetchEnabled()) return undefined;

  const href = safePublicHttpUrl(urlRaw);
  if (!href) return undefined;
  if (detectSourceFromUrl(href) !== "instagram") return undefined;

  const block = await fetchInstagramOembedBlock(href);
  if (!block?.trim()) return undefined;

  const attachment: UrlEnrichmentAttachment = {
    providerId: "experimental_instagram_oembed",
    tier: "experimental_instagram_oembed",
    fetchedAt: new Date().toISOString(),
    sourceLabel: "URL enrichment (Instagram public oEmbed — experimental)",
    warnings: [
      "oEmbed text is public metadata only — may omit ingredients, may be truncated, and can fail with HTTP 401/403 from Instagram.",
    ],
    contributedToModelText: true,
  };

  return { attachment, supplementPlain: block };
}

/**
 * Honest UI/server hint when we have an Instagram URL but only teaser-like share text.
 */
export function linkFirstInstagramEnrichmentContextNote(
  urlRaw: string | undefined,
  sharedCaption: string | undefined
): string | undefined {
  const href = safePublicHttpUrl(urlRaw);
  if (!href || detectSourceFromUrl(href) !== "instagram") return undefined;
  if (!looksLikeIosInstagramLinkTeaser(sharedCaption ?? "")) return undefined;
  if (isExperimentalInstagramSocialFetchEnabled()) {
    return "Experimental Instagram oEmbed is enabled: Reelish will try public oEmbed when the share payload is only a preview line. If Instagram blocks the request, only shared media (transcript/OCR) or pasted text can fill the gap.";
  }
  return "Set REELISH_EXPERIMENTAL_INSTAGRAM_SOCIAL_FETCH=1 on the server to try weak public oEmbed text when the share line is only a preview; full captions often still require shared video/image or paste.";
}
