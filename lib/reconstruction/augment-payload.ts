import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import type { EvidenceModality, RecipeEvidence } from "@/lib/reconstruction/types";
import type { RecipePayload } from "@/types/recipe";

function modalitiesUsed(evidence: RecipeEvidence): EvidenceModality[] {
  const m: EvidenceModality[] = [];
  if (evidence.sourceUrl) m.push("url");
  if (evidence.captionText?.trim()) m.push("caption");
  if (evidence.pastedRecipeText?.trim()) m.push("pasted");
  if (evidence.sharedTitle?.trim()) m.push("title");
  if (evidence.transcriptText?.trim()) m.push("transcript");
  if (evidence.ocrText?.trim()) m.push("ocr");
  if ((evidence.visualIngredientHints?.length ?? 0) > 0) m.push("visual_ingredients");
  if ((evidence.visualCookingCues?.length ?? 0) > 0) m.push("visual_actions");
  return m;
}

function hasMultimodalBeyondCaption(evidence: RecipeEvidence): boolean {
  return (
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0
  );
}

function mergeUnique(base: string[] | undefined, extra: string[]): string[] {
  const seen = new Set(base ?? []);
  const out = [...(base ?? [])];
  for (const x of extra) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function modalityLabel(mod: EvidenceModality): string {
  switch (mod) {
    case "url":
      return "saved link";
    case "caption":
      return "shared caption";
    case "pasted":
      return "pasted recipe text";
    case "title":
      return "shared title";
    case "transcript":
      return "audio transcript";
    case "ocr":
      return "on-screen text";
    case "visual_ingredients":
      return "visual ingredient hints";
    case "visual_actions":
      return "visual cooking cues";
    default:
      return mod;
  }
}

function buildEvidenceSummary(evidence: RecipeEvidence, mods: EvidenceModality[], multimodal: boolean): string {
  const nonUrl = mods.filter((x) => x !== "url");
  const labels = nonUrl.map(modalityLabel);
  const list = labels.length ? labels.join(", ") : "text input";
  const mm = assessMultimodalStrength(evidence);

  if (!multimodal) {
    return `Evidence used: ${list}. Shared media (when present) is processed automatically; add text below only if the share had no usable caption or files.`;
  }

  const primaryEmpty = !evidence.primaryText.trim();
  if (primaryEmpty) {
    if (mm.tier === "strong") {
      return `Evidence used: ${list}. ${mm.summaryLine} Recipe structure was inferred mainly from transcript, on-screen text, and/or visual cues.`;
    }
    return `Evidence used: ${list}. Recipe reconstructed primarily from audio transcript and/or video frames (no usable caption was available). ${mm.summaryLine}`;
  }

  return `Evidence used: ${list}. Reelish merged caption/recipe text with transcript, on-screen text, and/or visual cues. ${mm.tier !== "none" ? mm.summaryLine : ""}`;
}

function buildReconstructionWarnings(payload: RecipePayload, evidence: RecipeEvidence, multimodal: boolean): string[] {
  const w: string[] = [];

  const lowMeasure = payload.measurementConfidence != null && payload.measurementConfidence < 0.55;
  const lowExtraction = payload.extractionConfidence != null && payload.extractionConfidence < 0.55;
  const primaryEmpty = !evidence.primaryText.trim();
  const minimalCaption =
    evidence.ingestionSource === "minimal_caption_hint" || evidence.minimalTextHintOnly === true;
  const strength = assessMultimodalStrength(evidence);

  if (minimalCaption && strength.tier !== "strong") {
    w.push(
      "Only a short caption or dish name was available — quantities and steps may be placeholders unless media provided stronger signals."
    );
  }

  if (multimodal) {
    if (primaryEmpty) {
      if (strength.tier === "strong") {
        w.push(
          "No caption text — recipe built from transcript, on-screen text, and/or video cues (amounts and order follow those sources)."
        );
      } else {
        w.push("Recipe reconstructed from transcript, on-screen text, and/or visual cues (no caption text).");
      }
    } else {
      w.push("Recipe reconstructed from caption or pasted text together with transcript, on-screen text, and/or visual cues.");
    }
    if (strength.tier !== "strong") {
      w.push("Some ingredients may have been inferred from audio or visual evidence.");
    } else {
      w.push("Where sources agreed, ingredients and steps were aligned across transcript, OCR, and visuals; remaining gaps may be estimated.");
    }
  }

  if (lowMeasure || (multimodal && strength.tier !== "strong")) {
    w.push("Some ingredient quantities were estimated.");
  }

  if (multimodal || lowExtraction || primaryEmpty) {
    w.push("This recipe may differ from the creator’s exact version.");
  }

  return w;
}

/**
 * Attach reconstruction transparency: evidence summary + warnings, merged into extraction warnings for existing UI.
 */
export function augmentPayloadWithReconstruction(
  payload: RecipePayload,
  evidence: RecipeEvidence
): RecipePayload {
  const mods = modalitiesUsed(evidence);
  const multimodal = hasMultimodalBeyondCaption(evidence);

  const evidenceSummary = buildEvidenceSummary(evidence, mods, multimodal);
  const reconstructionWarnings = buildReconstructionWarnings(payload, evidence, multimodal);
  const mediaNotes = evidence.mediaProcessingNotes ?? [];

  return {
    ...payload,
    evidenceSummary,
    ...(reconstructionWarnings.length ? { reconstructionWarnings } : {}),
    extractionWarnings: mergeUnique(
      mergeUnique(payload.extractionWarnings, reconstructionWarnings),
      mediaNotes
    ),
  };
}
