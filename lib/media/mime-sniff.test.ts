import { describe, expect, it } from "vitest";
import { inferMimeFromBytesPrefix } from "@/lib/media/mime-sniff";

describe("inferMimeFromBytesPrefix", () => {
  it("detects WebM EBML", () => {
    const buf = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    expect(inferMimeFromBytesPrefix(buf)).toBe("video/webm");
  });

  it("detects HEIC ftyp brand", () => {
    const buf = Buffer.alloc(24);
    buf.write("ftyp", 4);
    buf.write("heic", 8);
    expect(inferMimeFromBytesPrefix(buf)).toBe("image/heic");
  });
});
