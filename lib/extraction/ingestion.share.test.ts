import { describe, expect, it } from "vitest";
import { resolveExtractionInput } from "@/lib/extraction/ingestion";

const IG_TEASER =
  "See this Instagram post by @someone — check out this reel about pasta carbonara with extra context for the algorithm";

describe("resolveExtractionInput — share / Instagram multimodal", () => {
  it("treats long Instagram teaser as minimal hint, not full caption", () => {
    const r = resolveExtractionInput({
      url: "https://www.instagram.com/reel/abc/",
      text: IG_TEASER,
      shareTextAtOpen: IG_TEASER,
    });
    expect(r.ingestionSource).toBe("minimal_caption_hint");
    expect(r.minimalTextHintOnly).toBe(true);
    expect(r.isUrlOnlyInsufficient).toBe(false);
    expect(r.extractionText).toBe(IG_TEASER);
  });

  it("URL + teaser + media runs media_supplemented path (no link-only dead end)", () => {
    const r = resolveExtractionInput({
      url: "https://www.instagram.com/reel/abc/",
      text: "",
      shareTextAtOpen: "",
      mediaHints: { mediaAssetIds: ["00000000-0000-4000-8000-000000000001"] },
    });
    expect(r.ingestionSource).toBe("media_supplemented");
    expect(r.isUrlOnlyInsufficient).toBe(false);
  });

  it("puts share_title before Instagram teaser when title is richer than the preview line", () => {
    const title = "Slow-roasted tomato pasta with burrata — weekend dinner idea from the test kitchen";
    const r = resolveExtractionInput({
      url: "https://www.instagram.com/reel/abc/",
      text: IG_TEASER,
      shareTextAtOpen: IG_TEASER,
      shareTitleAtOpen: title,
    });
    expect(r.ingestionSource).toBe("shared_text_and_title");
    expect(r.extractionText.startsWith(title)).toBe(true);
    expect(r.extractionText).toContain(IG_TEASER);
  });

  it("URL + teaser + media: teaser in box still minimal when text is only teaser", () => {
    const r = resolveExtractionInput({
      url: "https://www.instagram.com/reel/abc/",
      text: IG_TEASER,
      shareTextAtOpen: IG_TEASER,
      mediaHints: { mediaAssetIds: ["00000000-0000-4000-8000-000000000001"] },
    });
    expect(r.ingestionSource).toBe("minimal_caption_hint");
    expect(r.minimalTextHintOnly).toBe(true);
  });
});
