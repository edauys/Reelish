import type { VisualCookingCue, VisualIngredientHint } from "@/lib/reconstruction/types";
import type { RecipeSource } from "@/types/recipe";

/** Future: ingredient / action detection from frames or short clips. */
export type VisualJobInput = {
  sourceUrl?: string;
  sourcePlatform?: RecipeSource;
  frameUrls?: string[];
  imageBase64Parts?: string[];
  mediaAssetId?: string;
};

export interface VisualIngredientProvider {
  detectIngredientsAndActions(input: VisualJobInput): Promise<{
    ingredients: VisualIngredientHint[];
    actions: VisualCookingCue[];
  } | null>;
}

export const noopVisualIngredientProvider: VisualIngredientProvider = {
  async detectIngredientsAndActions() {
    return null;
  },
};
