/**
 * Server-side URL enrichment — optional metadata / weak page text before extraction.
 * Does not replace the extraction pipeline; attaches transparent weak evidence when available.
 */

export type UrlEnrichmentProviderId =
  | "noop"
  | "official_metadata"
  | "experimental_page_text"
  | "experimental_instagram_oembed";

/** How recipe evidence combined for this import (transparency). */
export type EvidenceProvenanceKind =
  | "shared_payload_only"
  | "payload_plus_url_enrichment"
  | "payload_plus_media"
  | "payload_plus_media_and_url_enrichment"
  | "url_enrichment_only";

export interface UrlEnrichmentAttachment {
  providerId: UrlEnrichmentProviderId;
  /** Primary tier used for this attachment (experimental may add on top of official). */
  tier: "none" | "official_metadata" | "experimental_page_text" | "experimental_instagram_oembed";
  fetchedAt: string;
  /** Human-readable source line for UI. */
  sourceLabel: string;
  /** Optional title from page metadata. */
  pageTitle?: string;
  /** Optional description / og:description (weak — not a recipe guarantee). */
  pageDescription?: string;
  /** Experimental: rough visible text sample (very weak, may include chrome). */
  experimentalPlainSample?: string;
  /** Honest warnings when signals are weak or incomplete. */
  warnings: string[];
  /** True when any non-empty text was merged into the extraction input from enrichment. */
  contributedToModelText: boolean;
}

/** Internal merge line for extraction input (weak evidence block). */
export interface UrlEnrichmentMerge {
  attachment: UrlEnrichmentAttachment;
  /** Append to user/shared text before `resolveExtractionInput` when non-empty. */
  supplementPlain: string;
}
