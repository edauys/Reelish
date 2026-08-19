/**
 * Explicit disabled / no-op provider marker for future registry wiring.
 * Selection is currently driven by `REELISH_URL_ENRICHMENT_TIER` in `resolve-url-enrichment.ts`.
 */
export const NOOP_URL_ENRICHMENT_PROVIDER_ID = "noop" as const;
