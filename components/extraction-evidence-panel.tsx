import type { ShareIntakeOrigin } from "@/lib/share/types";
import type { RecipePayload } from "@/types/recipe";

function intakeOriginLabel(o: ShareIntakeOrigin): string {
  switch (o) {
    case "web_share_target":
      return "Web share target (PWA)";
    case "manual_import":
      return "Manual import";
    case "native_share_extension":
      return "Native share (iOS)";
    case "programmatic":
      return "Programmatic / test";
    default:
      return o;
  }
}

/**
 * Transparency UI: what was shared vs what multimodal channels contributed.
 */
export function ExtractionEvidencePanel({ recipe }: { recipe: RecipePayload }) {
  const d = recipe.extractionEvidenceDetail;

  const rows: { label: string; value: string; sub?: string }[] = [];

  if (d?.evidenceProvenanceTitle) {
    rows.push({
      label: "Evidence mix",
      value: d.evidenceProvenanceTitle,
      sub: d.evidenceProvenanceDetail,
    });
  }
  if (
    d?.sourceRetrievalCanonicalUrl ||
    d?.sourceRetrievalCacheHit ||
    d?.sourceRetrievalSupplementStrength ||
    d?.sourceRetrievalUrlOnlyDetected ||
    d?.sourceRetrievalSupplementMerged
  ) {
    rows.push({
      label: "Source URL retrieval",
      value: [
        d.sourceRetrievalUrlOnlyDetected ? "URL-only import (no caption/media in handoff)" : null,
        d.sourceRetrievalSupplementMerged
          ? "Recovered text merged before extraction"
          : d.sourceRetrievalUrlOnlyDetected
            ? "No supplement merged after retrieval"
            : null,
        d.sourceRetrievalCacheHit ? "Used cached retrieval for canonical URL" : "Live public fetch attempted this run",
        d.sourceRetrievalSupplementStrength ? `Supplement strength: ${d.sourceRetrievalSupplementStrength}` : null,
        d.sourceRetrievalRecoveredCaptionLike ? "Caption-like public block recovered (still verify)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      sub: d.sourceRetrievalCanonicalUrl ? `Canonical: ${d.sourceRetrievalCanonicalUrl}` : undefined,
    });
  }
  if ((d?.sourceRetrievalProviderRows?.length ?? 0) > 0) {
    rows.push({
      label: "Retrieval providers (diagnostics)",
      value: `${d!.sourceRetrievalProviderRows!.length} step(s)`,
      sub: d!.sourceRetrievalProviderRows!.join("\n"),
    });
  }
  if (d?.reconstructionPrimarySourcesNote) {
    rows.push({
      label: "Likely primary source (heuristic)",
      value: d.reconstructionPrimarySourcesNote,
    });
  }
  if (d?.urlEnrichmentSourceLabel) {
    rows.push({
      label: "URL enrichment",
      value: d.urlEnrichmentSourceLabel,
      sub:
        d.urlEnrichmentContributed === true
          ? "Weak public metadata or experimental oEmbed was merged into extraction input — verify against media."
          : "No supplemental text was merged (metadata unavailable, disabled, or Instagram blocked the request).",
    });
  }
  if (d?.intakeOrigin) {
    rows.push({
      label: "Import handoff",
      value: intakeOriginLabel(d.intakeOrigin),
      sub: [d.intakeReceivedAt ? `Received: ${d.intakeReceivedAt}` : null, d.intakeSessionId ? `Session: ${d.intakeSessionId.slice(0, 8)}…` : null]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (d?.intakeInferredPlatform && d.intakeInferredPlatform !== "unknown") {
    rows.push({ label: "Detected platform", value: d.intakeInferredPlatform });
  }
  if (d?.intakeSourceAppLabel || d?.intakeSourceAppId) {
    rows.push({
      label: "Source app (share)",
      value: d.intakeSourceAppLabel?.trim() || d.intakeSourceAppId || "",
      sub: d.intakeSourceAppLabel && d.intakeSourceAppId ? d.intakeSourceAppId : undefined,
    });
  }

  if (d?.sharedLink) {
    rows.push({ label: "Shared link", value: d.sharedLink });
  }
  if (d?.usedSharedCaption) {
    rows.push({
      label: "Shared caption",
      value: "Used in extraction",
      sub: [
        d.shareCaptionCharCount != null ? `${d.shareCaptionCharCount} characters received` : null,
        d.shareCaptionLikelyTeaserOnly ? "Looks like the short iOS preview line (not the full Instagram caption)" : null,
        d.shareCaptionIntakeDetail,
        d.captionTextSnippet ? `“${d.captionTextSnippet}”` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  if (d?.linkFirstEnrichmentHint) {
    rows.push({
      label: "Instagram link + thin share text",
      value: "Optional server-side oEmbed (gated)",
      sub: d.linkFirstEnrichmentHint,
    });
  }
  if ((d?.multimodalPipelineRows?.length ?? 0) > 0) {
    rows.push({
      label: "Multimodal pipeline (media → transcript → vision)",
      value: `${d!.multimodalPipelineRows!.length} step(s) recorded`,
      sub: d!.multimodalPipelineRows!.join("\n"),
    });
  }
  if (d?.nativeNoAppGroupMediaBlocked) {
    rows.push({
      label: "Shared media (native)",
      value: "Not staged — Personal Team / no App Group",
      sub:
        "iOS showed image or video in the share sheet, but this build has no shared container to copy files for upload. Transcript and OCR need staged media or an App Groups build (see docs/PERSONAL_TEAM_IOS_FALLBACK.md). This is an Apple provisioning limitation, not missing Reelish logic.",
    });
  }
  if (d?.nativeHandoffFromAppGroupRelay || d?.nativeHandoffSimulatorBuild || d?.nativeHandoffManualResume) {
    rows.push({
      label: "Native handoff path",
      value: [
        d.nativeHandoffManualResume ? "Manual resume (App Group replay)" : null,
        d.nativeHandoffFromAppGroupRelay ? "Restored via App Group relay" : null,
        d.nativeHandoffSimulatorBuild ? "Simulator-target share build" : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Native",
      sub: d.nativeHandoffManualResume
        ? "You opened Reelish after the share; the pending handoff was replayed from shared storage."
        : d.nativeHandoffFromAppGroupRelay
          ? "Full query was merged from App Group after a short wake URL (expected on Simulator or when URLs are very long)."
          : undefined,
    });
  }
  if (d?.nativeMediaStagedButUnprocessable) {
    rows.push({
      label: "Native staged media",
      value: "Received but not processed as photo/video/audio",
      sub:
        "Files uploaded, but MIME/type did not map to a supported image, video, or audio pipeline (often generic application/octet-stream). Re-share as Photos or paste caption.",
    });
  }
  if (d?.usedSharedTitle) {
    rows.push({ label: "Shared title", value: "Used in extraction" });
  }
  if (d?.usedPastedText) {
    rows.push({ label: "Main text box", value: "Pasted recipe/caption text used" });
  }
  if (d?.transcriptPresent) {
    rows.push({
      label: "Audio transcript",
      value: "Used (Whisper)",
      sub: d.transcriptPreview ? `“${d.transcriptPreview}${d.transcriptPreview.length >= 360 ? "…" : ""}”` : undefined,
    });
  }
  if (d?.onScreenTextPresent) {
    rows.push({
      label: "On-screen text (OCR)",
      value: "Used from frames",
      sub: d.onScreenTextPreview ? `“${d.onScreenTextPreview}${d.onScreenTextPreview.length >= 360 ? "…" : ""}”` : undefined,
    });
  }
  if (d && (d.visualIngredientLabels?.length ?? 0) > 0) {
    rows.push({
      label: "Visual ingredient hints (frames)",
      value: d.visualIngredientLabels!.join(", "),
      sub: "Reinforces identity when labels match transcript/OCR",
    });
  }
  if (d && (d.visualCookingCueLabels?.length ?? 0) > 0) {
    rows.push({
      label: "Visual cooking cues",
      value: d.visualCookingCueLabels!.join(", "),
    });
  }
  if ((d?.serverMediaAssetIds?.length ?? 0) > 0) {
    const ids = d!.serverMediaAssetIds!;
    rows.push({
      label: d?.nativeMediaStagedFromExtension ? "Media (iOS Share)" : "Server media",
      value: `${ids.length} file(s) processed`,
      sub: [
        d?.nativeMediaStagedFromExtension
          ? "Staged in App Group, uploaded via /api/media/upload — transcript / OCR / vision when applicable"
          : null,
        ids.map((id) => id.slice(0, 8)).join(", ") + "…",
      ]
        .filter(Boolean)
        .join(" · "),
    });
  } else if (d?.nativeMediaStagedFromExtension) {
    rows.push({
      label: "Media (iOS Share)",
      value: "Share extension handoff",
      sub: "Staged via App Group; used when media ids are present in extraction",
    });
  }
  if (d?.nativeMediaUploadPartial) {
    rows.push({
      label: "Native media upload",
      value: "Partial — some files skipped or failed",
      sub: "Often size limits or network; remaining files were still processed",
    });
  }
  if (
    (d?.structuredIngredientEstimatedCount ?? 0) > 0 ||
    (d?.structuredIngredientParsedWithQtyCount ?? 0) > 0
  ) {
    const est = d!.structuredIngredientEstimatedCount ?? 0;
    const parsed = d!.structuredIngredientParsedWithQtyCount ?? 0;
    rows.push({
      label: "Ingredient lines (parse)",
      value: `${parsed} with amounts · ${est} estimated / no clear qty`,
      sub: "Heuristic split from extracted lines — not a second recipe source",
    });
  }
  if ((d?.mediaProcessingNotes?.length ?? 0) > 0) {
    rows.push({
      label: "Media processing",
      value: d!.mediaProcessingNotes!.join(" · "),
    });
  }
  if (d?.multimodalStrengthTier && d.multimodalStrengthTier !== "none") {
    rows.push({
      label: "Multimodal signal strength",
      value: d.multimodalStrengthTier,
      sub: d.multimodalStrengthSummary,
    });
  }

  if (!rows.length && !recipe.evidenceSummary) return null;

  return (
    <div className="rounded-xl border border-reelish-border/90 bg-reelish-bg/50 px-4 py-3 text-xs text-reelish-muted">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-reelish-cream/80">Evidence Reelish used</p>
      <ul className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="text-reelish-cream/75">{r.label}: </span>
            <span className="text-reelish-cream/95">{r.value}</span>
            {r.sub ? (
              <span className="mt-0.5 block whitespace-pre-line text-[11px] text-reelish-muted/90">{r.sub}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {recipe.evidenceSummary ? (
        <p className="mt-3 border-t border-reelish-border/60 pt-3 text-[11px] leading-relaxed text-reelish-muted">
          {recipe.evidenceSummary}
        </p>
      ) : null}
    </div>
  );
}
