/**
 * When clients label uploads as `application/octet-stream`, infer a real image/video MIME from magic bytes.
 * Keeps staging honest — we only sniff the first few bytes locally.
 */
export function inferMimeFromBytesPrefix(buf: Buffer): string | undefined {
  if (buf.length < 4) return undefined;
  /** Matroska / WebM EBML header */
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    const tag = buf.toString("ascii", 8, 12);
    if (tag === "WEBP") return "image/webp";
  }
  if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.toString("ascii", 8, 12);
    if (brand.startsWith("qt") || brand === "qt  ") return "video/quicktime";
    if (brand === "heic" || brand === "mif1" || brand === "msf1") return "image/heic";
    return "video/mp4";
  }
  return undefined;
}
