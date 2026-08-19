import { describe, expect, it } from "vitest";
import {
  lifestyleNoRecipe,
  koreanMeasuredCaption,
  shortDishNameOnly,
  turkishMeasuredCaption,
} from "@/lib/extraction/fixtures/recipe-caption-examples";
import {
  classifyCaptionForExtraction,
  looksLikeStructuredRecipeCaption,
} from "@/lib/extraction/recipe-caption-detect";
import { hasMinimalRecipeHint, hasUsableExtractionText } from "@/lib/extraction/text-hints";

describe("looksLikeStructuredRecipeCaption", () => {
  it("detects Turkish measured caption with units and yield", () => {
    expect(looksLikeStructuredRecipeCaption(turkishMeasuredCaption)).toBe(true);
    expect(classifyCaptionForExtraction(turkishMeasuredCaption)).toBe("structured_recipe");
  });

  it("detects Korean measured caption", () => {
    expect(looksLikeStructuredRecipeCaption(koreanMeasuredCaption)).toBe(true);
    expect(classifyCaptionForExtraction(koreanMeasuredCaption)).toBe("structured_recipe");
  });

  it("does not treat short dish name as structured recipe", () => {
    expect(looksLikeStructuredRecipeCaption(shortDishNameOnly)).toBe(false);
    expect(classifyCaptionForExtraction(shortDishNameOnly)).toBe("minimal_dish");
  });

  it("classifies lifestyle caption without recipe signals", () => {
    expect(looksLikeStructuredRecipeCaption(lifestyleNoRecipe)).toBe(false);
    expect(classifyCaptionForExtraction(lifestyleNoRecipe)).toBe("lifestyle_or_ambiguous");
  });
});

describe("text-hints integration", () => {
  it("marks Turkish measured caption as usable (not minimal-only)", () => {
    expect(hasUsableExtractionText(turkishMeasuredCaption)).toBe(true);
    expect(hasMinimalRecipeHint(turkishMeasuredCaption)).toBe(false);
  });

  it("allows minimal hint for dish name only", () => {
    expect(hasMinimalRecipeHint(shortDishNameOnly)).toBe(true);
    expect(hasUsableExtractionText(shortDishNameOnly)).toBe(false);
  });
});
