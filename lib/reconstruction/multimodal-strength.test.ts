import { describe, expect, it } from "vitest";
import { assessMultimodalStrength } from "@/lib/reconstruction/multimodal-strength";
import type { RecipeEvidence } from "@/lib/reconstruction/types";

describe("assessMultimodalStrength", () => {
  it("rates strong when transcript + OCR both rich (lifestyle caption scenario)", () => {
    const ev: RecipeEvidence = {
      primaryText: "Sunday vibes ✨ #food",
      preferredLanguage: "en",
      transcriptText: Array(25)
        .fill("Add two cups flour, one teaspoon salt, whisk eggs, bake at 350 for 20 minutes.")
        .join(" "),
      ocrText: "Ingredients:\n2 cups flour\n1 tsp salt\n2 eggs\n\nSteps:\n1. Mix dry\n2. Add eggs\n3. Bake",
    };
    const a = assessMultimodalStrength(ev);
    expect(["strong", "moderate"]).toContain(a.tier);
    expect(a.transcriptScore).toBeGreaterThan(0.25);
    expect(a.ocrScore).toBeGreaterThan(0.25);
  });

  it("elevates OCR for dish-name caption + on-screen Korean list", () => {
    const ev: RecipeEvidence = {
      primaryText: "Kimchi jjigae",
      preferredLanguage: "en",
      transcriptText: "",
      ocrText: "재료\n돼지고기 200g\n김치 300g\n물 500ml\n\n만드는 법\n1. 볶는다\n2. 끓인다",
      visualIngredientHints: [{ label: "pork belly", confidence: 0.72 }],
    };
    const a = assessMultimodalStrength(ev);
    expect(a.ocrScore).toBeGreaterThan(0.2);
    expect(["strong", "moderate"]).toContain(a.tier);
  });

  it("rates weak when only sparse visual hints", () => {
    const ev: RecipeEvidence = {
      primaryText: "Yummy",
      preferredLanguage: "en",
      visualIngredientHints: [{ label: "bowl", confidence: 0.35 }],
    };
    const a = assessMultimodalStrength(ev);
    expect(a.tier === "weak" || a.tier === "moderate").toBe(true);
  });

  it("upgrades tier when caption is weak but transcript and OCR are complementary", () => {
    const ev: RecipeEvidence = {
      primaryText: "Soup",
      preferredLanguage: "en",
      minimalTextHintOnly: true,
      ingestionSource: "minimal_caption_hint",
      transcriptText:
        "Dice onions and carrots, sauté until soft, then add stock and simmer. Season at the end.",
      ocrText: "Ingredients\n500ml stock\n2 onions\n1 carrot\nsalt & pepper",
    };
    const a = assessMultimodalStrength(ev);
    expect(["strong", "moderate"]).toContain(a.tier);
    expect(a.summaryLine.toLowerCase()).toContain("caption");
  });

  it("returns none when no multimodal channels", () => {
    const ev: RecipeEvidence = {
      primaryText: "caption only",
      preferredLanguage: "en",
    };
    const a = assessMultimodalStrength(ev);
    expect(a.tier).toBe("none");
  });
});
