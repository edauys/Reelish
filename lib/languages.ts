/**
 * Curated recipe output languages Reelish can support with acceptable quality
 * (major social / global recipe content locales). Extend by appending to
 * `RECIPE_OUTPUT_LANGUAGE_DEFINITIONS` — list is sorted by label at module load.
 */

export interface LanguageOption {
  code: string;
  label: string;
}

/**
 * Single source of truth for supported output language codes + English labels.
 * Add rows here to expose new languages in onboarding/profile combobox.
 */
const RECIPE_OUTPUT_LANGUAGE_DEFINITIONS = [
  { code: "ar", label: "Arabic" },
  { code: "zh", label: "Chinese" },
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "tr", label: "Turkish" },
] as const satisfies readonly LanguageOption[];

/** Alphabetically by English label (product copy / picker order). */
export const RECIPE_OUTPUT_LANGUAGES: readonly LanguageOption[] = [...RECIPE_OUTPUT_LANGUAGE_DEFINITIONS].sort(
  (a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" })
);

export type RecipeOutputLanguageCode = (typeof RECIPE_OUTPUT_LANGUAGE_DEFINITIONS)[number]["code"];

const LABEL_BY_CODE = new Map(RECIPE_OUTPUT_LANGUAGES.map((l) => [l.code, l.label]));
const VALID_CODES = new Set(RECIPE_OUTPUT_LANGUAGES.map((l) => l.code));

export function getRecipeOutputLanguageLabel(code: string): string {
  return LABEL_BY_CODE.get(code) ?? code;
}

/** Maps stored `user_profiles.preferred_language` to a supported code; unknown → English. */
export function normalizeRecipeOutputLanguageCode(code: string | undefined | null): RecipeOutputLanguageCode {
  if (code && VALID_CODES.has(code)) return code as RecipeOutputLanguageCode;
  return "en";
}
