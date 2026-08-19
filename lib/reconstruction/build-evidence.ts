import { detectSourceFromUrl, inferCreatorHandleFromUrl } from "@/lib/extraction/url-meta";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import type { ShareIntakePayload } from "@/lib/share/types";
import type { PreferredLanguage } from "@/types/recipe";
import type { SourceRetrievalSnapshot } from "@/lib/retrieval/types";
import type { EvidenceProvenanceKind, UrlEnrichmentAttachment } from "@/lib/url-enrichment/types";
import type { RecipeEvidence, RecipeMediaHints } from "@/lib/reconstruction/types";

type ClientExtractionFields = {
  text?: string;
  shareTextAtOpen?: string;
  shareTitleAtOpen?: string;
  preferredLanguage: PreferredLanguage;
  mediaHints?: RecipeMediaHints;
  shareIntake?: ShareIntakePayload;
};

/**
 * Build a normalized evidence bag from the current share/paste resolution step.
 */
export function buildRecipeEvidence(
  input: ClientExtractionFields,
  resolved: ResolvedExtractionInput,
  extras?: {
    urlEnrichment?: UrlEnrichmentAttachment;
    evidenceProvenance?: EvidenceProvenanceKind;
    sourceRetrieval?: SourceRetrievalSnapshot;
  }
): RecipeEvidence {
  const url = resolved.url;
  const box = input.text?.trim() ?? "";
  const shareText = input.shareTextAtOpen?.trim() ?? "";
  const shareTitle = input.shareTitleAtOpen?.trim() ?? "";

  return {
    sourceUrl: url,
    sourcePlatform: url ? detectSourceFromUrl(url) : undefined,
    creatorHandle: url ? inferCreatorHandleFromUrl(url) : null,
    primaryText: resolved.extractionText,
    captionText: shareText || undefined,
    pastedRecipeText: box && (!shareText || box !== shareText) ? box : undefined,
    sharedTitle: shareTitle || undefined,
    mediaHints: input.mediaHints,
    shareIntake: input.shareIntake,
    minimalTextHintOnly: resolved.minimalTextHintOnly,
    preferredLanguage: input.preferredLanguage,
    ingestionSource: resolved.ingestionSource,
    urlEnrichment: extras?.urlEnrichment,
    evidenceProvenance: extras?.evidenceProvenance,
    sourceRetrieval: extras?.sourceRetrieval,
  };
}
