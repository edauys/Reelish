import { describe, expect, it } from "vitest";
import { combinedTextForExtractionModel } from "@/lib/reconstruction/combine-text";
import type { RecipeEvidence } from "@/lib/reconstruction/types";

describe("combinedTextForExtractionModel", () => {
  it("merges thin caption with transcript ingredients and OCR measurements", () => {
    const ev: RecipeEvidence = {
      primaryText: "Pasta night",
      preferredLanguage: "en",
      minimalTextHintOnly: true,
      ingestionSource: "minimal_caption_hint",
      transcriptText: "You need spaghetti, olive oil, and garlic. Boil water first, then salt it.",
      ocrText: "400g spaghetti\n60ml olive oil\n4 cloves garlic\nsalt",
      visualIngredientHints: [{ label: "spaghetti", confidence: 0.7 }],
    };
    const out = combinedTextForExtractionModel(ev);
    expect(out).toContain("### Transcript");
    expect(out).toContain("### On-screen text");
    expect(out).toContain("### Visual ingredient hints");
    expect(out).toContain("Reconstruction directive");
    expect(out).toMatch(/400g|spaghetti/i);
  });

  it("returns primary only when no multimodal body", () => {
    const ev: RecipeEvidence = {
      primaryText: "Only caption",
      preferredLanguage: "en",
    };
    expect(combinedTextForExtractionModel(ev)).toBe("Only caption");
  });

  it("includes single-share handoff section and down-ranks teaser heading when multimodal", () => {
    const ev: RecipeEvidence = {
      primaryText: "See this Instagram post by @chef — amazing recipe",
      preferredLanguage: "en",
      minimalTextHintOnly: true,
      ingestionSource: "minimal_caption_hint",
      sourceUrl: "https://www.instagram.com/reel/xyz/",
      sharedTitle: "Reel",
      shareIntake: { origin: "native_share_extension", receivedAt: "2026-01-01T00:00:00Z", combinedShareHandoff: true },
      transcriptText: "First, boil pasta. Add cream and parmesan.",
      ocrText: "400g pasta\n200ml cream",
    };
    const out = combinedTextForExtractionModel(ev);
    expect(out).toContain("Share handoff (single import)");
    expect(out).toContain("Share preview / caption text");
    expect(out).toContain("Post URL (context):");
    expect(out).toContain("Share sheet title:");
    expect(out).toContain("### Transcript");
    const trIdx = out.indexOf("### Transcript");
    const previewIdx = out.indexOf("### Share preview");
    expect(trIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(-1);
    expect(trIdx).toBeLessThan(previewIdx);
    expect(out).toContain("Ordering: multimodal evidence is listed before this block");
  });
});

