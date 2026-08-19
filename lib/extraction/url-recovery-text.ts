import { hasAnyExtractableText, hasUsableExtractionText } from "@/lib/extraction/text-hints";

/**
 * Weak but non-empty text recovered from URL retrieval (OG, oEmbed, embedded JSON).
 * Enough to attempt extraction with low confidence — not a full verified caption.
 */
export function hasWeakUrlRecoveryText(s: string | undefined | null): boolean {
  const t = (s ?? "").trim();
  if (t.length < 20) return false;
  if (hasUsableExtractionText(t)) return true;
  if (
    /\[Linked page metadata|\[Instagram public oEmbed|\[Experimental social retrieval|\[TikTok public oEmbed/i.test(t)
  ) {
    return t.replace(/\[.*?\]/g, "").trim().length >= 24;
  }
  if (/\bIngredients?\b|\bMalzeme\b|\bsteps?\b|\brecipe\b/i.test(t) && t.length >= 32) return true;
  return false;
}

export function hasAnyPostRetrievalExtractableText(s: string | undefined | null): boolean {
  return hasAnyExtractableText(s) || hasWeakUrlRecoveryText(s);
}
