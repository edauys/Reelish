import { resolveExtractionFetchTimeoutMs } from "@/lib/reconstruction/limits";
import { getRecipeOutputLanguageLabel, normalizeRecipeOutputLanguageCode } from "@/lib/languages";
import { normalizeIngredientList, normalizeStepList } from "@/lib/ingredient-format";
import { detectSourceFromUrl, inferCreatorHandleFromUrl } from "@/lib/extraction/url-meta";
import type { PreferredLanguage, RecipePayload, RecipeSource } from "@/types/recipe";

type OpenAIRecipeJson = {
  title?: string;
  ingredients?: string[];
  steps?: string[];
  notes?: string[];
  estimated_servings?: number | null;
  extraction_confidence?: number;
  measurement_confidence?: number;
  source_language?: string;
  extraction_warnings?: string[];
};

function parseJsonContent(content: string): OpenAIRecipeJson {
  const trimmed = content.trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
  return JSON.parse(stripped) as OpenAIRecipeJson;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function sourceForUrl(url: string | undefined): { sourceType: RecipeSource; sourcePlatform: RecipeSource } {
  if (url && /^https?:\/\//i.test(url)) {
    const s = detectSourceFromUrl(url);
    return { sourceType: s, sourcePlatform: s };
  }
  return { sourceType: "manual", sourcePlatform: "manual" };
}

/**
 * Structured extraction via OpenAI Chat Completions (JSON mode).
 * Requires `OPENAI_API_KEY` in the server environment.
 */
export async function extractWithOpenAI(input: {
  url?: string;
  text?: string;
  preferredLanguage: PreferredLanguage;
  /** Short dish name / title-only path — model must stay conservative. */
  minimalTextHintOnly?: boolean;
}): Promise<RecipePayload> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const outCode = normalizeRecipeOutputLanguageCode(input.preferredLanguage ?? "en");
  const outLabel = getRecipeOutputLanguageLabel(outCode);

  const url = input.url?.trim();
  const text = input.text?.trim();
  if (!text) {
    throw new Error("OpenAI extraction requires caption or recipe text (bare links are handled without the API).");
  }
  const { sourceType, sourcePlatform } = sourceForUrl(url);

  const system = `You are a multilingual recipe structuring assistant for the Reelish app.
Rules:
1) Parse recipe structure from input: full recipe text, social captions, and optional labeled sections (transcript, on-screen OCR, visual hints) when present — synthesize one coherent recipe.
2) Structure first (ingredients with quantities where present, ordered steps), then write all user-facing strings in the target output language (${outLabel}, ISO code ${outCode}). Do not merely translate — reorganize into a clean recipe.
3) source_language: ISO 639-1 code for the dominant language of the SOURCE input text; if unclear use "und".
4) extraction_confidence and measurement_confidence are numbers from 0 to 1. Use LOWER values (often 0.35–0.65) when the source is only a caption fragment, when labeled sections disagree, or when you inferred ingredients/steps from transcript, on-screen OCR, or visual hints. Reserve HIGH confidence (0.72+) when the caption clearly lists ingredients with amounts and ordered steps — including Turkish, Korean, or other non-English captions with measurable lines.
5) extraction_warnings: list concrete issues (e.g. ambiguous amounts, missing times). If quantities were guessed, include exactly: "Some ingredient quantities were estimated". If input was fragmentary, include exactly: "Recipe reconstructed from partial source text".
6) notes: optional cook tips not repeated in steps.
7) Return ONLY valid JSON with keys: title, ingredients, steps, notes (array, may be empty), estimated_servings (number or null), extraction_confidence, measurement_confidence, source_language, extraction_warnings (array of strings).
8) ingredients MUST be a JSON array of plain strings (one human-readable line each). Each ingredient line MUST preserve numbers and units from the source when present (e.g. "2 çay bardağı un", "1 yemek kaşığı şeker"). Do NOT replace real measurements with vague placeholders like "some flour" when amounts exist. steps MUST also be an array of plain strings.
9) Multilingual units (non-exhaustive): Turkish — "çay bardağı" (tea glass), "yemek kaşığı" (tablespoon), "tatlı kaşığı" (dessert spoon), "çay kaşığı" (teaspoon), "adet" (pieces), "gram/g", "ml", "yarım", fractions; yield phrases like "5 adet için", "N kişilik", "… için". Korean — "재료", "g", "ml", "큰술/작은술", "인분". Map yield/serving phrases into estimated_servings when inferable.
10) If the input contains a clear ingredient list with measurements, you MUST extract real ingredient lines — not a generic skeleton recipe.`;

  const minimal = Boolean(input.minimalTextHintOnly);
  const systemAugment = minimal
    ? `\n11) MINIMAL CAPTION MODE ONLY: The user text may be only a dish name or a few words with no measurable recipe. Infer a cautious skeleton only if there are NO ingredient amounts or steps in the input. If you see units, numbers, "Malzeme", "재료", or multiple steps, IGNORE minimal mode and apply rules 1–10 normally. Otherwise set extraction_confidence ≤ 0.45 and measurement_confidence ≤ 0.4. Include extraction_warnings with "Recipe reconstructed from partial source text" when appropriate.`
    : "";

  const sectionedMultimodal =
    text.includes("### Reconstruction directive") ||
    text.includes("### Transcript (speech") ||
    text.includes("### On-screen text (OCR");

  const multimodalMergeAugment =
    sectionedMultimodal && !minimal
      ? `\n12) SECTIONED MULTIMODAL INPUT: The user message has labeled sections. Follow "### Reconstruction directive" first. Merge "### Transcript (speech / audio)", "### On-screen text (OCR from video frames)", and visual hint sections into one recipe. When OCR or transcript contains ingredient lists, measurements, or numbered steps, parse them into structured ingredients and steps (do not bury them in notes only). When multiple sections agree, you may set extraction_confidence and measurement_confidence in the 0.72–0.9 range; reduce if sections conflict or are sparse.`
      : "";

  const userParts: string[] = [];
  if (url) {
    userParts.push(
      `Source URL (metadata only — the page was NOT fetched/scraped): ${url}`
    );
  }
  userParts.push(`Recipe/caption text:\n---\n${text}\n---`);
  if (minimal) {
    userParts.push(
      "The caption may be extremely short (e.g. only a dish name). Do not invent precise quantities; use cautious language and low confidence scores."
    );
  }
  userParts.push(`All recipe strings (title, ingredients, steps, notes, warnings text if any) must be written in ${outLabel} (${outCode}).`);

  const userMessage = userParts.join("\n\n");

  const model = process.env.OPENAI_EXTRACTION_MODEL?.trim() || "gpt-4o-mini";

  const timeoutMs = resolveExtractionFetchTimeoutMs();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system + systemAugment + multimodalMergeAugment },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`OpenAI extraction timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  let parsed: OpenAIRecipeJson;
  try {
    parsed = parseJsonContent(content);
  } catch {
    throw new Error("Failed to parse OpenAI JSON output");
  }

  const ingredients = normalizeIngredientList(parsed.ingredients);
  const steps = normalizeStepList(parsed.steps);
  const notes = normalizeStepList(parsed.notes);
  const warnings = Array.isArray(parsed.extraction_warnings)
    ? parsed.extraction_warnings.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const recipe: RecipePayload = {
    title: parsed.title?.trim() || "Untitled Recipe",
    ingredients,
    steps,
    notes: notes.length ? notes : undefined,
    estimatedServings: parsed.estimated_servings ?? null,
    extractionConfidence: clamp01(parsed.extraction_confidence ?? 0.7),
    measurementConfidence: clamp01(parsed.measurement_confidence ?? 0.7),
    sourceLanguage: parsed.source_language?.trim() || "und",
    outputLanguage: outCode,
    extractionWarnings: warnings.length ? warnings : undefined,
    sourceUrl: url && /^https?:\/\//i.test(url) ? url : undefined,
    sourceType,
    sourcePlatform,
    creatorHandle: url ? inferCreatorHandleFromUrl(url) : null,
  };

  return recipe;
}
