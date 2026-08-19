import { looksLikeStructuredRecipeCaption } from "@/lib/extraction/recipe-caption-detect";

/**
 * Heuristics for whether user-provided text is enough to run extraction.
 * "Full" text: recipe-like or long caption.
 * "Minimal hint": short dish name / title-only — allowed with low confidence + warnings (not url-only insufficient).
 */

/** Full usable text: long enough or clearly recipe-related (including short multilingual measured captions). */
export function hasUsableExtractionText(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  if (t.length === 0) return false;
  if (looksLikeStructuredRecipeCaption(t)) return true;
  if (t.length >= 48) return true;
  if (/\n/.test(t) && t.length >= 24) return true;
  if (/\d/.test(t) || /\p{Nd}/u.test(t)) return true;
  return /ingredient|ingredients|recipe|steps?|instructions?|cup|tbsp|tsp|oz|ml|g\b|cook|bake|mix|chop|재료|조리|Malzeme|malzeme|ingréd|ingredientes|kaşık|bardak|adet|큰술|작은술|만드는|\d+\s*adet\s+için/i.test(
    t
  );
}

/**
 * Very short but non-empty text that may be a dish name or micro-caption (e.g. "Creamy Tuscan chicken").
 * Excludes strings already classified as "full" usable text.
 */
export function hasMinimalRecipeHint(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  if (!t || t.length < 3 || t.length > 120) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (looksLikeStructuredRecipeCaption(t)) return false;
  if (hasUsableExtractionText(t)) return false;

  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && t.replace(/\s/g, "").length >= 6) return true;
  if (words.length === 1 && /^[\p{L}][\p{L}\-''’]{3,}$/u.test(words[0]!)) return true;
  return false;
}

export function hasAnyExtractableText(s: string | undefined | null): boolean {
  return hasUsableExtractionText(s) || hasMinimalRecipeHint(s);
}
