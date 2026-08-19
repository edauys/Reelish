import { normalizeRecipeOutputLanguageCode } from "@/lib/languages";
import { buildInsufficientUrlRecipe } from "@/lib/extraction/ingestion";
import { looksLikeStructuredRecipeCaption } from "@/lib/extraction/recipe-caption-detect";
import type { PreferredLanguage, RecipePayload } from "@/types/recipe";
import { guessSourceLanguageCode } from "@/lib/extraction/detect-language";
import { detectSourceFromUrl, inferCreatorHandleFromUrl } from "@/lib/extraction/url-meta";

const URL_PATTERN = /^https?:\/\//i;

/** Strip multimodal section headers so offline parsing sees continuous text. */
function flattenCombinedExtractionText(raw: string): string {
  if (!raw.includes("###")) return raw;
  return raw
    .replace(/^###\s+[^\n]+\n/gim, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeLines(text: string): string[] {
  const withBreaks = text.replace(/\s*•\s*/g, "\n").replace(/\s*·\s*/g, "\n");
  return withBreaks
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function looksLikeIngredient(line: string): boolean {
  const t = line.trim();
  if (/^[-•*]/.test(t) && /\d|\p{Nd}|½|¼|⅓|yarım/u.test(t)) return true;
  return (
    /\d+\s*(cup|tbsp|tsp|oz|lb|g|gram|ml|clove|large|medium|adet)\b/i.test(t) ||
    /çay\s*bardağı|yemek\s*kaşığı|tatlı\s*kaşığı|çay\s*kaşığı|su\s*bardağı|fincan|bardak|kaşık|gram(?:lık)?|\bg\b|\bml\b/i.test(t) ||
    /재료|큰술|작은술|\d+\s*(g|ml)\b/i.test(t)
  );
}

/** Heuristic line parser for offline / fallback extraction. */
export function parseRecipeText(raw: string): RecipePayload {
  const lines = normalizeLines(raw);
  if (lines.length === 0) {
    return {
      title: "Untitled Recipe",
      ingredients: [],
      steps: [],
      sourceType: "manual",
      sourcePlatform: "manual",
      creatorHandle: null,
    };
  }

  let title = lines[0];
  let start = 1;
  const lower0 = lines[0].toLowerCase();
  if (lower0.startsWith("title:")) {
    title = lines[0].slice(6).trim() || "Untitled Recipe";
    start = 1;
  }

  const ingredients: string[] = [];
  const steps: string[] = [];
  let section: "ingredients" | "steps" | "none" = "none";
  let usedFallbackSplit = false;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    if (/^ingredients?:?\s*$/i.test(lower) || lower === "ingredients" || /^malzeme(?:ler)?:?\s*$/i.test(lower)) {
      section = "ingredients";
      continue;
    }
    if (
      /^steps?:?\s*$/i.test(lower) ||
      /^instructions?:?\s*$/i.test(lower) ||
      /^(?:hazırlanış|hazırlanışı|yapılışı|yapılış|pişirme)/i.test(lower) ||
      /^만드는\s*법|^조리(?:\s*순서)?/i.test(line.trim())
    ) {
      section = "steps";
      continue;
    }

    if (section === "ingredients") {
      ingredients.push(line.replace(/^[-•*]\s*/, "").trim());
    } else if (section === "steps") {
      steps.push(line.replace(/^\d+[\).\s]+/, "").trim());
    } else {
      if (looksLikeIngredient(line) && ingredients.length < 20) {
        ingredients.push(line.replace(/^[-•*]\s*/, "").trim());
      } else if (steps.length < 30) {
        steps.push(line.replace(/^\d+[\).\s]+/, "").trim());
      }
    }
  }

  if (ingredients.length === 0 && steps.length === 0) {
    usedFallbackSplit = true;
    const mid = Math.max(1, Math.floor(lines.length / 2));
    for (let i = start; i < mid && i < lines.length; i++) {
      ingredients.push(lines[i].replace(/^[-•*]\s*/, ""));
    }
    for (let i = mid; i < lines.length; i++) {
      steps.push(lines[i].replace(/^\d+[\).\s]+/, ""));
    }
  }

  const sourceLang = guessSourceLanguageCode(raw);

  const qtyPattern =
    /\d|½|¼|⅓|⅔|⅛|⅜|⅝|⅞|cup|tbsp|tsp|oz|lb|g\b|ml|gram|tablespoon|teaspoon|clove|kaşık|bardak|adet|gramlık|큰술|작은술/i;
  let missingQty = 0;
  for (const ing of ingredients) {
    if (ing && !qtyPattern.test(ing)) missingQty++;
  }
  const measurementConfidence =
    ingredients.length === 0 ? 0.2 : Math.max(0.15, 1 - missingQty / Math.max(ingredients.length, 1));

  const warnings: string[] = [];
  if (usedFallbackSplit) {
    warnings.push("Recipe reconstructed from partial source text");
  }
  if (missingQty > 0 && ingredients.length > 0) {
    warnings.push("Some ingredient quantities were estimated");
  }

  const extractionConfidence = usedFallbackSplit ? 0.45 : ingredients.length || steps.length ? 0.55 : 0.25;

  return {
    title,
    ingredients,
    steps,
    sourceType: "manual",
    sourcePlatform: "manual",
    creatorHandle: null,
    sourceLanguage: sourceLang === "und" ? undefined : sourceLang,
    extractionConfidence,
    measurementConfidence,
    extractionWarnings: warnings.length ? warnings : undefined,
  };
}

function withOutputLanguage(recipe: RecipePayload, lang: PreferredLanguage): RecipePayload {
  return { ...recipe, outputLanguage: lang };
}

const DEMO_MODE_WARNING =
  "Demo mode: AI extraction is disabled (OPENAI_API_KEY not set). Using offline text parsing.";

function mergeWarnings(base: string[] | undefined, extra: string[]): string[] {
  return [...extra, ...(base ?? [])];
}

function minimalCaptionSkeleton(
  dishHint: string,
  url: string | undefined,
  outLang: PreferredLanguage,
  extra: string[],
  demoKeyWarnings: string[]
): RecipePayload {
  const title = dishHint.trim() || "Untitled Recipe";
  const source = url && URL_PATTERN.test(url) ? detectSourceFromUrl(url) : "manual";
  const handle = url && URL_PATTERN.test(url) ? inferCreatorHandleFromUrl(url) : null;
  const warnings = mergeWarnings(undefined, [
    "Recipe reconstructed from partial source text",
    "Only a short caption or dish name was available — ingredients and steps are approximate.",
    ...extra,
    ...demoKeyWarnings,
  ]);
  return withOutputLanguage(
    {
      title,
      ingredients: ["Main ingredients (amounts not specified in share — edit before cooking)"],
      steps: [
        `Prepare ${title} using your usual quantities; the share did not include a full recipe.`,
        "Edit ingredients and steps to match how you cook this dish.",
      ],
      sourceType: source,
      sourcePlatform: source,
      sourceUrl: url && URL_PATTERN.test(url) ? url : undefined,
      creatorHandle: handle,
      extractionConfidence: 0.38,
      measurementConfidence: 0.28,
      extractionWarnings: warnings,
    },
    outLang
  );
}

export function extractWithMock(input: {
  url?: string;
  text?: string;
  preferredLanguage: PreferredLanguage;
  /** Dish name / micro-caption path — conservative skeleton, not full parse. */
  minimalTextHintOnly?: boolean;
  /** Extra warnings (e.g. AI failure). */
  extraWarnings?: string[];
  /**
   * When true, omit the "OPENAI_API_KEY not set" demo copy — e.g. key was present but OpenAI failed.
   */
  suppressMissingKeyDemoWarning?: boolean;
}): RecipePayload {
  const url = input.url?.trim();
  const textRaw = input.text?.trim();
  const text = textRaw ? flattenCombinedExtractionText(textRaw) : "";
  const outLang = normalizeRecipeOutputLanguageCode(input.preferredLanguage ?? "en");
  const extra = input.extraWarnings ?? [];
  const demoKeyWarnings = input.suppressMissingKeyDemoWarning ? [] : [DEMO_MODE_WARNING];

  if (input.minimalTextHintOnly && text && !looksLikeStructuredRecipeCaption(text)) {
    return minimalCaptionSkeleton(text, url, outLang, extra, demoKeyWarnings);
  }

  if (url && URL_PATTERN.test(url)) {
    const source = detectSourceFromUrl(url);
    const handle = inferCreatorHandleFromUrl(url);
    if (text) {
      const parsed = parseRecipeText(text);
      return withOutputLanguage(
        {
          ...parsed,
          sourceUrl: url,
          sourceType: source,
          sourcePlatform: source,
          creatorHandle: handle ?? parsed.creatorHandle ?? null,
          extractionWarnings: mergeWarnings(parsed.extractionWarnings, [...extra, ...demoKeyWarnings]),
        },
        outLang
      );
    }
    return buildInsufficientUrlRecipe(url, outLang);
  }

  if (text) {
    const parsed = parseRecipeText(text);
    return withOutputLanguage(
      {
        ...parsed,
        extractionWarnings: mergeWarnings(parsed.extractionWarnings, [...extra, ...demoKeyWarnings]),
      },
      outLang
    );
  }

  return withOutputLanguage(
    {
      title: "Empty recipe",
      ingredients: [],
      steps: [],
      sourceType: "manual",
      sourcePlatform: "manual",
      creatorHandle: null,
      extractionWarnings: [...extra, ...demoKeyWarnings, "No URL or text provided."],
      extractionConfidence: 0,
      measurementConfidence: 0,
    },
    outLang
  );
}
