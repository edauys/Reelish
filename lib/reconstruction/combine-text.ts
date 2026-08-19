import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import {
  clipTextForMultimodalPipeline,
  MAX_OCR_CHARS_MODEL,
  MAX_PRIMARY_TEXT_IN_MODEL,
  MAX_TRANSCRIPT_CHARS_MODEL,
} from "@/lib/reconstruction/limits";
import type { RecipeEvidence } from "@/lib/reconstruction/types";

/** Remove multimodal `###` section titles for caption-only heuristics (structured recipe detection). */
export function stripSectionHeadersForHeuristics(s: string): string {
  return s.replace(/^###\s+[^\n]+\n/gim, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function directiveForTier(
  tier: ReturnType<typeof assessMultimodalStrength>["tier"],
  primaryEmpty: boolean,
  minimalHint: boolean,
  /** Short iOS “See this Instagram post…” line + real multimodal sections — media evidence leads. */
  instagramTeaserWithMultimodal: boolean
): string {
  const base =
    "Merge all sections into ONE coherent recipe. Do not ignore transcript, OCR, or visual hints when they contain ingredients, amounts, or steps.";
  const teaserLead =
    instagramTeaserWithMultimodal
      ? " The “Share preview” caption block is often NOT the real post caption — when Transcript / On-screen text / visual sections contain concrete ingredients or steps, treat those as PRIMARY and the preview line only as optional context (e.g. dish name). "
      : " ";
  if (tier === "strong") {
    return `${base}${teaserLead}MULTIMODAL STRENGTH: STRONG. ${primaryEmpty ? "There is little or no caption — build the recipe primarily from transcript and on-screen text; use visual hints to fill gaps." : minimalHint ? "The caption may be only a title — treat transcript/OCR as the main recipe source where they contain structure." : "Use caption as context and enrich from audio/video evidence."} If transcript lists ingredients and OCR shows measurements (or vice versa), merge into one deduplicated ingredient list. Extract real ingredient lines with quantities when present in any section; avoid vague placeholders when measurements exist.`;
  }
  if (tier === "moderate") {
    return `${base}${teaserLead}MULTIMODAL STRENGTH: MODERATE. Cross-check sections; prefer OCR for on-screen lists and transcript for spoken order; deduplicate ingredients that appear in both; keep step order stable (spoken order unless OCR clearly shows numbered steps).`;
  }
  return `${base}${teaserLead}MULTIMODAL STRENGTH: WEAK. Be conservative; still extract any clear ingredient lines or steps from transcript/OCR; use honest low confidence when signals conflict or are sparse.`;
}

/**
 * Text passed to the structured extractor (OpenAI / heuristics).
 * - Text-only imports: unchanged string (backwards compatible).
 * - Multimodal: sectioned prompt so the model can weigh caption vs ASR vs OCR vs visual hints.
 */
export function combinedTextForExtractionModel(evidence: RecipeEvidence): string {
  const primary = clipTextForMultimodalPipeline(evidence.primaryText.trim(), MAX_PRIMARY_TEXT_IN_MODEL) ?? "";
  const hasMultimodalBody =
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0;

  if (!hasMultimodalBody) {
    return primary;
  }

  const strength = assessMultimodalStrength(evidence);
  const primaryEmpty = !primary;
  const minimalHint = evidence.minimalTextHintOnly === true || evidence.ingestionSource === "minimal_caption_hint";
  const instagramTeaserWithMultimodal =
    Boolean(primary.trim()) && looksLikeIosInstagramLinkTeaser(primary) && hasMultimodalBody;

  const captionHeading =
    looksLikeIosInstagramLinkTeaser(primary) || (minimalHint && primary.length > 0 && primary.length < 420)
      ? "### Share preview / caption text (may be incomplete)"
      : "### Caption / recipe text";

  const titleLine = evidence.sharedTitle?.trim()
    ? `\nShare sheet title: ${evidence.sharedTitle.trim()}`
    : "";
  const urlContext =
    evidence.sourceUrl?.trim() && !primary.includes(evidence.sourceUrl.trim())
      ? `\nPost URL (context): ${evidence.sourceUrl.trim()}`
      : "";

  const primaryBlock =
    primary ||
    "(No caption text was available — use transcript, on-screen text, and visual hints below.)";
  const captionSection = `${captionHeading}\n${primaryBlock}${titleLine}${urlContext}`;

  const trClip = clipTextForMultimodalPipeline(evidence.transcriptText?.trim(), MAX_TRANSCRIPT_CHARS_MODEL);
  const transcriptSection = trClip?.trim() ? `### Transcript (speech / audio)\n${trClip.trim()}` : "";

  const ocrClip = clipTextForMultimodalPipeline(evidence.ocrText?.trim(), MAX_OCR_CHARS_MODEL);
  const ocrSection = ocrClip?.trim()
    ? `### On-screen text (OCR from video frames)\n${ocrClip.trim()}\n(If this block looks like a list of ingredients or steps, treat it as structured recipe text, not background noise.)`
    : "";

  const visualIngSection = evidence.visualIngredientHints?.length
    ? `### Visual ingredient hints (from frames)\n${evidence.visualIngredientHints
        .map((h) => `- ${h.label}${h.confidence != null ? ` (vision conf. ${h.confidence.toFixed(2)})` : ""}`)
        .join("\n")}`
    : "";

  const visualCueSection = evidence.visualCookingCues?.length
    ? `### Visual cooking cues (from frames)\n${evidence.visualCookingCues
        .map((c) => `- ${c.label}${c.confidence != null ? ` (vision conf. ${c.confidence.toFixed(2)})` : ""}`)
        .join("\n")}`
    : "";

  const multimodalSections = [transcriptSection, ocrSection, visualIngSection, visualCueSection].filter(Boolean);

  const parts: string[] = [];

  if (evidence.shareIntake?.combinedShareHandoff === true) {
    parts.push(
      "### Share handoff (single import)\n" +
        "Link, text, and any attached media below came from one Share → Reelish action. " +
        "When the caption looks like a short iOS/Instagram preview line, treat transcript and on-screen text as the main recipe sources."
    );
  }

  parts.push(
    `### Reconstruction directive\n${directiveForTier(strength.tier, primaryEmpty, minimalHint, instagramTeaserWithMultimodal)}\nAssessment: ${strength.summaryLine}`
  );

  if (instagramTeaserWithMultimodal) {
    parts.push(...multimodalSections);
    parts.push(
      `${captionSection}\n\n(Ordering: multimodal evidence is listed before this block so it takes precedence over the short iOS preview line.)`
    );
  } else {
    parts.push(captionSection);
    parts.push(...multimodalSections);
  }

  return parts.join("\n\n");
}
