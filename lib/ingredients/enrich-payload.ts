import { parseIngredientLinesToStructured, structuredIngredientToDisplayLine } from "@/lib/ingredients/structured-line";
import type { RecipePayload } from "@/types/recipe";

/**
 * Adds optional `ingredientsStructured` and lightly normalizes display `ingredients` for consistency.
 * Safe for older rows: only adds fields when ingredients array exists.
 */
export function enrichRecipePayloadWithStructuredIngredients(payload: RecipePayload): RecipePayload {
  if (!payload.ingredients?.length) return payload;

  const structured = parseIngredientLinesToStructured(payload.ingredients);
  const normalizedDisplay = structured.map(structuredIngredientToDisplayLine);

  return {
    ...payload,
    ingredientsStructured: structured,
    ingredients: normalizedDisplay,
  };
}
