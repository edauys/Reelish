import type { UrlEnrichmentAttachment, UrlEnrichmentMerge, UrlEnrichmentProviderId } from "@/lib/url-enrichment/types";
import { detectSourceFromUrl } from "@/lib/extraction/url-meta";
import { experimentalInstagramSocialEnrichmentIfEnabled } from "@/lib/url-enrichment/experimental-instagram-social";
import {
  fetchBoundedHtml,
  genericUrlEnrichmentMaxBytes,
  socialRetrievalMaxBytes,
} from "@/lib/url-enrichment/bounded-html-fetch";
import { extractOpenGraphAndMeta, roughVisibleTextSample } from "@/lib/url-enrichment/parse-html-meta";
import {
  buildSupplementFromSocialEvidence,
  parseSocialHtmlEvidence,
} from "@/lib/url-enrichment/social-html-evidence";
import { safePublicHttpUrl } from "@/lib/url-enrichment/safe-public-url";

const MAX_EXPERIMENTAL_CHARS = 6_000;
const FETCH_TIMEOUT_MS = 8_000;

function tierFromEnv(): "none" | "official" | "experimental" {
  const t = process.env.REELISH_URL_ENRICHMENT_TIER?.trim().toLowerCase();
  if (t === "none" || t === "off" || t === "disabled" || t === "noop") return "none";
  if (t === "experimental") return "experimental";
  return "official";
}

function maxBytesForUrl(url: string): number {
  const p = detectSourceFromUrl(url);
  return p === "instagram" || p === "tiktok" ? socialRetrievalMaxBytes() : genericUrlEnrichmentMaxBytes();
}

function buildWeakBlock(official: { title?: string; description?: string }, truncated?: boolean): string {
  const lines: string[] = [
    `[Linked page metadata — weak evidence; may not be the full recipe${truncated ? "; partial HTML buffer" : ""}]`,
  ];
  if (official.title?.trim()) lines.push(`Title: ${official.title.trim()}`);
  if (official.description?.trim()) lines.push(`Description: ${official.description.trim()}`);
  return lines.join("\n");
}

/**
 * Optional URL enrichment before extraction. Official tier: OG/meta from bounded HTML (partial OK).
 */
export async function resolveUrlEnrichment(urlRaw: string | undefined): Promise<UrlEnrichmentMerge | undefined> {
  const tier = tierFromEnv();
  if (tier === "none") {
    return undefined;
  }

  const url = safePublicHttpUrl(urlRaw);
  if (!url) return undefined;

  const platform = detectSourceFromUrl(url);
  const isSocial = platform === "instagram" || platform === "tiktok";

  const fetched = await fetchBoundedHtml(url, {
    maxBytes: maxBytesForUrl(url),
    timeoutMs: FETCH_TIMEOUT_MS,
    userAgent: "ReelishUrlEnrichment/1.0 (+https://reelish.app)",
  });

  if (!fetched.ok) {
    if (platform === "instagram") {
      const igOnly = await experimentalInstagramSocialEnrichmentIfEnabled(urlRaw);
      if (igOnly?.supplementPlain.trim()) {
        return igOnly;
      }
    }
    const attachment: UrlEnrichmentAttachment = {
      providerId: "official_metadata",
      tier: "none",
      fetchedAt: new Date().toISOString(),
      sourceLabel: "URL enrichment (failed)",
      warnings: [`Could not read public page metadata: ${fetched.reason}.`],
      contributedToModelText: false,
    };
    return { attachment, supplementPlain: "" };
  }

  let meta = extractOpenGraphAndMeta(fetched.html);
  let supplement = "";
  let fieldsNote = "";

  if (isSocial) {
    const parsed = parseSocialHtmlEvidence(fetched.html, {
      bytesRead: fetched.bytesRead,
      truncated: fetched.truncated,
    });
    const socialBlock = buildSupplementFromSocialEvidence(parsed, "Public HTTP retrieval");
    if (socialBlock) {
      supplement = socialBlock;
      fieldsNote = parsed.fieldsUsed.join(",");
      meta = { title: parsed.title ?? meta.title, description: parsed.description ?? meta.description };
    }
  }

  const hasOfficial = Boolean(meta.title?.trim() || meta.description?.trim());

  let experimentalSample: string | undefined;
  let experimentalWarn: string | undefined;
  const experimentalAllowed =
    process.env.REELISH_EXPERIMENTAL_URL_FETCH === "1" &&
    (tier === "experimental" || process.env.REELISH_URL_ENRICHMENT_EXPERIMENTAL === "1");

  if (experimentalAllowed) {
    experimentalSample = roughVisibleTextSample(fetched.html, MAX_EXPERIMENTAL_CHARS);
    if (experimentalSample.length < 40) {
      experimentalSample = undefined;
      experimentalWarn = "Experimental fetch returned very little visible text.";
    } else {
      experimentalWarn =
        "Experimental page sample may include navigation, ads, or unrelated text — treat as very weak evidence.";
    }
  }

  const warnings: string[] = [];
  if (fetched.truncated) {
    warnings.push(
      `HTML truncated after ${fetched.bytesRead} bytes (limit ${maxBytesForUrl(url)}); parsed available head/metadata only.`
    );
  }
  if (hasOfficial || supplement) {
    warnings.push(
      "Public page metadata only (e.g. title/description). This is not verified recipe content — Reelish stays conservative in extraction."
    );
  } else {
    warnings.push("No usable Open Graph / meta description found in the bounded HTML buffer.");
  }
  if (experimentalWarn) warnings.push(experimentalWarn);

  let providerId: UrlEnrichmentProviderId = "noop";
  let tierLabel: UrlEnrichmentAttachment["tier"] = "none";

  if (!supplement && hasOfficial) {
    providerId = "official_metadata";
    tierLabel = "official_metadata";
    supplement = buildWeakBlock(meta, fetched.truncated);
  }

  if (experimentalSample?.trim()) {
    providerId = "experimental_page_text";
    tierLabel = "experimental_page_text";
    const block = `[Experimental visible text sample — very weak]\n${experimentalSample}`;
    supplement = supplement ? `${supplement}\n\n${block}` : block;
  }

  const contributed = Boolean(supplement.trim());

  if (!contributed) {
    const igOnly = await experimentalInstagramSocialEnrichmentIfEnabled(urlRaw);
    if (igOnly?.supplementPlain.trim()) {
      return igOnly;
    }
    const attachment: UrlEnrichmentAttachment = {
      providerId: "noop",
      tier: "none",
      fetchedAt: new Date().toISOString(),
      sourceLabel: "URL enrichment (no weak text added)",
      pageTitle: meta.title,
      pageDescription: meta.description,
      warnings: [
        ...warnings,
        fieldsNote ? `Parsed fields (empty supplement): ${fieldsNote}; bytes=${fetched.bytesRead}` : `bytes_read=${fetched.bytesRead}`,
      ],
      contributedToModelText: false,
    };
    return { attachment, supplementPlain: "" };
  }

  const attachment: UrlEnrichmentAttachment = {
    providerId,
    tier: tierLabel,
    fetchedAt: new Date().toISOString(),
    sourceLabel:
      providerId === "experimental_page_text"
        ? "URL enrichment (official metadata + experimental sample)"
        : isSocial
          ? `URL enrichment (bounded social HTML${fetched.truncated ? ", partial" : ""})`
          : "URL enrichment (Open Graph / meta)",
    pageTitle: meta.title,
    pageDescription: meta.description,
    experimentalPlainSample: experimentalSample,
    warnings: fieldsNote ? [...warnings, `fields_used=${fieldsNote}`] : warnings,
    contributedToModelText: true,
  };

  const base: UrlEnrichmentMerge = { attachment, supplementPlain: supplement };

  const igAugment = await experimentalInstagramSocialEnrichmentIfEnabled(urlRaw);
  if (igAugment?.supplementPlain.trim()) {
    return {
      attachment: {
        ...base.attachment,
        ...igAugment.attachment,
        warnings: [...base.attachment.warnings, ...igAugment.attachment.warnings],
        sourceLabel: `${base.attachment.sourceLabel} + ${igAugment.attachment.sourceLabel}`,
        contributedToModelText: true,
      },
      supplementPlain: [base.supplementPlain, igAugment.supplementPlain].filter(Boolean).join("\n\n"),
    };
  }

  return base;
}
