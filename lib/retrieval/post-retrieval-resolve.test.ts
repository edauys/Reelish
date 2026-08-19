import { describe, expect, it } from "vitest";
import { coerceResolvedAfterRetrieval, shouldReturnUrlOnlyInsufficient } from "@/lib/retrieval/post-retrieval-resolve";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";

const urlOnly: ResolvedExtractionInput = {
  url: "https://www.instagram.com/reel/ABC/",
  extractionText: "",
  ingestionSource: "url_only_insufficient",
  isUrlOnlyInsufficient: true,
};

describe("post-retrieval resolve", () => {
  it("promotes link-only to url_retrieval_supplemented when supplement was merged", () => {
    const merged = "[Instagram oEmbed] Pasta\n\nIngredients:\n- 200g flour";
    const r = coerceResolvedAfterRetrieval(urlOnly, merged, true);
    expect(r.isUrlOnlyInsufficient).toBe(false);
    expect(r.ingestionSource).toBe("url_retrieval_supplemented");
    expect(r.extractionText).toContain("flour");
  });

  it("should not return insufficient card when supplement merged", () => {
    expect(
      shouldReturnUrlOnlyInsufficient(
        { ...urlOnly, isUrlOnlyInsufficient: false, ingestionSource: "url_retrieval_supplemented" },
        {
          supplementalTextMerged: true,
          mergedText: "Ingredients: eggs",
          evidence: null,
        }
      )
    ).toBe(false);
  });

  it("should return insufficient when retrieval produced nothing", () => {
    expect(
      shouldReturnUrlOnlyInsufficient(urlOnly, {
        supplementalTextMerged: false,
        mergedText: "",
        evidence: null,
        retrievalOutcome: {
          supplementPlain: "",
          snapshot: { diagnostics: [], supplementTiersUsed: [], supplementalStrength: "none" },
        },
      })
    ).toBe(true);
  });
});
