import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import { clipTextForMultimodalPipeline } from "@/lib/reconstruction/limits";
import type { RecipeEvidence } from "@/lib/reconstruction/types";
import { shareCaptionIntakeSummary } from "@/lib/share/caption-intake-hints";
import type { EvidenceProvenanceKind } from "@/lib/url-enrichment/types";
import { linkFirstInstagramEnrichmentContextNote } from "@/lib/url-enrichment/experimental-instagram-social";
import type { ExtractionEvidenceDetail, RecipePayload } from "@/types/recipe";

function provenanceLabel(kind: EvidenceProvenanceKind, handoff: boolean): { title: string; sub?: string } {
  switch (kind) {
    case "shared_payload_only":
      return handoff
        ? { title: "Shared payload only", sub: "Link/caption from the OS share sheet — no extra page fetch in this run." }
        : { title: "Direct input", sub: "Typed or pasted in Reelish (no URL enrichment in this run)." };
    case "payload_plus_url_enrichment":
      return {
        title: "Shared/pasted input + URL enrichment",
        sub: "Weak public metadata (or experimental sample) was merged as supplemental text — not a verified recipe.",
      };
    case "payload_plus_media":
      return { title: "Shared/pasted input + media", sub: "Server-side media (or native handoff) supplemented extraction." };
    case "payload_plus_media_and_url_enrichment":
      return {
        title: "Input + media + URL enrichment",
        sub: "Combined shared text, uploaded media, and optional page metadata — check confidence and warnings.",
      };
    case "url_enrichment_only":
      return {
        title: "URL enrichment only",
        sub: "Little or no usable caption — only weak page metadata was added for this extraction.",
      };
    default:
      return { title: kind };
  }
}

/**
 * UI-oriented snapshot of which inputs contributed to extraction (not a second source of truth).
 */
export function attachExtractionEvidenceDetail(payload: RecipePayload, evidence: RecipeEvidence): RecipePayload {
  const mm = assessMultimodalStrength(evidence);
  const hasMm =
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0;

  const captionRaw = evidence.captionText?.trim() ?? "";
  const captionSnippet = clipTextForMultimodalPipeline(captionRaw, 360);
  const showShareCaptionDiagnostics = Boolean(evidence.shareIntake) || captionRaw.length > 0;
  const captionIntake = showShareCaptionDiagnostics ? shareCaptionIntakeSummary(captionRaw) : null;
  const linkFirstHint = linkFirstInstagramEnrichmentContextNote(evidence.sourceUrl, captionRaw);
  const pastedUsed = Boolean(evidence.pastedRecipeText?.trim());
  const transcriptPresent = Boolean(evidence.transcriptText?.trim());
  const ocrPresent = Boolean(evidence.ocrText?.trim());
  const reconstructionPrimarySourcesNote = (() => {
    const teaser = captionIntake?.likelyTeaserOnly === true;
    if (pastedUsed && !transcriptPresent && !ocrPresent && !hasMm) {
      return "Extraction leaned on text from the main recipe box (no transcript/OCR/vision this run).";
    }
    if (pastedUsed && (transcriptPresent || ocrPresent)) {
      return "Pasted or edited text was merged with transcript and/or on-screen text from shared media.";
    }
    if (teaser && (transcriptPresent || ocrPresent) && !pastedUsed) {
      return "Share text looked like the short iOS/Instagram preview — recipe structure likely came from transcript and/or on-screen text, not the preview line.";
    }
    if (teaser && (transcriptPresent || ocrPresent) && pastedUsed) {
      return "Short preview-like share caption plus your edits — combined with transcript/OCR from media.";
    }
    const sr = evidence.sourceRetrieval;
    if (sr?.cacheHit && (sr.supplementTiersUsed?.length ?? 0) > 0) {
      return "Supplementary text came from retrieval cache keyed on the canonical URL (no fresh HTTP fetch this run); combined with whatever the share delivered.";
    }
    if (!pastedUsed && !hasMm && sr?.recoveredCaptionLike) {
      if (teaser) {
        return "Short share preview plus URL-derived caption-like public metadata — still verify servings; transcript/OCR from shared media would strengthen this.";
      }
      return "URL retrieval returned caption-like public text — treat as weak vs the real in-app caption; verify quantities.";
    }
    if (teaser && sr?.supplementalStrength === "weak" && !hasMm && !sr?.recoveredCaptionLike && !pastedUsed) {
      return "Share preview is thin and URL retrieval only returned weak teaser-level public text — shared media with transcript/OCR would help.";
    }

    if (evidence.urlEnrichment?.contributedToModelText && teaser) {
      return "Weak public URL text was merged because the share caption was thin — check URL enrichment line above; still verify amounts.";
    }
    if (!teaser && hasMm && captionRaw.length > 80) {
      return "Longer share caption plus media signals were combined for reconstruction.";
    }
    return undefined;
  })();
  const nativeMediaUnusable =
    Boolean(evidence.shareIntake?.origin === "native_share_extension") &&
    (evidence.mediaProcessingNotes?.some((n) => /unsupported media type/i.test(n)) ?? false);
  const structured = payload.ingredientsStructured;
  let structuredIngredientEstimatedCount: number | undefined;
  let structuredIngredientParsedWithQtyCount: number | undefined;
  if (structured?.length) {
    structuredIngredientEstimatedCount = structured.filter((s) => s.estimated === true).length;
    structuredIngredientParsedWithQtyCount = structured.filter((s) => s.estimated !== true && (s.amount || s.unit)).length;
  }

  const handoff =
    evidence.shareIntake?.origin === "web_share_target" || evidence.shareIntake?.origin === "native_share_extension";
  const prov = evidence.evidenceProvenance;
  const provDisplay = prov ? provenanceLabel(prov, handoff) : undefined;

  const detail: ExtractionEvidenceDetail = {
    sharedLink: evidence.sourceUrl,
    usedSharedCaption: Boolean(evidence.captionText?.trim()),
    reconstructionPrimarySourcesNote,
    captionTextSnippet: captionSnippet,
    usedSharedTitle: Boolean(evidence.sharedTitle?.trim()),
    usedPastedText: pastedUsed,
    transcriptPresent,
    transcriptPreview: evidence.transcriptText?.trim().slice(0, 360),
    onScreenTextPresent: ocrPresent,
    onScreenTextPreview: evidence.ocrText?.trim().slice(0, 360),
    visualIngredientLabels: evidence.visualIngredientHints?.map((h) => h.label),
    visualCookingCueLabels: evidence.visualCookingCues?.map((c) => c.label),
    mediaProcessingNotes: evidence.mediaProcessingNotes,
    serverMediaAssetIds: (() => {
      const raw = [
        ...(evidence.mediaHints?.mediaAssetIds ?? []),
        ...(evidence.mediaHints?.mediaAssetId ? [evidence.mediaHints.mediaAssetId] : []),
      ];
      return raw.length ? [...new Set(raw)] : undefined;
    })(),
    intakeOrigin: evidence.shareIntake?.origin,
    intakeReceivedAt: evidence.shareIntake?.receivedAt,
    intakeSessionId: evidence.shareIntake?.sessionId,
    intakeInferredPlatform: evidence.shareIntake?.inferredPlatform,
    intakeSourceAppId: evidence.shareIntake?.sourceAppId,
    intakeSourceAppLabel: evidence.shareIntake?.sourceAppLabel,
    multimodalStrengthTier: hasMm ? mm.tier : undefined,
    multimodalStrengthSummary: hasMm ? mm.summaryLine : undefined,
    nativeMediaStagedFromExtension:
      evidence.shareIntake?.origin === "native_share_extension" &&
      ((evidence.shareIntake?.mediaAssetIds?.length ?? 0) > 0 ||
        (evidence.mediaHints?.mediaAssetIds?.length ?? 0) > 0 ||
        Boolean(evidence.mediaHints?.mediaAssetId?.trim())),
    nativeMediaUploadPartial: evidence.shareIntake?.nativeMediaUploadPartial === true,
    nativeHandoffFromAppGroupRelay: evidence.shareIntake?.nativeHandoffFromAppGroupRelay === true,
    nativeHandoffSimulatorBuild: evidence.shareIntake?.nativeHandoffSimulatorBuild === true,
    nativeHandoffManualResume: evidence.shareIntake?.nativeHandoffManualResume === true,
    nativeNoAppGroupMediaBlocked: evidence.shareIntake?.nativeNoAppGroupMediaBlocked === true,
    evidenceProvenance: prov,
    evidenceProvenanceTitle: provDisplay?.title,
    evidenceProvenanceDetail: provDisplay?.sub,
    urlEnrichmentSourceLabel: evidence.urlEnrichment?.sourceLabel,
    urlEnrichmentContributed: evidence.urlEnrichment?.contributedToModelText === true,
    structuredIngredientEstimatedCount,
    structuredIngredientParsedWithQtyCount,
    shareCaptionCharCount: captionIntake?.charCount,
    shareCaptionLikelyTeaserOnly: captionIntake?.likelyTeaserOnly,
    shareCaptionIntakeDetail: captionIntake?.detail,
    linkFirstEnrichmentHint: linkFirstHint,
    nativeMediaStagedButUnprocessable: nativeMediaUnusable,
    multimodalPipelineRows: evidence.multimodalPipelineRows,
    sourceRetrievalCanonicalUrl: evidence.sourceRetrieval?.canonicalUrlDisplay ?? evidence.sourceRetrieval?.canonicalUrlKey ?? undefined,
    sourceRetrievalCacheHit: evidence.sourceRetrieval?.cacheHit === true ? true : undefined,
    sourceRetrievalSupplementStrength:
      evidence.sourceRetrieval?.supplementalStrength === "weak" || evidence.sourceRetrieval?.supplementalStrength === "moderate"
        ? evidence.sourceRetrieval.supplementalStrength
        : undefined,
    sourceRetrievalRecoveredCaptionLike: evidence.sourceRetrieval?.recoveredCaptionLike === true ? true : undefined,
    sourceRetrievalProviderRows: evidence.sourceRetrieval?.diagnostics?.length
      ? evidence.sourceRetrieval.diagnostics.map((d) => {
          const st = `${d.attempted ? "tried" : "skip"}→${d.succeeded ? "ok" : "—"}${d.outcome ? ` [${d.outcome}]` : ""}`;
          const meta = [
            d.bytesRead != null ? `${d.bytesRead} bytes read` : null,
            d.htmlTruncated ? "partial HTML" : null,
            d.partialHtmlParsed ? "parsed" : null,
            d.supplementFields?.length ? `fields: ${d.supplementFields.join(", ")}` : null,
          ]
            .filter(Boolean)
            .join("; ");
          return `${d.providerId} (${st})${d.message ? `: ${d.message}` : ""}${meta ? ` · ${meta}` : ""}${d.warn ? ` warning: ${d.warn}` : ""}`;
        })
      : undefined,
    sourceRetrievalUrlOnlyDetected: evidence.sourceRetrieval?.urlOnlyInputDetected === true ? true : undefined,
    sourceRetrievalSupplementMerged:
      evidence.sourceRetrieval?.supplementMergedBeforeExtraction === true ? true : undefined,
  };

  const hasAny =
    detail.evidenceProvenance ||
    detail.urlEnrichmentSourceLabel ||
    detail.sharedLink ||
    detail.usedSharedCaption ||
    detail.usedSharedTitle ||
    detail.usedPastedText ||
    detail.transcriptPresent ||
    detail.onScreenTextPresent ||
    (detail.visualIngredientLabels?.length ?? 0) > 0 ||
    (detail.visualCookingCueLabels?.length ?? 0) > 0 ||
    (detail.mediaProcessingNotes?.length ?? 0) > 0 ||
    (detail.serverMediaAssetIds?.length ?? 0) > 0 ||
    detail.intakeOrigin ||
    detail.intakeSourceAppId ||
    detail.intakeSourceAppLabel ||
    detail.multimodalStrengthTier ||
    detail.nativeMediaStagedFromExtension ||
    detail.nativeMediaUploadPartial ||
    (detail.structuredIngredientEstimatedCount != null && detail.structuredIngredientEstimatedCount > 0) ||
    (detail.structuredIngredientParsedWithQtyCount != null && detail.structuredIngredientParsedWithQtyCount > 0) ||
    (showShareCaptionDiagnostics && captionIntake != null) ||
    detail.shareCaptionLikelyTeaserOnly === true ||
    Boolean(detail.linkFirstEnrichmentHint) ||
    detail.nativeMediaStagedButUnprocessable === true ||
    detail.nativeHandoffFromAppGroupRelay === true ||
    detail.nativeHandoffSimulatorBuild === true ||
    detail.nativeHandoffManualResume === true ||
    (detail.multimodalPipelineRows?.length ?? 0) > 0 ||
    Boolean(detail.reconstructionPrimarySourcesNote) ||
    detail.nativeNoAppGroupMediaBlocked === true ||
    Boolean(detail.sourceRetrievalCanonicalUrl) ||
    detail.sourceRetrievalCacheHit === true ||
    Boolean(detail.sourceRetrievalSupplementStrength) ||
    detail.sourceRetrievalRecoveredCaptionLike === true ||
    (detail.sourceRetrievalProviderRows?.length ?? 0) > 0 ||
    detail.sourceRetrievalUrlOnlyDetected === true ||
    detail.sourceRetrievalSupplementMerged === true;

  if (!hasAny) return payload;

  return { ...payload, extractionEvidenceDetail: detail };
}
