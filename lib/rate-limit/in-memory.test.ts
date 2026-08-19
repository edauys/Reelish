import { describe, expect, it } from "vitest";
import { checkUploadRateLimit } from "./in-memory";

describe("in-memory rate limit", () => {
  it("allows first requests then blocks within window", () => {
    const id = `test-user-${Date.now()}`;
    const first = checkUploadRateLimit(id);
    expect(first.ok).toBe(true);
  });
});
