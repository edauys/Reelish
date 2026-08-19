import { describe, expect, it } from "vitest";
import {
  buildSupplementFromSocialEvidence,
  extractEmbeddedCaptionCandidates,
  parseSocialHtmlEvidence,
} from "@/lib/url-enrichment/social-html-evidence";
import { socialRetrievalMaxBytes } from "@/lib/url-enrichment/bounded-html-fetch";

describe("parseSocialHtmlEvidence — large / partial HTML", () => {
  it("recovers OG metadata from a large buffer when tags are in the first chunk", () => {
    const padding = "x".repeat(600_000);
    const html = `<!DOCTYPE html><html><head>
<meta property="og:title" content="Creamy Garlic Pasta" />
<meta property="og:description" content="Ingredients: 400g pasta, 6 cloves garlic, olive oil. Steps: boil pasta, sauté garlic, toss." />
${padding}</head><body></body></html>`;

    const parsed = parseSocialHtmlEvidence(html.slice(0, socialRetrievalMaxBytes()), {
      bytesRead: Math.min(html.length, socialRetrievalMaxBytes()),
      truncated: html.length > socialRetrievalMaxBytes(),
    });

    expect(parsed.fieldsUsed).toContain("og:title");
    expect(parsed.fieldsUsed).toContain("og:description");
    const supplement = buildSupplementFromSocialEvidence(parsed, "Test");
    expect(supplement).toContain("Garlic Pasta");
    expect(supplement).toMatch(/Ingredients/i);
  });

  it("recovers caption-like text from embedded script JSON in a large HTML page", () => {
    const padding = "y".repeat(500_000);
    const html = `<html><head><title>x</title></head><body>${padding}<script type="application/json">{"caption":"Weeknight tacos\\nIngredients:\\n- 500g beef\\n- tortillas\\nSteps:\\n1. Brown beef"}</script></body></html>`;

    const candidates = extractEmbeddedCaptionCandidates(html);
    expect(candidates.some((c) => /beef/i.test(c))).toBe(true);

    const parsed = parseSocialHtmlEvidence(html);
    expect(parsed.embeddedCaptions.length).toBeGreaterThan(0);
    expect(parsed.captionLike).toBe(true);
    const supplement = buildSupplementFromSocialEvidence(parsed, "Test");
    expect(supplement).toMatch(/embedded caption/i);
    expect(supplement).toMatch(/beef/i);
  });

  it("does not treat response-too-large as a hard failure when only a prefix is available", () => {
    const head = `<html><head><meta property="og:description" content="Simple soup: onion, tomato, broth. Simmer 20 min." /></head>`;
    const truncatedHtml = head + "z".repeat(700_000);
    const parsed = parseSocialHtmlEvidence(truncatedHtml.slice(0, 512_000), {
      bytesRead: 512_000,
      truncated: true,
    });
    expect(parsed.partialHtmlParsed).toBe(true);
    expect(parsed.htmlTruncated).toBe(true);
    const supplement = buildSupplementFromSocialEvidence(parsed, "Partial");
    expect(supplement).toContain("onion");
  });
});
