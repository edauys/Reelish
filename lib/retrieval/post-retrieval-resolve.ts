import { hasAnyPostRetrievalExtractableText } from "@/lib/extraction/url-recovery-text";
import { hasUsableExtractionText } from "@/lib/extraction/text-hints";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import type { RecipeEvidence } from "@/lib/reconstruction/types";
import type { RetrievalOrchestrationResult } from "@/lib/retrieval/types";

function hasMultimodalEvidence(evidence: RecipeEvidence | null): boolean {
  if (!evidence) return false;
  return (
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0
  );
}

/**
 * After retrieval merge, promote link-only inputs to an extractable path when any recovery text exists.
 */
export function coerceResolvedAfterRetrieval(
  resolved: ResolvedExtractionInput,
  mergedText: string,
  supplementalTextMerged: boolean
): ResolvedExtractionInput {
  if (!resolved.isUrlOnlyInsufficient) return resolved;

  const text = mergedText.trim();
  if (!text && !supplementalTextMerged) return resolved;

  if (supplementalTextMerged && text.length > 0) {
    const usable = hasUsableExtractionText(text);
    return {
      url: resolved.url,
      extractionText: text,
      ingestionSource: "url_retrieval_supplemented",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: !usable,
    };
  }

  const usable = hasUsableExtractionText(text);
  const weak = hasAnyPostRetrievalExtractableText(text);
  if (!usable && !weak) return resolved;

  return {
    url: resolved.url,
    extractionText: text,
    ingestionSource: "url_retrieval_supplemented",
    isUrlOnlyInsufficient: false,
    minimalTextHintOnly: !usable,
  };
}

/**
 * Only show the honest link-only card after retrieval (+ optional multimodal) produced no usable signal.
 */
export function shouldReturnUrlOnlyInsufficient(
  resolved: ResolvedExtractionInput,
  ctx: {
    supplementalTextMerged: boolean;
    mergedText: string;
    evidence: RecipeEvidence | null;
    retrievalOutcome?: RetrievalOrchestrationResult;
  }
): boolean {
  if (!resolved.isUrlOnlyInsufficient || !resolved.url) return false;
  if (hasMultimodalEvidence(ctx.evidence)) return false;
  if (ctx.supplementalTextMerged && ctx.mergedText.trim().length > 0) return false;
  if (hasAnyPostRetrievalExtractableText(ctx.mergedText)) return false;
  if (ctx.retrievalOutcome?.snapshot.recoveredCaptionLike) return false;
  const strength = ctx.retrievalOutcome?.snapshot.supplementalStrength;
  if (strength === "weak" || strength === "moderate") return false;
  return true;
}
