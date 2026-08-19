import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { UrlEnrichmentMerge } from "@/lib/url-enrichment/types";

vi.mock("@/lib/retrieval/orchestrator", () => ({
  emptyRetrievalOrchestrationResult: vi.fn(() => ({
    supplementPlain: "",
    enrichmentMerge: undefined,
    snapshot: { diagnostics: [], supplementTiersUsed: [], supplementalStrength: "none" },
  })),
  runSourceRetrievalOrchestrator: vi.fn(),
}));

vi.mock("@/lib/reconstruction/gather-evidence", () => ({
  enrichEvidenceWithMultimodalProviders: vi.fn(async (e: unknown) => e),
}));

import { runExtraction } from "@/lib/extraction";
import { runSourceRetrievalOrchestrator } from "@/lib/retrieval/orchestrator";

const IG = "https://www.instagram.com/reel/TESTREEL99/";

const mockMerge = (plain: string): UrlEnrichmentMerge => ({
  attachment: {
    providerId: "experimental_instagram_oembed",
    tier: "experimental_instagram_oembed",
    fetchedAt: new Date().toISOString(),
    sourceLabel: "Test retrieval",
    warnings: [],
    contributedToModelText: true,
  },
  supplementPlain: plain,
});

describe("runExtraction — URL-only Instagram/TikTok", () => {
  beforeEach(() => {
    vi.stubEnv("REELISH_RETRIEVAL_ORCHESTRATOR", "1");
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(runSourceRetrievalOrchestrator).mockReset();
  });

  it("with recovered supplement, does NOT return url_only_insufficient", async () => {
    const supplement =
      "[Instagram public oEmbed]\nCreamy garlic pasta\n\nIngredients:\n- 400g pasta\n- 4 cloves garlic\nSteps:\n1. Boil pasta";
    vi.mocked(runSourceRetrievalOrchestrator).mockResolvedValue({
      supplementPlain: supplement,
      enrichmentMerge: mockMerge(supplement),
      snapshot: {
        diagnostics: [{ providerId: "experimental_social_retrieval", safety: "experimental", attempted: true, succeeded: true, outcome: "success" }],
        supplementTiersUsed: ["recovered_caption_like"],
        supplementalStrength: "moderate",
        recoveredCaptionLike: true,
        urlOnlyInputDetected: true,
        supplementMergedBeforeExtraction: true,
        canonicalUrlDisplay: IG,
      },
    });

    const { recipe } = await runExtraction({
      url: IG,
      text: "",
      preferredLanguage: "en",
    });

    expect(recipe.ingestionSource).not.toBe("url_only_insufficient");
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(runSourceRetrievalOrchestrator).toHaveBeenCalled();
  });

  it("with empty retrieval, returns honest link-only fallback", async () => {
    vi.mocked(runSourceRetrievalOrchestrator).mockResolvedValue({
      supplementPlain: "",
      enrichmentMerge: undefined,
      snapshot: {
        diagnostics: [
          {
            providerId: "public_http_retrieval",
            safety: "public",
            attempted: true,
            succeeded: false,
            outcome: "blocked",
            message: "blocked",
          },
        ],
        supplementTiersUsed: [],
        supplementalStrength: "none",
        urlOnlyInputDetected: true,
        supplementMergedBeforeExtraction: false,
      },
    });

    const { recipe } = await runExtraction({
      url: IG,
      text: "",
      preferredLanguage: "en",
    });

    expect(recipe.ingestionSource).toBe("url_only_insufficient");
    expect(recipe.title).toMatch(/source retrieval/i);
  });

  it("caption + link still extracts (regression)", async () => {
    vi.mocked(runSourceRetrievalOrchestrator).mockResolvedValue({
      supplementPlain: "",
      enrichmentMerge: undefined,
      snapshot: { diagnostics: [], supplementTiersUsed: [], supplementalStrength: "none" },
    });

    const caption = "Tomato soup\n\nIngredients:\n- 3 tomatoes\n- 1 onion\n\nSteps:\n1. Chop\n2. Simmer";
    const { recipe } = await runExtraction({
      url: IG,
      text: caption,
      preferredLanguage: "en",
    });

    expect(recipe.ingestionSource).not.toBe("url_only_insufficient");
    expect(recipe.ingredients.length).toBeGreaterThan(0);
  });

  it("URL pasted only in text field triggers retrieval via coalesce", async () => {
    vi.mocked(runSourceRetrievalOrchestrator).mockResolvedValue({
      supplementPlain: "Ingredients:\n- salt\n- pepper",
      enrichmentMerge: mockMerge("Ingredients:\n- salt\n- pepper"),
      snapshot: {
        diagnostics: [],
        supplementTiersUsed: [],
        supplementalStrength: "weak",
        urlOnlyInputDetected: true,
        supplementMergedBeforeExtraction: true,
      },
    });

    await runExtraction({
      url: "",
      text: IG,
      preferredLanguage: "en",
    });

    expect(runSourceRetrievalOrchestrator).toHaveBeenCalled();
    const call = vi.mocked(runSourceRetrievalOrchestrator).mock.calls[0]![0];
    expect(call.preliminary.url).toBe(IG);
  });
});
