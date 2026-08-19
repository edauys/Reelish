import { describe, expect, it } from "vitest";
import { coalesceImportUrlFields, resolveExtractionInput } from "@/lib/extraction/ingestion";

describe("resolveExtractionInput after retrieval merge", () => {
  it("treats url + merged supplement as extractable (not url-only insufficient)", () => {
    const thin = resolveExtractionInput({
      url: "https://www.instagram.com/reel/ABC123/",
      text: "",
    });
    expect(thin.isUrlOnlyInsufficient).toBe(true);

    const merged = resolveExtractionInput({
      url: "https://www.instagram.com/reel/ABC123/",
      text: "[Instagram Public oEmbed] Demo\n\nIngredients:\n- 200g flour\n- 2 eggs",
    });
    expect(merged.isUrlOnlyInsufficient).toBe(false);
    expect(merged.extractionText.length).toBeGreaterThan(40);
  });

  it("coalesces a lone URL in the text box to the url field", () => {
    const c = coalesceImportUrlFields({
      text: "https://www.instagram.com/reel/XYZ/",
    });
    expect(c.url).toContain("instagram.com");
    expect(c.urlOnlyInTextField).toBe(true);
    expect(c.text).toBe("");
  });
});
