import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import type { RecipeEvidence } from "@/lib/reconstruction/types";
import type { RecipePayload } from "@/types/recipe";

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.55;
  return Math.min(1, Math.max(0, n));
}

function hasMultimodalSignals(evidence: RecipeEvidence): boolean {
  return (
    Boolean(evidence.transcriptText?.trim()) ||
    Boolean(evidence.ocrText?.trim()) ||
    (evidence.visualIngredientHints?.length ?? 0) > 0 ||
    (evidence.visualCookingCues?.length ?? 0) > 0
  );
}

/**
 * Down-weights or up-weights model-reported confidence using evidence tier and multimodal strength.
 */
export function calibrateRecipePayloadConfidence(
  payload: RecipePayload,
  evidence: RecipeEvidence
): RecipePayload {
  let extraction = payload.extractionConfidence;
  let measurement = payload.measurementConfidence;

  if (extraction == null) extraction = 0.72;
  if (measurement == null) measurement = 0.72;

  extraction = clamp01(extraction);
  measurement = clamp01(measurement);

  const primaryEmpty = !evidence.primaryText.trim();
  const mm = hasMultimodalSignals(evidence);
  const strength = assessMultimodalStrength(evidence);

  if (primaryEmpty && mm) {
    if (strength.tier === "strong") {
      extraction = Math.max(extraction, 0.62);
      measurement = Math.max(measurement, 0.55);
      extraction = Math.min(extraction, 0.86);
      measurement = Math.min(measurement, 0.82);
    } else if (strength.tier === "moderate") {
      extraction = Math.max(extraction, 0.48);
      measurement = Math.max(measurement, 0.42);
      extraction = Math.min(extraction, 0.74);
      measurement = Math.min(measurement, 0.68);
    } else {
      extraction = Math.min(extraction, 0.52);
      measurement = Math.min(measurement, 0.48);
    }
  } else if (mm) {
    if (strength.tier === "strong") {
      extraction = Math.min(Math.max(extraction, extraction * 0.98), 0.9);
      measurement = Math.min(Math.max(measurement, measurement * 0.97), 0.88);
    } else if (strength.tier === "moderate") {
      extraction = Math.min(extraction, extraction * 0.94);
      measurement = Math.min(measurement, measurement * 0.92);
    } else {
      extraction = Math.min(extraction, extraction * 0.92);
      measurement = Math.min(measurement, measurement * 0.9);
    }
  }

  const lowVisualConf =
    (evidence.visualIngredientHints ?? []).some((h) => (h.confidence ?? 1) < 0.45) ||
    (evidence.visualCookingCues ?? []).some((c) => (c.confidence ?? 1) < 0.45);
  if (lowVisualConf && strength.tier !== "strong") {
    extraction = Math.min(extraction, 0.62);
  }

  if (evidence.transcriptConfidence != null && evidence.transcriptConfidence < 0.45) {
    if (strength.tier === "strong" && (evidence.ocrText?.trim() || (evidence.visualIngredientHints?.length ?? 0) > 0)) {
      extraction = Math.min(extraction, 0.72);
    } else {
      extraction = Math.min(extraction, 0.58);
    }
  }

  const minimalOnly =
    evidence.minimalTextHintOnly === true || evidence.ingestionSource === "minimal_caption_hint";
  if (minimalOnly && !mm) {
    extraction = Math.min(extraction, 0.48);
    measurement = Math.min(measurement, 0.42);
  } else if (minimalOnly && mm) {
    if (strength.tier === "strong") {
      extraction = Math.max(0.52, Math.min(extraction, 0.78));
      measurement = Math.max(0.48, Math.min(measurement, 0.74));
    } else if (strength.tier === "moderate") {
      extraction = Math.min(extraction, 0.62);
      measurement = Math.min(measurement, 0.56);
    } else {
      extraction = Math.min(extraction, 0.55);
      measurement = Math.min(measurement, 0.5);
    }
  }

  return {
    ...payload,
    extractionConfidence: extraction,
    measurementConfidence: measurement,
  };
}
