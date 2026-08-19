import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import type { RecipeSource } from "@/types/recipe";
import type { RetrievalOrchestrationContext, RetrievalOrchestrationResult } from "@/lib/retrieval/types";
import { retrievalEnvOrchestrationDisabled, retrievalEnvPublicHttpDisabled } from "@/lib/retrieval/types";
import { canonicalSourceFromUrl } from "@/lib/retrieval/canonical-url";
import { readRetrievalCache, writeRetrievalCache } from "@/lib/retrieval/cache-disk";
import { resolveShortSocialUrlHref } from "@/lib/retrieval/resolve-short-url";
import { resolveUrlEnrichment } from "@/lib/url-enrichment/resolve-url-enrichment";
import type { PreferredLanguage } from "@/types/recipe";
import type { RecipeMediaHints } from "@/lib/reconstruction/types";
import {
  isExperimentalSocialRetrievalEnabled,
  runExperimentalSocialRetrieval,
} from "@/lib/retrieval/providers/experimental-social-retrieval";
import { recoverSocialEvidenceFromUrl } from "@/lib/url-enrichment/social-html-evidence";
import { classifySharePayloadDiagnostics } from "@/lib/retrieval/providers/share-payload-classify";
import { sharedMediaMarkersDiagnostics } from "@/lib/retrieval/providers/shared-media-marker";
import type { RetrievalProviderOutcome } from "@/lib/retrieval/types";

export function emptyRetrievalOrchestrationResult(): RetrievalOrchestrationResult {
  return {
    supplementPlain: "",
    enrichmentMerge: undefined,
    snapshot: { diagnostics: [], supplementTiersUsed: [], supplementalStrength: "none" },
  };
}

function assessSupplementStrength(plain: string): "none" | "weak" | "moderate" {
  const t = plain.trim();
  if (!t) return "none";
  const lower = t.toLowerCase();
  if (/\[instagram public oembed/i.test(lower)) {
    const bodyLen = lower.replace(/\[.*?\]/g, "").trim().length;
    if (bodyLen > 200) return "moderate";
  }
  if (t.length > 800) return "moderate";
  if (t.length > 140) return "weak";
  return "weak";
}

function recoveredCaptionSignals(plain: string): boolean {
  const lower = plain.toLowerCase();
  return /\[instagram public oembed/i.test(lower) || /\bIngredients?\b|\bMalzeme\b|\badet\b|\bgram\b|\bml\b|\bsteps?\b/i.test(plain);
}

/**
 * Canonical source-retrieval orchestration: share classification + optional short-URL HEAD + cached public HTTP enrichment.
 *
 * Existing `resolveUrlEnrichment` remains the **single** authoritative public HTTP/metadata path (Instagram oEmbed fallback included).
 */
export async function runSourceRetrievalOrchestrator(opts: {
  input: {
    url?: string;
    text?: string;
    shareTextAtOpen?: string;
    shareTitleAtOpen?: string;
  };
  preliminary: ResolvedExtractionInput;
  preferredLanguage: PreferredLanguage;
  mediaHints?: RecipeMediaHints;
}): Promise<RetrievalOrchestrationResult> {
  const out = emptyRetrievalOrchestrationResult();
  if (retrievalEnvOrchestrationDisabled()) {
    return out;
  }

  const urlRawOpt = opts.preliminary.url ?? opts.input.url?.trim();
  let fetchTarget = urlRawOpt?.trim() ?? "";

  /** Short TikTok redirects — tighten fetch + cache key when allowed */
  let redirectFollowed = false;
  const resolvedHref = fetchTarget ? await resolveShortSocialUrlHref(fetchTarget) : null;
  if (resolvedHref) {
    fetchTarget = resolvedHref;
    redirectFollowed = true;
  }

  const canonical = canonicalSourceFromUrl(fetchTarget || undefined);
  const plat: RecipeSource = canonical.platform ?? "unknown";

  const ctx: RetrievalOrchestrationContext = {
    preliminary: opts.preliminary,
    urlRaw: fetchTarget || undefined,
    canonicalKey: canonical.canonicalKey,
    canonicalUrl: canonical.canonicalUrl,
    preferredLanguage: opts.preferredLanguage,
    shareTextAtOpen: opts.input.shareTextAtOpen,
    shareTitleAtOpen: opts.input.shareTitleAtOpen,
    hasAttachedMediaIds:
      Boolean(opts.mediaHints?.mediaAssetIds?.length) || Boolean(opts.mediaHints?.mediaAssetId?.trim()),
  };

  out.snapshot.canonicalUrlKey = canonical.canonicalKey ?? undefined;
  out.snapshot.canonicalUrlDisplay = canonical.canonicalUrl ?? fetchTarget ?? undefined;
  out.snapshot.urlOnlyInputDetected =
    opts.preliminary.isUrlOnlyInsufficient === true && Boolean(fetchTarget || urlRawOpt);

  const diagShare = classifySharePayloadDiagnostics(ctx);
  out.snapshot.diagnostics.push(diagShare);
  const diagMedia = sharedMediaMarkersDiagnostics(ctx);
  out.snapshot.diagnostics.push(diagMedia);

  if (redirectFollowed) {
    out.snapshot.diagnostics.push({
      providerId: "short_url_resolve",
      safety: "public",
      attempted: true,
      succeeded: true,
      message: "followed_redirect_for_fetch_and_canonical_key",
    });
  }

  if (!fetchTarget || !canonical.canonicalKey) {
    out.snapshot.diagnostics.push({
      providerId: "public_http_retrieval",
      safety: "public",
      attempted: false,
      succeeded: false,
      message: "no_public_url_skip_network",
    });
    return out;
  }

  const cached = await readRetrievalCache(canonical.canonicalKey);
  if (cached?.supplementPlain.trim()) {
    out.supplementPlain = cached.supplementPlain.trim();
    out.snapshot.cacheHit = true;
    out.snapshot.supplementalStrength = assessSupplementStrength(out.supplementPlain);
    out.snapshot.supplementTiersUsed = recoveredCaptionSignals(out.supplementPlain)
      ? ["public_metadata_weak", "recovered_caption_like"]
      : ["public_metadata_weak"];
    out.snapshot.recoveredCaptionLike = recoveredCaptionSignals(out.supplementPlain);

    const attach = cached.enrichmentMergeJson as { sourceLabel?: string; warnings?: string[] } | undefined;
    const syntheticWarnings = attach?.warnings?.length ? attach.warnings : ["Replayed retrieval cache entry."];
    out.enrichmentMerge = {
      attachment: {
        providerId: "noop",
        tier: "none",
        fetchedAt: cached.savedAtIso,
        sourceLabel: attach?.sourceLabel ?? "Source retrieval cache (replay)",
        warnings: syntheticWarnings,
        contributedToModelText: true,
      },
      supplementPlain: out.supplementPlain,
    };

    out.snapshot.diagnostics.push({
      providerId: "retrieval_disk_cache",
      safety: "public",
      attempted: true,
      succeeded: true,
      message: "cache_hit_skip_live_fetch",
    });
    out.snapshot.diagnostics.push({
      providerId: "public_http_retrieval",
      safety: "public",
      attempted: false,
      succeeded: false,
      message: "skipped_due_cache_hit",
    });
    return out;
  }

  out.snapshot.diagnostics.push({
    providerId: "retrieval_disk_cache",
    safety: "public",
    attempted: true,
    succeeded: false,
    message: "cache_miss_live_fetch",
  });

  let supplement = "";
  let enrichMerge: Awaited<ReturnType<typeof resolveUrlEnrichment>> | undefined;

  if (plat === "instagram" || plat === "tiktok") {
    if (isExperimentalSocialRetrievalEnabled()) {
      const exp = await runExperimentalSocialRetrieval(fetchTarget, plat);
      out.snapshot.diagnostics.push(exp.diagnostic);
      if (exp.supplementPlain.trim()) {
        supplement = exp.supplementPlain.trim();
        enrichMerge = exp.merge;
      }
    } else {
      const bounded = await recoverSocialEvidenceFromUrl(fetchTarget, plat, "social_bounded_html");
      out.snapshot.diagnostics.push(bounded.diagnostic);
      if (bounded.supplementPlain.trim()) {
        supplement = bounded.supplementPlain.trim();
        enrichMerge = bounded.merge;
      }
    }
  }

  if (!supplement && !retrievalEnvPublicHttpDisabled()) {
    enrichMerge = await resolveUrlEnrichment(fetchTarget || urlRawOpt);
    supplement = enrichMerge?.supplementPlain.trim() ?? "";
  } else if (!supplement && retrievalEnvPublicHttpDisabled()) {
    out.snapshot.diagnostics.push({
      providerId: "public_http_retrieval",
      safety: "public",
      attempted: false,
      succeeded: false,
      outcome: "skipped",
      message: "disabled_by_env_REELISH_RETRIEVAL_PUBLIC_HTTP",
    });
  }

  out.enrichmentMerge = enrichMerge ?? undefined;
  out.supplementPlain = supplement;
  const contributed = enrichMerge?.attachment?.contributedToModelText === true;

  if (!out.snapshot.diagnostics.some((d) => d.providerId === "public_http_retrieval")) {
    const warn0 = enrichMerge?.attachment?.warnings?.[0] ?? "";
    let outcome: RetrievalProviderOutcome = "empty";
    if (contributed || supplement.length > 0) outcome = "success";
    else if (/401|403|blocked/i.test(warn0)) outcome = "blocked";
    else if (enrichMerge?.attachment?.sourceLabel?.includes("failed")) outcome = "failure";

    out.snapshot.diagnostics.push({
      providerId: "public_http_retrieval",
      safety: "public",
      attempted: !retrievalEnvPublicHttpDisabled(),
      succeeded: contributed || supplement.length > 0,
      outcome,
      message: contributed ? `supplemented_${supplement.length}_chars` : "no_plain_supplement_this_run",
      warn: warn0 || undefined,
    });
  }

  if (supplement) {
    out.snapshot.supplementTiersUsed = recoveredCaptionSignals(supplement)
      ? ["public_metadata_weak", "recovered_caption_like"]
      : ["public_metadata_weak"];
    out.snapshot.recoveredCaptionLike = recoveredCaptionSignals(supplement);
    out.snapshot.supplementalStrength = assessSupplementStrength(supplement);
  }

  if (canonical.canonicalKey && supplement.length > 0) {
    void writeRetrievalCache({
      canonicalKey: canonical.canonicalKey,
      savedAtIso: new Date().toISOString(),
      supplementPlain: supplement,
      enrichmentMergeJson:
        enrichMerge != null ? (JSON.parse(JSON.stringify({ sourceLabel: enrichMerge.attachment.sourceLabel })) as Record<
          string,
          unknown
        >) : null,
    });
  }

  return out;
}
