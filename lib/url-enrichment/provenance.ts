import type { EvidenceProvenanceKind } from "@/lib/url-enrichment/types";
import type { ShareIntakeOrigin } from "@/lib/share/types";

/**
 * Transparency: how OS share / paste, server media, and optional URL enrichment combined.
 * `shareHandoff` = web or native share target (not manual-only dashboard entry).
 */
export function computeEvidenceProvenanceFromFlags(p: {
  enrichmentContributed: boolean;
  hasMedia: boolean;
  shareOrigin?: ShareIntakeOrigin;
}): EvidenceProvenanceKind {
  const handoff = p.shareOrigin === "web_share_target" || p.shareOrigin === "native_share_extension";
  const e = p.enrichmentContributed;
  const m = p.hasMedia;

  if (handoff) {
    if (e && m) return "payload_plus_media_and_url_enrichment";
    if (m) return "payload_plus_media";
    if (e) return "payload_plus_url_enrichment";
    return "shared_payload_only";
  }
  if (e && m) return "payload_plus_media_and_url_enrichment";
  if (m) return "payload_plus_media";
  if (e) return "url_enrichment_only";
  return "shared_payload_only";
}
