/**
 * Distinguishes structured recipe captions (measurable, multilingual) from
 * dish-name-only hints and light lifestyle/story text — without scraping.
 */

/** Any decimal digit including Unicode (e.g. other numeral systems in captions). */
export function hasNumericSignal(s: string): boolean {
  return /\d/.test(s) || /\p{Nd}/u.test(s);
}

/** Turkish recipe units and yield phrases (common social captions). Avoid bare “için” (too common in prose). */
const TR_UNIT_OR_YIELD =
  /çay\s*bardağı|ç\.?\s*b\.?|yemek\s*kaşığı|y\.?\s*k\.?|tatlı\s*kaşığı|t\.?\s*k\.?|çay\s*kaşığı|ç\.?\s*k\.?|su\s*bardağı|dessert\s*kaşığı|fincan|bardak|kaşık|gram(?:lık)?|\bg\b|\bml\b|\badet\b|kişilik|porsiyon|servis|dilim|yarım|½|¼|⅓|⅔|⅛|Malzeme(?:ler)?|malzeme(?:ler)?|Harcı\s+için|\d+\s*adet\s+için|(?:^|\n)\s*Malzeme/i;

/** Korean recipe signals. */
const KR_RECIPE =
  /재료|만드는\s*법|만드는방법|조리(?:법|순서)?|큰술|작은술|밥술|컵|큰\s*숟가락|작은\s*숟가락|\d+\s*(g|ml|mL)\b|[\d.]+\s*인분|인\s*분|스텝|준비물/i;

/** English / generic recipe structure. */
const GENERIC_RECIPE =
  /ingredients?|instructions?|directions?|method|yield|servings?|makes\s+\d+|prep\s*time|cook\s*time|tbsp\.?|tsp\.?|cup|oz\.?\b|lb\.?\b|grams?|milliliters?/i;

const FRACTION_OR_HALF = /½|¼|⅓|⅔|⅛|⅜|⅝|⅞|yarım|bir\s*yarım|1\s*\/\s*2|1\s*\/\s*3/i;

function lineHasIngredientShape(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  if (TR_UNIT_OR_YIELD.test(t)) return true;
  if (KR_RECIPE.test(t)) return true;
  if (/^[-*•]\s*\S/.test(t) && hasNumericSignal(t)) return true;
  if (/^\d+[\).]\s+/.test(t) && (hasNumericSignal(t) || FRACTION_OR_HALF.test(t))) return true;
  return /^[-*•\d].{5,}/.test(t) && (TR_UNIT_OR_YIELD.test(line) || /\d+\s*(g|ml|gr)\b/i.test(t));
}

function countIngredientLikeLines(s: string): number {
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let n = 0;
  for (const line of lines) {
    if (lineHasIngredientShape(line)) n++;
  }
  return n;
}

/**
 * True when the caption likely contains a measurable, structured recipe
 * (ingredients/steps/yield) in any supported language — including short captions
 * that fail a naive "48 characters" rule.
 */
export function looksLikeStructuredRecipeCaption(s: string | null | undefined): boolean {
  const t = (s ?? "").trim();
  if (!t) return false;

  if (TR_UNIT_OR_YIELD.test(t) && (hasNumericSignal(t) || FRACTION_OR_HALF.test(t))) return true;
  if (KR_RECIPE.test(t) && (hasNumericSignal(t) || FRACTION_OR_HALF.test(t))) return true;
  if (GENERIC_RECIPE.test(t) && hasNumericSignal(t)) return true;

  const ingLines = countIngredientLikeLines(t);
  if (ingLines >= 2) return true;

  if (/\d+\s*adet\s*için|için\s*[:：]?\s*\d+|(\d+)\s*(?:kişilik|kişi)/i.test(t) && ingLines >= 1) return true;
  if (/(?:^|\n)\s*Malzeme(?:ler)?\s*[:(]/i.test(t) || /(?:^|\n)\s*Harcı\s+için/i.test(t)) return true;

  if (t.split(/\r?\n/).filter((l) => l.trim().length > 0).length >= 4 && ingLines >= 1 && hasNumericSignal(t)) {
    return true;
  }

  const listLines = t.split(/\r?\n/).filter((l) => /^\s*(?:[-*•]|\d+[\).])\s+\S/.test(l));
  if (listLines.length >= 2 && hasNumericSignal(t)) return true;

  return false;
}

export type CaptionExtractionClass = "structured_recipe" | "minimal_dish" | "lifestyle_or_ambiguous";

/**
 * For routing and copy — not a model replacement. "lifestyle" long text may still be full extraction input.
 */
export function classifyCaptionForExtraction(s: string | null | undefined): CaptionExtractionClass {
  const t = (s ?? "").trim();
  if (!t) return "lifestyle_or_ambiguous";
  if (looksLikeStructuredRecipeCaption(t)) return "structured_recipe";
  const short = t.length <= 120 && t.split(/\s+/).filter(Boolean).length <= 8;
  if (short && !hasNumericSignal(t) && !TR_UNIT_OR_YIELD.test(t) && !KR_RECIPE.test(t)) {
    return "minimal_dish";
  }
  return "lifestyle_or_ambiguous";
}
