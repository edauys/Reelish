/**
 * Stable internal representation for ingredient lines (display stays string[] on RecipePayload).
 * Heuristic parse — upgrade with model output later.
 */

export interface StructuredIngredientLine {
  raw: string;
  amount?: string;
  unit?: string;
  name: string;
  preparation?: string;
  /** True when quantity was guessed or missing in source. */
  estimated?: boolean;
  /** 0–1 parse confidence; low when heuristic is unsure. */
  parseConfidence?: number;
}

const AMOUNT_UNIT =
  /^(\d+(?:\s*[\d/]+)?(?:\.\d+)?)\s*(cup|cups|tbsp|tablespoons?|tsp|teaspoons?|oz|lb|lbs|g|kg|ml|l|cloves?|large|medium|small|pinch|dash|slices?|stalks?|bunch|bunches?|pieces?|cans?|packages?)?\s*(.*)$/i;

/**
 * Parse a single human-readable ingredient line into structured fields.
 */
export function parseStructuredIngredientLine(line: string): StructuredIngredientLine {
  const raw = line.trim();
  if (!raw) {
    return { raw, name: "", parseConfidence: 0.2 };
  }

  let estimated = false;
  const qtyPattern = /\d|½|¼|⅓|⅔|⅛|⅜|⅝|⅞/;
  if (!qtyPattern.test(raw)) {
    estimated = true;
  }

  const paren = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  let main = raw;
  let prep: string | undefined;
  if (paren) {
    main = paren[1].trim();
    prep = paren[2].trim();
  }

  const m = main.match(AMOUNT_UNIT);
  if (m) {
    const amount = m[1]?.trim();
    const unit = m[2]?.trim();
    const rest = (m[3] ?? "").trim();
    const name = rest || main;
    return {
      raw,
      amount,
      unit,
      name: name || main,
      preparation: prep,
      estimated,
      parseConfidence: estimated ? 0.55 : 0.75,
    };
  }

  return {
    raw,
    name: main,
    preparation: prep,
    estimated,
    parseConfidence: estimated ? 0.5 : 0.7,
  };
}

export function structuredIngredientToDisplayLine(s: StructuredIngredientLine): string {
  if (s.raw.trim()) return s.raw.trim();
  const parts = [s.amount, s.unit, s.name].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  if (s.preparation) {
    return `${parts} (${s.preparation})`.trim();
  }
  return parts;
}

export function parseIngredientLinesToStructured(lines: string[]): StructuredIngredientLine[] {
  return lines.map(parseStructuredIngredientLine);
}
