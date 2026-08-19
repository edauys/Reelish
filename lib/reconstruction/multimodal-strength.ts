import type { RecipeEvidence } from "@/lib/reconstruction/types";
import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";

export type MultimodalStrengthTier = "strong" | "moderate" | "weak" | "none";

export interface MultimodalStrengthAssessment {
  tier: MultimodalStrengthTier;
  /** 0–1 rough signal density for transcript. */
  transcriptScore: number;
  /** 0–1 rough signal density for OCR/on-screen text. */
  ocrScore: number;
  /** 0–1 from visual hints (count + confidence). */
  visualScore: number;
  /** Weighted blend for tiering (not the same as product confidence). */
  blend: number;
  /** One line for UI / evidence summary. */
  summaryLine: string;
}

const RECIPE_WORD_RE =
  /ingredient|malzeme|recipe|gram|tbsp|tsp|cup|ml|oz|add|mix|boil|bake|simmer|chop|heat|minute|kaşık|bardak|adet|재료|만드는|조리|설탕|밀가루/i;

function scoreTranscript(text: string | undefined): number {
  const t = text?.trim();
  if (!t) return 0;
  let s = Math.min(0.55, t.length / 1200);
  if (/\d/.test(t) || /\p{Nd}/u.test(t)) s += 0.18;
  if (RECIPE_WORD_RE.test(t)) s += 0.15;
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 4).length;
  s += Math.min(0.22, lines * 0.04);
  if (t.length > 400) s += 0.12;
  return Math.min(1, s);
}

function scoreOcr(text: string | undefined): number {
  const t = text?.trim();
  if (!t) return 0;
  let s = Math.min(0.45, t.length / 500);
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 2);
  s += Math.min(0.28, lines.length * 0.06);
  if (/\d/.test(t) || /\p{Nd}/u.test(t)) s += 0.18;
  if (RECIPE_WORD_RE.test(t) || /[-*•]\s*\S/m.test(t) || /^\s*\d+[\).]/m.test(t)) s += 0.2;
  return Math.min(1, s);
}

function scoreVisual(evidence: RecipeEvidence): number {
  const hi = evidence.visualIngredientHints ?? [];
  const cu = evidence.visualCookingCues ?? [];
  if (hi.length === 0 && cu.length === 0) return 0;
  let acc = 0;
  for (const h of hi) acc += h.confidence ?? 0.62;
  for (const c of cu) acc += c.confidence ?? 0.55;
  const n = hi.length + cu.length;
  const avg = acc / Math.max(n, 1);
  const breadth = Math.min(0.18, n * 0.035);
  return Math.min(1, avg * 0.85 + breadth);
}

/**
 * Heuristic assessment of how much usable recipe signal exists beyond the primary caption.
 * Drives prompt directives and confidence calibration (not a user-facing guarantee).
 */
export function assessMultimodalStrength(evidence: RecipeEvidence): MultimodalStrengthAssessment {
  const tr = scoreTranscript(evidence.transcriptText);
  const oc = scoreOcr(evidence.ocrText);
  const vi = scoreVisual(evidence);
  const hasAny = tr > 0.02 || oc > 0.02 || vi > 0.02;
  if (!hasAny) {
    return {
      tier: "none",
      transcriptScore: tr,
      ocrScore: oc,
      visualScore: vi,
      blend: 0,
      summaryLine: "No transcript, on-screen text, or visual hints were available from media.",
    };
  }

  const blend = tr * 0.42 + oc * 0.38 + vi * 0.2;

  const primary = evidence.primaryText?.trim() ?? "";
  const primaryWeak =
    primary.length < 100 ||
    evidence.minimalTextHintOnly === true ||
    evidence.ingestionSource === "minimal_caption_hint" ||
    (primary.length > 0 && looksLikeIosInstagramLinkTeaser(primary));

  let tier: MultimodalStrengthTier;
  if (blend >= 0.52 || (tr >= 0.45 && oc >= 0.35) || oc >= 0.58 || (tr >= 0.55 && evidence.transcriptText && evidence.transcriptText.length > 350)) {
    tier = "strong";
  } else if (blend >= 0.28 || tr >= 0.28 || oc >= 0.25) {
    tier = "moderate";
  } else {
    tier = "weak";
  }

  // Thin caption but complementary transcript + OCR: upgrade tier so prompts and calibration stay honest-not-pessimistic.
  if (primaryWeak && tr >= 0.3 && oc >= 0.32 && tier === "weak") {
    tier = "moderate";
  }
  if (primaryWeak && tr >= 0.38 && oc >= 0.4 && tier === "moderate") {
    tier = "strong";
  }

  const parts: string[] = [];
  if (tr > 0.08) parts.push(`spoken transcript (${(tr * 100).toFixed(0)}% signal)`);
  if (oc > 0.08) parts.push(`on-screen text (${(oc * 100).toFixed(0)}% signal)`);
  if (vi > 0.08) parts.push(`visual cues (${(vi * 100).toFixed(0)}% signal)`);

  const complementNote =
    primaryWeak && tr > 0.08 && oc > 0.08
      ? " Caption is short — transcript and on-screen text were cross-checked for ingredients and steps."
      : "";

  const summaryLine =
    tier === "strong"
      ? `Strong multimodal evidence — ${parts.join(", ")}. Reconstruction should prioritize these sources when the caption is thin.${complementNote}`
      : tier === "moderate"
        ? `Moderate multimodal evidence — ${parts.join(", ")}. Merge carefully; deduplicate overlapping lines from speech vs on-screen text.${complementNote}`
        : `Limited multimodal evidence — ${parts.join(", ") || "sparse signals"}. Expect lower confidence unless caption adds detail.`;

  return { tier, transcriptScore: tr, ocrScore: oc, visualScore: vi, blend, summaryLine };
}

export function hasStrongMultimodalEvidence(a: MultimodalStrengthAssessment): boolean {
  return a.tier === "strong";
}

export function hasWeakMultimodalEvidence(a: MultimodalStrengthAssessment): boolean {
  return a.tier === "weak" || a.tier === "none";
}
