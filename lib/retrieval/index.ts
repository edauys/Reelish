export { canonicalSourceFromUrl, type CanonicalResolution } from "@/lib/retrieval/canonical-url";
export { readRetrievalCache, writeRetrievalCache, type RetrievalCacheEnvelope } from "@/lib/retrieval/cache-disk";
export {
  emptyRetrievalOrchestrationResult,
  runSourceRetrievalOrchestrator,
} from "@/lib/retrieval/orchestrator";
export { RETRIEVAL_PROVIDER_IDS_ORDERED } from "@/lib/retrieval/registry";
export { resolveShortSocialUrlHref, maybeShortSocialUrl } from "@/lib/retrieval/resolve-short-url";
export type {
  RetrievalDiagnosticsSnapshot,
  RetrievalOrchestrationContext,
  RetrievalOrchestrationResult,
  RetrievalProviderSafety,
  RetrievalTextTier,
  SourceRetrievalSnapshot,
} from "@/lib/retrieval/types";
export {
  retrievalEnvCacheEnabled,
  retrievalEnvOrchestrationDisabled,
  retrievalEnvPublicHttpDisabled,
} from "@/lib/retrieval/types";
