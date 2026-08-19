import { describe, expect, it } from "vitest";
import { safePublicHttpUrl } from "./safe-public-url";

describe("safePublicHttpUrl", () => {
  it("allows https public hosts", () => {
    expect(safePublicHttpUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  it("blocks localhost", () => {
    expect(safePublicHttpUrl("http://localhost:3000/x")).toBeNull();
  });

  it("blocks private IPv4", () => {
    expect(safePublicHttpUrl("http://192.168.1.1/")).toBeNull();
  });
});
