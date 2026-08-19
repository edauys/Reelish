import fs from "fs/promises";
import path from "path";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSafeMediaAssetId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export function getMediaRoot(): string {
  const fromEnv = process.env.REELISH_MEDIA_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), ".data", "reelish-media");
}

export function ensureWithinMediaRoot(absPath: string, root: string): boolean {
  const resolved = path.resolve(absPath);
  const rootResolved = path.resolve(root);
  return resolved === rootResolved || resolved.startsWith(rootResolved + path.sep);
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith("video/mp4")) return ".mp4";
  if (m.includes("webm")) return ".webm";
  if (m.includes("quicktime")) return ".mov";
  if (m.includes("mpeg")) return ".mpeg";
  if (m.startsWith("audio/mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("wav")) return ".wav";
  if (m.includes("m4a") || m.includes("mp4") && m.startsWith("audio")) return ".m4a";
  if (m.includes("ogg")) return ".ogg";
  if (m.startsWith("image/jpeg") || m.includes("jpg")) return ".jpg";
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  if (m.includes("heic") || m.includes("heif")) return ".heic";
  if (m.includes("webm")) return ".webm";
  return ".bin";
}

export function classifyMediaKind(mime: string): "audio" | "video" | "image" | "unknown" {
  const m = mime.toLowerCase();
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("image/")) return "image";
  return "unknown";
}
