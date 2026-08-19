/**
 * Parse bounded (possibly partial) Instagram/TikTok HTML for caption-like public evidence.
 */
import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import { fetchBoundedHtml, socialRetrievalMaxBytes } from "@/lib/url-enrichment/bounded-html-fetch";
import { extractOpenGraphAndMeta } from "@/lib/url-enrichment/parse-html-meta";
import type { RetrievalDiagnosticsSnapshot } from "@/lib/retrieval/types";
import type { UrlEnrichmentAttachment, UrlEnrichmentMerge } from "@/lib/url-enrichment/types";
import type { RecipeSource } from "@/types/recipe";

export type SocialHtmlField =
  | "og:title"
  | "og:description"
  | "twitter:title"
  | "twitter:description"
  | "meta:description"
  | "json-ld"
  | "script:caption"
  | "script:desc";

export type ParsedSocialHtmlEvidence = {
  fieldsUsed: SocialHtmlField[];
  title?: string;
  description?: string;
  embeddedCaptions: string[];
  captionLike: boolean;
  partialHtmlParsed: boolean;
  bytesRead: number;
  htmlTruncated: boolean;
};

function stripHtmlish(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeJsonStringLiteral(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function collectDescriptionStrings(node: unknown, out: string[], depth = 0): void {
  if (depth > 8 || node == null) return;
  if (typeof node === "string") {
    const t = stripHtmlish(node);
    if (t.length >= 24) out.push(t);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectDescriptionStrings(item, out, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    for (const key of ["caption", "description", "text", "title", "accessibility_caption"]) {
      if (typeof o[key] === "string") {
        const t = stripHtmlish(o[key] as string);
        if (t.length >= 24) out.push(t);
      }
    }
    for (const v of Object.values(o)) collectDescriptionStrings(v, out, depth + 1);
  }
}

export function extractEmbeddedCaptionCandidates(html: string): string[] {
  const candidates: string[] = [];

  const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRe.exec(html))) {
    try {
      const json = JSON.parse(m[1]!) as unknown;
      collectDescriptionStrings(json, candidates);
    } catch {
      /* skip malformed */
    }
  }

  const scriptCaption =
    html.match(/"caption"\s*:\s*"((?:\\.|[^"\\])+)"/)?.[1] ??
    html.match(/"edge_media_to_caption"[\s\S]{0,800}?"text"\s*:\s*"((?:\\.|[^"\\])+)"/)?.[1];
  if (scriptCaption) {
    const t = stripHtmlish(decodeJsonStringLiteral(scriptCaption));
    if (t.length >= 24) candidates.push(t);
  }

  const descQuoted = html.match(/"desc"\s*:\s*"((?:\\.|[^"\\])+)"/)?.[1];
  if (descQuoted) {
    const t = stripHtmlish(decodeJsonStringLiteral(descQuoted));
    if (t.length >= 24) candidates.push(t);
  }

  return [...new Set(candidates)].slice(0, 6);
}

function firstMeta(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim();
}

/** OG + twitter + meta description from partial HTML (works on truncated buffers). */
export function parseSocialHtmlEvidence(html: string, opts?: { bytesRead?: number; truncated?: boolean }): ParsedSocialHtmlEvidence {
  const og = extractOpenGraphAndMeta(html);
  const fieldsUsed: SocialHtmlField[] = [];

  const twitterTitle =
    firstMeta(html, /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i) ??
    firstMeta(html, /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:title["']/i);
  const twitterDesc =
    firstMeta(html, /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i) ??
    firstMeta(html, /<meta\s+content=["']([^"']+)["']\s+name=["']twitter:description["']/i);

  if (og.title?.trim()) fieldsUsed.push("og:title");
  if (og.description?.trim()) fieldsUsed.push("og:description");
  if (twitterTitle) fieldsUsed.push("twitter:title");
  if (twitterDesc) fieldsUsed.push("twitter:description");
  if (!og.description?.trim() && firstMeta(html, /<meta\s+name=["']description["']/i)) {
    fieldsUsed.push("meta:description");
  }

  const title = og.title?.trim() || twitterTitle;
  const description = og.description?.trim() || twitterDesc;

  const embeddedRaw = extractEmbeddedCaptionCandidates(html);
  const embeddedCaptions = embeddedRaw.filter((c) => !looksLikeIosInstagramLinkTeaser(c));
  if (embeddedCaptions.length > 0) {
    if (html.includes('"caption"')) fieldsUsed.push("script:caption");
    else fieldsUsed.push("script:desc");
  }
  for (const _ of embeddedRaw) {
    if (!fieldsUsed.includes("json-ld") && /<script[^>]*type=["']application\/ld\+json/i.test(html)) {
      fieldsUsed.push("json-ld");
      break;
    }
  }

  const captionLike =
    embeddedCaptions.some((c) => /\bIngredients?\b|\bMalzeme\b|\badet\b|\bsteps?\b/i.test(c)) ||
    Boolean(description && description.length > 80 && !looksLikeIosInstagramLinkTeaser(description));

  return {
    fieldsUsed: [...new Set(fieldsUsed)],
    title,
    description,
    embeddedCaptions,
    captionLike,
    partialHtmlParsed: html.length > 0,
    bytesRead: opts?.bytesRead ?? html.length,
    htmlTruncated: opts?.truncated === true,
  };
}

export function buildSupplementFromSocialEvidence(
  parsed: ParsedSocialHtmlEvidence,
  label: string
): string {
  const parts: string[] = [];

  if (parsed.title || parsed.description) {
    const block = [
      `[${label} — page metadata${parsed.htmlTruncated ? "; partial HTML" : ""}]`,
      parsed.title ? `Title: ${parsed.title}` : null,
      parsed.description ? `Description: ${parsed.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    if (block.length > 30) parts.push(block);
  }

  for (const cap of parsed.embeddedCaptions) {
    parts.push(`[${label} — embedded caption hint]\n${cap}`);
  }

  return parts.join("\n\n").trim();
}

export function looksCaptionLikeSupplement(plain: string): boolean {
  const lower = plain.toLowerCase();
  return (
    /\[.*embedded caption/i.test(lower) ||
    /\[instagram public oembed/i.test(lower) ||
    /\bIngredients?\b|\bMalzeme\b|\badet\b|\bgram\b|\bsteps?\b/i.test(plain)
  );
}

export type SocialHtmlRecoveryResult = {
  supplementPlain: string;
  merge?: UrlEnrichmentMerge;
  parsed?: ParsedSocialHtmlEvidence;
  diagnostic: RetrievalDiagnosticsSnapshot;
};

export async function recoverSocialEvidenceFromUrl(
  href: string,
  platform: RecipeSource,
  providerId: string
): Promise<SocialHtmlRecoveryResult> {
  const baseDiag: RetrievalDiagnosticsSnapshot = {
    providerId,
    safety: providerId === "experimental_social_retrieval" ? "experimental" : "public",
    attempted: true,
    succeeded: false,
    message: "empty",
  };

  const fetched = await fetchBoundedHtml(href, {
    maxBytes: socialRetrievalMaxBytes(),
    userAgent: "ReelishSocialRetrieval/1.0 (+https://reelish.app)",
  });

  if (!fetched.ok) {
    const partial = fetched.html?.trim();
    if (partial) {
      const parsed = parseSocialHtmlEvidence(partial, {
        bytesRead: fetched.bytesRead ?? partial.length,
        truncated: fetched.truncated === true,
      });
      const supplementPlain = buildSupplementFromSocialEvidence(parsed, "Social HTML recovery (partial)");
      if (supplementPlain) {
        return successResult(supplementPlain, parsed, platform, providerId, baseDiag);
      }
    }
    return {
      supplementPlain: "",
      diagnostic: {
        ...baseDiag,
        outcome: /401|403/i.test(fetched.reason) ? "blocked" : "failure",
        message: fetched.reason,
        bytesRead: fetched.bytesRead,
      },
    };
  }

  const parsed = parseSocialHtmlEvidence(fetched.html, {
    bytesRead: fetched.bytesRead,
    truncated: fetched.truncated,
  });

  const label =
    platform === "instagram"
      ? "Instagram public HTML"
      : platform === "tiktok"
        ? "TikTok public HTML"
        : "Social public HTML";

  const supplementPlain = buildSupplementFromSocialEvidence(parsed, label);

  if (!supplementPlain) {
    return {
      supplementPlain: "",
      parsed,
      diagnostic: {
        ...baseDiag,
        outcome: "empty",
        message: `parsed_no_usable_fields bytes=${fetched.bytesRead} truncated=${fetched.truncated}`,
        bytesRead: fetched.bytesRead,
        htmlTruncated: fetched.truncated,
        partialHtmlParsed: parsed.partialHtmlParsed,
        supplementFields: parsed.fieldsUsed,
      },
    };
  }

  return successResult(supplementPlain, parsed, platform, providerId, baseDiag, fetched.truncated);
}

function successResult(
  supplementPlain: string,
  parsed: ParsedSocialHtmlEvidence,
  platform: RecipeSource,
  providerId: string,
  baseDiag: RetrievalDiagnosticsSnapshot,
  truncated?: boolean
): SocialHtmlRecoveryResult {
  const attachment: UrlEnrichmentAttachment = {
    providerId: platform === "instagram" ? "experimental_instagram_oembed" : "official_metadata",
    tier: platform === "instagram" ? "experimental_instagram_oembed" : "official_metadata",
    fetchedAt: new Date().toISOString(),
    sourceLabel: `${providerId} (bounded HTML)`,
    warnings: truncated
      ? [
          "HTML response was truncated to the configured byte limit; metadata was parsed from the partial buffer.",
        ]
      : [],
    contributedToModelText: true,
    pageTitle: parsed.title,
    pageDescription: parsed.description,
  };

  return {
    supplementPlain,
    merge: { attachment, supplementPlain },
    parsed,
    diagnostic: {
      ...baseDiag,
      succeeded: true,
      outcome: "success",
      message: `recovered_${supplementPlain.length}_chars fields=${parsed.fieldsUsed.join(",")} caption_like=${parsed.captionLike}`,
      bytesRead: parsed.bytesRead,
      htmlTruncated: parsed.htmlTruncated,
      partialHtmlParsed: true,
      supplementFields: parsed.fieldsUsed,
    },
  };
}
