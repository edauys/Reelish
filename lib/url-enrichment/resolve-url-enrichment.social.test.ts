import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/url-enrichment/bounded-html-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/url-enrichment/bounded-html-fetch")>();
  return {
    ...actual,
    fetchBoundedHtml: vi.fn(),
  };
});

import { fetchBoundedHtml } from "@/lib/url-enrichment/bounded-html-fetch";
import { resolveUrlEnrichment } from "@/lib/url-enrichment/resolve-url-enrichment";

const IG = "https://www.instagram.com/reel/ABC123/";

describe("resolveUrlEnrichment — social bounded HTML", () => {
  beforeEach(() => {
    vi.stubEnv("REELISH_URL_ENRICHMENT_TIER", "official");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(fetchBoundedHtml).mockReset();
  });

  it("parses partial large Instagram HTML instead of failing with response too large", async () => {
    const head = `<html><head>
<meta property="og:title" content="Sheet Pan Chicken" />
<meta property="og:description" content="Ingredients: chicken thighs, lemon, garlic. Bake 35 min at 400F." />
</head>`;
    const html = head + "z".repeat(900_000);

    vi.mocked(fetchBoundedHtml).mockResolvedValue({
      ok: true,
      html: html.slice(0, 600_000),
      bytesRead: 600_000,
      truncated: true,
      contentLength: html.length,
    });

    const merge = await resolveUrlEnrichment(IG);
    expect(merge?.attachment.contributedToModelText).toBe(true);
    expect(merge?.supplementPlain).toMatch(/Sheet Pan Chicken|chicken/i);
    expect(merge?.attachment.warnings.some((w) => /truncated/i.test(w))).toBe(true);
    expect(merge?.attachment.warnings.some((w) => /response too large/i.test(w))).toBe(false);
  });
});
