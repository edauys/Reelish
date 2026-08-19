import { describe, expect, it } from "vitest";
import {
  dedupeConsecutiveParagraphs,
  normalizeShareIntakeText,
  stripHtmlLikeToPlainText,
  stripRtfShellToPlainText,
} from "./normalize-share-text";

describe("normalizeShareIntakeText", () => {
  it("merges segments-style newlines and NFC-normalizes", () => {
    const s = normalizeShareIntakeText("caf\u0065\u0301\n\nSecond line");
    expect(s).toContain("Second line");
    expect(s.normalize("NFC")).toBe(s);
  });

  it("dedupes repeated URL-only lines", () => {
    const u = "https://example.com/reel/1";
    const s = normalizeShareIntakeText(`${u}\n${u}\nCaption here`);
    expect(s.split("\n").filter((l) => l.includes("example.com"))).toHaveLength(1);
  });

  it("strips simple HTML fragments from web share payloads", () => {
    const s = normalizeShareIntakeText("<p>2 cups flour</p><br/>Mix well");
    expect(s.toLowerCase()).not.toContain("<p>");
    expect(s).toMatch(/flour/i);
    expect(s).toMatch(/mix/i);
  });

  it("collapses consecutive duplicate paragraphs", () => {
    const s = normalizeShareIntakeText("Same caption\n\nSame caption\n\nNext");
    expect(s).toBe("Same caption\n\nNext");
  });

  it("handles empty or whitespace-only input", () => {
    expect(normalizeShareIntakeText("   \n  \t  ")).toBe("");
  });
});

describe("helpers", () => {
  it("stripHtmlLikeToPlainText decodes common entities", () => {
    expect(stripHtmlLikeToPlainText("<div>a &amp; b</div>")).toMatch(/a & b/);
  });

  it("stripRtfShellToPlainText removes RTF control noise", () => {
    const raw = "{\\rtf1\\ansi\\deff0 {\\fonttbl}\\u2605 test}";
    const t = stripRtfShellToPlainText(raw);
    expect(t.toLowerCase()).toContain("test");
  });

  it("dedupeConsecutiveParagraphs keeps distinct blocks", () => {
    expect(dedupeConsecutiveParagraphs("A\n\nB\n\nA")).toBe("A\n\nB\n\nA");
  });
});
