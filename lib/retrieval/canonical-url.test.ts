import { describe, expect, it } from "vitest";
import { canonicalSourceFromUrl } from "@/lib/retrieval/canonical-url";

describe("canonicalSourceFromUrl", () => {
  it("normalizes Instagram reel path, host, and trailing slash", () => {
    const r = canonicalSourceFromUrl("HTTPS://instagr.am/reel/AbCdEf123/?igsh=foo");
    expect(r.platform).toBe("instagram");
    expect(r.canonicalUrl).toBe("https://www.instagram.com/reel/AbCdEf123/");
    expect(r.canonicalKey).toBe("https://www.instagram.com/reel/abcdef123/");
  });

  it("normalizes Instagram /p/ posts", () => {
    const r = canonicalSourceFromUrl("https://instagram.com/p/XYZ789");
    expect(r.canonicalUrl).toBe("https://www.instagram.com/p/XYZ789/");
  });

  it("keeps TikTok host + path for cache key (short links may redirect separately)", () => {
    const r = canonicalSourceFromUrl("https://VM.tiktok.com/ZM123abc/");
    expect(r.platform).toBe("tiktok");
    expect(r.canonicalKey).toContain("vm.tiktok.com");
  });
});
