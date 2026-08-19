/**
 * EXPERIMENTAL — `REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL=1`
 *
 * Instagram / TikTok: public oEmbed, then bounded partial HTML parse (OG, JSON-LD, script captions).
 */
import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import { safePublicHttpUrl } from "@/lib/url-enrichment/safe-public-url";
import {
  looksCaptionLikeSupplement,
  recoverSocialEvidenceFromUrl,
} from "@/lib/url-enrichment/social-html-evidence";
import type { RetrievalDiagnosticsSnapshot } from "@/lib/retrieval/types";
import type { UrlEnrichmentAttachment, UrlEnrichmentMerge } from "@/lib/url-enrichment/types";
import type { RecipeSource } from "@/types/recipe";

export function isExperimentalSocialRetrievalEnabled(): boolean {
  return process.env.REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL === "1";
}

function stripHtmlish(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type OembedJson = { title?: string; author_name?: string };

async function fetchOembedBlock(oembedEndpoint: string, label: string): Promise<string | undefined> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 6000);
  try {
    const res = await fetch(oembedEndpoint, {
      headers: { Accept: "application/json", "User-Agent": "ReelishSocialRetrieval/1.0" },
      signal: ac.signal,
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as OembedJson;
    const title = stripHtmlish(data.title ?? "");
    if (title.length < 12 || looksLikeIosInstagramLinkTeaser(title)) return undefined;
    const lines = [`[${label} — weak/unverified public metadata]`, title];
    if (data.author_name?.trim()) lines.push(`Author: ${data.author_name.trim()}`);
    return lines.join("\n");
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export type ExperimentalSocialRetrievalResult = {
  supplementPlain: string;
  merge?: UrlEnrichmentMerge;
  diagnostic: RetrievalDiagnosticsSnapshot;
};

export async function runExperimentalSocialRetrieval(
  urlRaw: string,
  platform: RecipeSource
): Promise<ExperimentalSocialRetrievalResult> {
  const href = safePublicHttpUrl(urlRaw);
  const baseDiag: RetrievalDiagnosticsSnapshot = {
    providerId: "experimental_social_retrieval",
    safety: "experimental",
    attempted: true,
    succeeded: false,
    message: "empty",
    outcome: "empty",
  };

  if (!isExperimentalSocialRetrievalEnabled()) {
    return {
      supplementPlain: "",
      diagnostic: {
        ...baseDiag,
        attempted: false,
        outcome: "skipped",
        message: "disabled_by_env_set_REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL=1",
      },
    };
  }

  if (!href || (platform !== "instagram" && platform !== "tiktok")) {
    return {
      supplementPlain: "",
      diagnostic: {
        ...baseDiag,
        attempted: false,
        outcome: "skipped",
        message: "unsupported_platform_or_url",
      },
    };
  }

  const parts: string[] = [];
  const warnings: string[] = [
    "Experimental social retrieval — public oEmbed + bounded HTML parse; may be blocked or partial.",
  ];

  if (platform === "instagram") {
    const oembed = await fetchOembedBlock(
      `https://api.instagram.com/oembed?url=${encodeURIComponent(href)}`,
      "Instagram public oEmbed"
    );
    if (oembed) parts.push(oembed);
    else warnings.push("Instagram oEmbed: no text (often 401/403).");
  }

  if (platform === "tiktok") {
    const oembed = await fetchOembedBlock(
      `https://www.tiktok.com/oembed?url=${encodeURIComponent(href)}`,
      "TikTok public oEmbed"
    );
    if (oembed) parts.push(oembed);
    else warnings.push("TikTok oEmbed: no text.");
  }

  const htmlRecovery = await recoverSocialEvidenceFromUrl(href, platform, "experimental_social_retrieval");
  if (htmlRecovery.supplementPlain.trim()) {
    parts.push(htmlRecovery.supplementPlain.trim());
  }

  const supplementPlain = [...new Set(parts)].join("\n\n").trim();

  if (!supplementPlain) {
    return {
      supplementPlain: "",
      diagnostic: {
        ...htmlRecovery.diagnostic,
        ...baseDiag,
        attempted: true,
        succeeded: false,
        outcome: htmlRecovery.diagnostic.outcome ?? (warnings.some((w) => /401|403/i.test(w)) ? "blocked" : "empty"),
        message: htmlRecovery.diagnostic.message ?? "oembed_and_html_empty",
        warn: warnings.join(" "),
        bytesRead: htmlRecovery.diagnostic.bytesRead,
        htmlTruncated: htmlRecovery.diagnostic.htmlTruncated,
        partialHtmlParsed: htmlRecovery.diagnostic.partialHtmlParsed,
        supplementFields: htmlRecovery.diagnostic.supplementFields,
      },
    };
  }

  const captionLike = looksCaptionLikeSupplement(supplementPlain) || htmlRecovery.parsed?.captionLike === true;

  const attachment: UrlEnrichmentAttachment = {
    providerId: platform === "instagram" ? "experimental_instagram_oembed" : "experimental_page_text",
    tier: platform === "instagram" ? "experimental_instagram_oembed" : "experimental_page_text",
    fetchedAt: new Date().toISOString(),
    sourceLabel: "Experimental social retrieval (oEmbed + bounded HTML)",
    warnings,
    contributedToModelText: true,
    pageTitle: htmlRecovery.parsed?.title,
    pageDescription: htmlRecovery.parsed?.description,
  };

  return {
    supplementPlain,
    merge: { attachment, supplementPlain },
    diagnostic: {
      ...baseDiag,
      succeeded: true,
      outcome: "success",
      message: `recovered_${supplementPlain.length}_chars caption_like=${captionLike} ${htmlRecovery.diagnostic.message ?? ""}`.trim(),
      warn: warnings[0],
      bytesRead: htmlRecovery.diagnostic.bytesRead,
      htmlTruncated: htmlRecovery.diagnostic.htmlTruncated,
      partialHtmlParsed: htmlRecovery.diagnostic.partialHtmlParsed ?? true,
      supplementFields: [
        ...(parts.some((p) => /oEmbed/i.test(p)) ? ["oembed:title"] : []),
        ...(htmlRecovery.diagnostic.supplementFields ?? []),
      ],
    },
  };
}
