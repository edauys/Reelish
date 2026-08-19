import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ResolvedExtractionInput } from "@/lib/extraction/ingestion";
import type { UrlEnrichmentMerge } from "@/lib/url-enrichment/types";

vi.mock("@/lib/url-enrichment/resolve-url-enrichment", () => ({
  resolveUrlEnrichment: vi.fn(),
}));

vi.mock("@/lib/retrieval/cache-disk", () => ({
  readRetrievalCache: vi.fn(),
  writeRetrievalCache: vi.fn(),
}));

import { readRetrievalCache, writeRetrievalCache } from "@/lib/retrieval/cache-disk";
import { runSourceRetrievalOrchestrator } from "@/lib/retrieval/orchestrator";
import { resolveUrlEnrichment } from "@/lib/url-enrichment/resolve-url-enrichment";

const preliminary: ResolvedExtractionInput = {
  url: "https://www.instagram.com/reel/TESTREEL1/",
  extractionText: "See this Instagram post preview…",
  ingestionSource: "minimal_caption_hint",
  isUrlOnlyInsufficient: false,
  minimalTextHintOnly: true,
};

const mockMerge = (plain: string, contributed: boolean): UrlEnrichmentMerge => ({
  attachment: {
    providerId: "official_metadata",
    tier: "official_metadata",
    fetchedAt: new Date().toISOString(),
    sourceLabel: "Test enrich",
    warnings: [],
    contributedToModelText: contributed,
  },
  supplementPlain: plain,
});

describe("runSourceRetrievalOrchestrator", () => {
  beforeEach(() => {
    vi.stubEnv("REELISH_RETRIEVAL_ORCHESTRATOR", "1");
    vi.stubEnv("REELISH_RETRIEVAL_DISABLED", "");
    vi.stubEnv("REELISH_RETRIEVAL_PUBLIC_HTTP", "1");
    vi.mocked(readRetrievalCache).mockResolvedValue(null);
    vi.mocked(writeRetrievalCache).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(resolveUrlEnrichment).mockReset();
    vi.mocked(readRetrievalCache).mockReset();
    vi.mocked(writeRetrievalCache).mockReset();
  });

  it("returns empty supplement when orchestration is disabled", async () => {
    vi.stubEnv("REELISH_RETRIEVAL_ORCHESTRATOR", "0");
    const out = await runSourceRetrievalOrchestrator({
      input: { url: preliminary.url },
      preliminary,
      preferredLanguage: "en",
    });
    expect(out.supplementPlain).toBe("");
    expect(resolveUrlEnrichment).not.toHaveBeenCalled();
  });

  it("on cache miss, calls resolveUrlEnrichment once and forwards supplement", async () => {
    vi.mocked(resolveUrlEnrichment).mockResolvedValue(mockMerge("Recovered meta block", true));
    const out = await runSourceRetrievalOrchestrator({
      input: { url: preliminary.url, shareTextAtOpen: "See this Instagram…" },
      preliminary,
      preferredLanguage: "en",
    });
    expect(resolveUrlEnrichment).toHaveBeenCalledTimes(1);
    expect(out.supplementPlain).toContain("Recovered meta");
    expect(out.snapshot.cacheHit).not.toBe(true);
    expect(out.snapshot.diagnostics.some((d) => d.providerId === "public_http_retrieval" && d.attempted)).toBe(true);
  });

  it("on cache hit, skips resolveUrlEnrichment", async () => {
    vi.mocked(readRetrievalCache).mockResolvedValue({
      canonicalKey: "https://www.instagram.com/reel/testreel1/",
      savedAtIso: new Date().toISOString(),
      supplementPlain: "From cache Ingredients: 2 eggs",
      enrichmentMergeJson: { sourceLabel: "cache" },
    });
    const out = await runSourceRetrievalOrchestrator({
      input: { url: preliminary.url },
      preliminary,
      preferredLanguage: "en",
    });
    expect(resolveUrlEnrichment).not.toHaveBeenCalled();
    expect(out.snapshot.cacheHit).toBe(true);
    expect(out.supplementPlain).toContain("From cache");
  });

  it("skips public HTTP when REELISH_RETRIEVAL_PUBLIC_HTTP=0", async () => {
    vi.stubEnv("REELISH_RETRIEVAL_PUBLIC_HTTP", "0");
    const out = await runSourceRetrievalOrchestrator({
      input: { url: preliminary.url },
      preliminary,
      preferredLanguage: "en",
    });
    expect(resolveUrlEnrichment).not.toHaveBeenCalled();
    expect(out.snapshot.diagnostics.some((d) => d.message?.includes("REELISH_RETRIEVAL_PUBLIC_HTTP"))).toBe(true);
  });
});
