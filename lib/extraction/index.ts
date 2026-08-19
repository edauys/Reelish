import {
  buildInsufficientUrlRecipe,
  coalesceImportUrlFields,
  hasMediaHints,
  resolveExtractionInput,
} from "@/lib/extraction/ingestion";
import {
  coerceResolvedAfterRetrieval,
  shouldReturnUrlOnlyInsufficient,
} from "@/lib/retrieval/post-retrieval-resolve";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import { extractWithMock } from "@/lib/extraction/mock-extractor";
import { extractWithOpenAI } from "@/lib/extraction/openai-extractor";
import { enrichRecipePayloadWithStructuredIngredients } from "@/lib/ingredients/enrich-payload";
import { augmentPayloadWithReconstruction } from "@/lib/reconstruction/augment-payload";
import { looksLikeStructuredRecipeCaption } from "@/lib/extraction/recipe-caption-detect";
import { buildRecipeEvidence } from "@/lib/reconstruction/build-evidence";
import { calibrateRecipePayloadConfidence } from "@/lib/reconstruction/confidence";
import { combinedTextForExtractionModel, stripSectionHeadersForHeuristics } from "@/lib/reconstruction/combine-text";
import { attachExtractionEvidenceDetail } from "@/lib/reconstruction/evidence-detail";
import { enrichEvidenceWithMultimodalProviders } from "@/lib/reconstruction/gather-evidence";
import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import type { RecipeEvidence, RecipeMediaHints } from "@/lib/reconstruction/types";
import { logReelishTelemetry, shortId, textShape } from "@/lib/telemetry/reelish-log";
import { retrievalEnvOrchestrationDisabled } from "@/lib/retrieval/types";
import { emptyRetrievalOrchestrationResult, runSourceRetrievalOrchestrator } from "@/lib/retrieval/orchestrator";
import type { RetrievalOrchestrationResult } from "@/lib/retrieval/types";
import { computeEvidenceProvenanceFromFlags } from "@/lib/url-enrichment/provenance";
import { resolveUrlEnrichment } from "@/lib/url-enrichment/resolve-url-enrichment";
import type { UrlEnrichmentMerge } from "@/lib/url-enrichment/types";
import type { ShareIntakePayload } from "@/lib/share/types";
import type { PreferredLanguage, RecipePayload } from "@/types/recipe";

export type ExtractionInput = {
  url?: string;
  text?: string;
  preferredLanguage: PreferredLanguage;
  /** Original share sheet body (if any), for provenance + fallback ordering. */
  shareTextAtOpen?: string;
  /** Original share sheet title (if any). */
  shareTitleAtOpen?: string;
  /** Optional audio/images for Whisper + vision (server actions, tests, future share payloads). */
  mediaHints?: RecipeMediaHints;
  /** Share handoff metadata (PWA, manual, future native). */
  shareIntake?: ShareIntakePayload;
  /** Server-only: correlates telemetry (never logged in full). */
  actorUserId?: string;
};

export type ExtractionResult = {
  recipe: RecipePayload;
  usedDemoFallback: boolean;
};

export { parseRecipeText } from "@/lib/extraction/mock-extractor";
export {
  hasAnyExtractableText,
  hasMinimalRecipeHint,
  hasUsableExtractionText,
  hasMediaHints,
  resolveExtractionInput,
  buildInsufficientUrlRecipe,
  coalesceImportUrlFields,
} from "@/lib/extraction/ingestion";
export type { RecipeMediaHints } from "@/lib/reconstruction/types";
export type { ShareIntakePayload, ShareIntakeOrigin } from "@/lib/share/types";

function withIngestionSource(recipe: RecipePayload, source: RecipePayload["ingestionSource"]): RecipePayload {
  return { ...recipe, ingestionSource: source ?? recipe.ingestionSource };
}

function logShareDebugShape(input: ExtractionInput, resolved: ResolvedExtractionInput): void {
  if (process.env.REELISH_SHARE_DEBUG !== "1") return;
  logReelishTelemetry("share.debug_shape", {
    actorUserId: shortId(input.actorUserId),
    origin: input.shareIntake?.origin,
    sessionId: shortId(input.shareIntake?.sessionId),
    ingestion: resolved.ingestionSource,
    primaryText: textShape(resolved.extractionText),
    shareTextAtOpen: textShape(input.shareTextAtOpen),
    shareTitleAtOpen: textShape(input.shareTitleAtOpen),
    urlPresent: Boolean(resolved.url),
    mediaAssetIds: input.mediaHints?.mediaAssetIds?.length ?? 0,
    nativePartial: input.shareIntake?.nativeMediaUploadPartial === true,
  });
}

function logExtractionOutcome(
  input: ExtractionInput,
  resolved: ResolvedExtractionInput,
  evidence: RecipeEvidence | null,
  recipe: RecipePayload,
  usedDemoFallback: boolean
): void {
  const mm = evidence ? assessMultimodalStrength(evidence) : null;
  const warnN = (recipe.extractionWarnings?.length ?? 0) + (recipe.reconstructionWarnings?.length ?? 0);
  logReelishTelemetry("extraction.completed", {
    actorUserId: shortId(input.actorUserId),
    ingestion: resolved.ingestionSource,
    urlOnlyInsufficient: resolved.isUrlOnlyInsufficient,
    multimodalTier: mm?.tier ?? "none",
    extractionConfidence: recipe.extractionConfidence,
    measurementConfidence: recipe.measurementConfidence,
    warningCount: warnN,
    usedDemoFallback,
    shareOrigin: input.shareIntake?.origin,
    primaryLen: textShape(evidence?.primaryText).len,
    transcriptLen: textShape(evidence?.transcriptText).len,
    ocrLen: textShape(evidence?.ocrText).len,
    visualHints: evidence?.visualIngredientHints?.length ?? 0,
    mediaAssetIds: evidence?.mediaHints?.mediaAssetIds?.length ?? 0,
    retrievalOrchestration: retrievalEnvOrchestrationDisabled() ? "off" : "on",
    retrievalCacheHit: evidence?.sourceRetrieval?.cacheHit === true,
    retrievalCanonicalPresent: Boolean(evidence?.sourceRetrieval?.canonicalUrlKey ?? evidence?.sourceRetrieval?.canonicalUrlDisplay),
    retrievalStrength: evidence?.sourceRetrieval?.supplementalStrength ?? "none",
  });
}

/**
 * Provider-based extraction: OpenAI when `OPENAI_API_KEY` is set; otherwise offline mock/demo parsing.
 * Wraps multimodal `RecipeEvidence` + reconstruction augmentation (transcript/OCR/vision ready via noop providers).
 */
export async function runExtraction(input: ExtractionInput): Promise<ExtractionResult> {
  const keyTrimmed = process.env.OPENAI_API_KEY?.trim();
  const hasKey = Boolean(keyTrimmed);
  const modelTrimmed = process.env.OPENAI_EXTRACTION_MODEL?.trim();

  if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
    console.info("[reelish:extract]", {
      path: hasKey ? "openai" : "mock_no_key",
      hasOpenAiApiKey: hasKey,
      openAiApiKeyLength: keyTrimmed?.length ?? 0,
      hasOpenAiExtractionModel: Boolean(modelTrimmed),
      openAiExtractionModel: modelTrimmed || "(default gpt-4o-mini)",
    });
  }

  const coalesced = coalesceImportUrlFields(input);
  const normalizedInput: ExtractionInput = {
    ...input,
    url: coalesced.url ?? input.url,
    text: coalesced.text,
  };

  const preliminaryBare = resolveExtractionInput(normalizedInput);
  let enrichMerge: UrlEnrichmentMerge | undefined;
  let retrievalOutcome: RetrievalOrchestrationResult = emptyRetrievalOrchestrationResult();
  let mergedInput: ExtractionInput = normalizedInput;
  let supplementalTextMerged = false;

  if (!retrievalEnvOrchestrationDisabled()) {
    retrievalOutcome = await runSourceRetrievalOrchestrator({
      input: normalizedInput,
      preliminary: preliminaryBare,
      preferredLanguage: input.preferredLanguage,
      mediaHints: input.mediaHints,
    });
    enrichMerge = retrievalOutcome.enrichmentMerge;
    if (retrievalOutcome.supplementPlain.trim()) {
      supplementalTextMerged = true;
      mergedInput = {
        ...normalizedInput,
        text: [normalizedInput.text?.trim(), retrievalOutcome.supplementPlain].filter(Boolean).join("\n\n"),
      };
    }
    retrievalOutcome.snapshot.supplementMergedBeforeExtraction = supplementalTextMerged;
  } else {
    enrichMerge = await resolveUrlEnrichment(preliminaryBare.url ?? normalizedInput.url?.trim());
    if (enrichMerge?.supplementPlain.trim()) {
      supplementalTextMerged = true;
      mergedInput = {
        ...normalizedInput,
        text: [normalizedInput.text?.trim(), enrichMerge.supplementPlain].filter(Boolean).join("\n\n"),
      };
    }
  }

  let resolved = resolveExtractionInput(mergedInput);
  resolved = coerceResolvedAfterRetrieval(resolved, mergedInput.text ?? "", supplementalTextMerged);
  logShareDebugShape(mergedInput, resolved);

  const provenance = computeEvidenceProvenanceFromFlags({
    enrichmentContributed:
      supplementalTextMerged || enrichMerge?.attachment.contributedToModelText === true,
    hasMedia: hasMediaHints(mergedInput.mediaHints),
    shareOrigin: mergedInput.shareIntake?.origin,
  });

  const evidenceBase = buildRecipeEvidence(mergedInput, resolved, {
    urlEnrichment: enrichMerge?.attachment,
    evidenceProvenance: provenance,
    sourceRetrieval: retrievalEnvOrchestrationDisabled() ? undefined : retrievalOutcome.snapshot,
  });
  let evidence = await enrichEvidenceWithMultimodalProviders(evidenceBase);

  if (
    shouldReturnUrlOnlyInsufficient(resolved, {
      supplementalTextMerged,
      mergedText: mergedInput.text ?? "",
      evidence,
      retrievalOutcome,
    }) &&
    resolved.url
  ) {
    const blocked = retrievalOutcome.snapshot.diagnostics.some(
      (d) => d.outcome === "blocked" || /401|403|blocked/i.test(d.message ?? "") || /401|403/i.test(d.warn ?? "")
    );
    const recipe = attachExtractionEvidenceDetail(
      buildInsufficientUrlRecipe(resolved.url, input.preferredLanguage, {
        retrievalAttempted: !retrievalEnvOrchestrationDisabled(),
        platformBlocked: blocked,
      }),
      evidence
    );
    logExtractionOutcome(mergedInput, resolved, evidence, recipe, false);
    return {
      recipe,
      usedDemoFallback: false,
    };
  }

  let combinedText = combinedTextForExtractionModel(evidence);

  if (!combinedText.trim() && resolved.ingestionSource === "media_supplemented") {
    combinedText = [
      "### Caption / recipe text",
      "(Media was attached, but Reelish could not extract usable speech or on-screen text yet — check ffmpeg/OpenAI settings, or try sharing a shorter clip. You can add a short note below only if needed.)",
    ].join("\n");
  }

  const probeForStructure = stripSectionHeadersForHeuristics(combinedText);
  const structuredCaption = looksLikeStructuredRecipeCaption(probeForStructure);
  const multimodalBeyondCaption =
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0;

  const minimalForModel =
    Boolean(resolved.minimalTextHintOnly) && !structuredCaption && !multimodalBeyondCaption;

  evidence = { ...evidence, minimalTextHintOnly: minimalForModel };

  const compact = {
    url: resolved.url,
    text: combinedText,
    preferredLanguage: input.preferredLanguage,
    minimalTextHintOnly: minimalForModel,
  };

  const merge = (recipe: RecipePayload): RecipePayload => {
    const warnExtra = enrichMerge?.attachment.warnings?.length ? enrichMerge!.attachment.warnings : [];
    const withWarn =
      warnExtra.length > 0
        ? {
            ...recipe,
            extractionWarnings: [...(recipe.extractionWarnings ?? []), ...warnExtra],
          }
        : recipe;
    return withIngestionSource(
      attachExtractionEvidenceDetail(
        enrichRecipePayloadWithStructuredIngredients(
          augmentPayloadWithReconstruction(calibrateRecipePayloadConfidence(withWarn, evidence), evidence)
        ),
        evidence
      ),
      resolved.ingestionSource
    );
  };

  if (!hasKey) {
    const recipe = merge(extractWithMock(compact));
    logExtractionOutcome(mergedInput, resolved, evidence, recipe, true);
    return {
      recipe,
      usedDemoFallback: true,
    };
  }

  try {
    const recipe = await extractWithOpenAI(compact);
    const out = merge(recipe);
    logExtractionOutcome(mergedInput, resolved, evidence, out, false);
    return { recipe: out, usedDemoFallback: false };
  } catch (e) {
    if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
      console.error("[reelish:extract] OpenAI error:", e instanceof Error ? e.message : String(e));
    }
    const recipe = extractWithMock({
      ...compact,
      extraWarnings: ["AI extraction failed; using offline fallback parsing."],
      suppressMissingKeyDemoWarning: true,
    });
    const out = merge(recipe);
    logExtractionOutcome(mergedInput, resolved, evidence, out, true);
    return { recipe: out, usedDemoFallback: true };
  }
}
