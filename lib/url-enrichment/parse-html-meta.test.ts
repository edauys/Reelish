import { describe, expect, it } from "vitest";
import { extractOpenGraphAndMeta } from "./parse-html-meta";

describe("extractOpenGraphAndMeta", () => {
  it("reads og:title and og:description", () => {
    const html = `<!doctype html><meta property="og:title" content="Pasta &amp; sauce" />
      <meta property="og:description" content="A test page" />`;
    const r = extractOpenGraphAndMeta(html);
    expect(r.title).toContain("Pasta");
    expect(r.description).toBe("A test page");
  });
});
