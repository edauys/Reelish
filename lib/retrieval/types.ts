/**
 * Source retrieval + evidence fusion — additive layer over URL enrichment and multimodal pipelines.
 */

import type { UrlEnrichmentMerge } from "@/lib/url-enrichment/types";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import type { PreferredLanguage } from "@/types/recipe";

export type RetrievalProviderSafety = "share" | "public" | "experimental";

export type RetrievalTextTier =
  /** From OS payload — authoritative for what arrived */
  | "share_first_class"
  /** Recovered caption-like (oEmbed, OG description that looks substantive) — still weak */
  | "recovered_caption_like"
  /** Public metadata / OG / page excerpt */
  | "public_metadata_weak"
  /** Preview / teaser classification */
  | "teaser_weak"
  /** Optional experimental scraping-like providers */
  | "experimental_weak";

export type RetrievalProviderOutcome = "success" | "failure" | "blocked" | "empty" | "skipped";

export interface RetrievalDiagnosticsSnapshot {
  providerId: string;
  safety: RetrievalProviderSafety;
  attempted: boolean;
  succeeded: boolean;
  outcome?: RetrievalProviderOutcome;
  message?: string;
  warn?: string;
  /** Bytes kept from the HTTP body (may be less than full response). */
  bytesRead?: number;
  /** Response exceeded cap; parser used a partial buffer. */
  htmlTruncated?: boolean;
  /** At least one metadata/script pass ran on available HTML. */
  partialHtmlParsed?: boolean;
  /** Which fields contributed (og:description, script:caption, etc.). */
  supplementFields?: string[];
}

export interface SourceRetrievalSnapshot {
  canonicalUrlKey?: string | null;
  canonicalUrlDisplay?: string | null;
  /** Pre-retrieval resolve marked URL-only (no caption/media in handoff). */
  urlOnlyInputDetected?: boolean;
  /** Supplement plain text was merged into extraction input before resolve. */
  supplementMergedBeforeExtraction?: boolean;
  /** True when supplemental blocks came from retrieval cache replay (no HTTP this run). */
  cacheHit?: boolean;
  /** Ordered list — what ran and outcomes (for transparency UI). */
  diagnostics: RetrievalDiagnosticsSnapshot[];
  /** Aggregated tiers that contributed supplementary text beyond raw share classification. */
  supplementTiersUsed: RetrievalTextTier[];
  /** True when supplementary text improves on teaser-only payloads. */
  recoveredCaptionLike?: boolean;
  /** Rough strength for UX copy — not extraction confidence */
  supplementalStrength?: "none" | "weak" | "moderate";
}

export interface RetrievalOrchestrationContext {
  preliminary: ResolvedExtractionInput;
  urlRaw?: string;
  canonicalKey: string | null;
  canonicalUrl: string | null;
  preferredLanguage: PreferredLanguage;
  shareTextAtOpen?: string;
  shareTitleAtOpen?: string;
  /** True when uploads / native stage produced media ids */
  hasAttachedMediaIds: boolean;
}

export interface RetrievalOrchestrationResult {
  supplementPlain: string;
  enrichmentMerge?: UrlEnrichmentMerge;
  snapshot: SourceRetrievalSnapshot;
}

export function retrievalEnvCacheEnabled(): boolean {
  return process.env.REELISH_RETRIEVAL_CACHE !== "0" && process.env.REELISH_RETRIEVAL_CACHE_DISABLED !== "1";
}

export function retrievalEnvOrchestrationDisabled(): boolean {
  return process.env.REELISH_RETRIEVAL_ORCHESTRATOR === "0" || process.env.REELISH_RETRIEVAL_DISABLED === "1";
}

/** When `"0"`, share classification still runs but no live `resolveUrlEnrichment` / public HTTP (cache replay still allowed). */
export function retrievalEnvPublicHttpDisabled(): boolean {
  return process.env.REELISH_RETRIEVAL_PUBLIC_HTTP === "0";
}
