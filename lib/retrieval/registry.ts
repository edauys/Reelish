/**
 * Ordered retrieval strategies (documentation + extension hooks).
 * The orchestrator invokes these implicitly; keep ids aligned with diagnostics.
 */
export const RETRIEVAL_PROVIDER_IDS_ORDERED = [
  "share_payload_classify",
  "shared_media",
  "short_url_resolve",
  "retrieval_disk_cache",
  "social_bounded_html",
  "experimental_social_retrieval",
  "public_http_retrieval",
] as const;
