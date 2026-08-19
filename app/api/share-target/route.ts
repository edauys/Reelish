import { NextRequest, NextResponse } from "next/server";
import { saveMediaUpload } from "@/lib/media/local-store";
import { SHARE_QUERY } from "@/lib/share-target";

const MAX_SHARE_FILE_BYTES = 35 * 1024 * 1024;
const MAX_SHARE_FILES = 3;

/**
 * Web Share Target handler (PWA)
 * ------------------------------
 * When a user shares a URL or text from another app into the installed Reelish PWA,
 * Chromium-based browsers POST `multipart/form-data` to this route (see manifest.json
 * `share_target`).
 *
 * Reads `title`, `text`, `url` and optional shared files (Level 2 share target when declared
 * in the manifest). Files are stored server-side; only short ids are placed in the redirect URL.
 *
 * Limitations:
 * - Length: very long shares are truncated to keep URLs under practical limits.
 * - iOS: Share Target support depends on Safari/WebKit version and install state.
 * - A future native app would use platform share extensions instead of this POST.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "");
  const text = String(form.get("text") ?? "");
  const url = String(form.get("url") ?? "");

  const maxText = 3500;
  const safeText = text.length > maxText ? `${text.slice(0, maxText)}\n…` : text;

  const mediaIds: string[] = [];
  const fileFields = [...form.getAll("files"), ...form.getAll("media")];
  for (const entry of fileFields) {
    if (mediaIds.length >= MAX_SHARE_FILES) break;
    if (!(entry instanceof File) || entry.size === 0) continue;
    if (entry.size > MAX_SHARE_FILE_BYTES) continue;
    try {
      const buffer = Buffer.from(await entry.arrayBuffer());
      const asset = await saveMediaUpload({
        buffer,
        mimeType: entry.type || "application/octet-stream",
        originalFilename: entry.name,
        sourceUrl: url || undefined,
      });
      mediaIds.push(asset.mediaAssetId);
    } catch {
      // Skip oversized / invalid files; text+url still work.
    }
  }

  const redirect = request.nextUrl.clone();
  redirect.pathname = "/dashboard";
  redirect.search = "";
  if (url) redirect.searchParams.set(SHARE_QUERY.url, url);
  if (safeText) redirect.searchParams.set(SHARE_QUERY.text, safeText);
  if (title) redirect.searchParams.set(SHARE_QUERY.title, title);
  if (mediaIds.length) {
    redirect.searchParams.set(SHARE_QUERY.media, mediaIds.join(","));
  }
  redirect.searchParams.set(SHARE_QUERY.receivedAt, new Date().toISOString());
  redirect.searchParams.set(SHARE_QUERY.flag, "1");

  return NextResponse.redirect(redirect, 303);
}

/** Some clients probe with GET — show a friendly hint. */
export async function GET() {
  return NextResponse.json({
    message: "Reelish share target — share here from your mobile share sheet when the PWA is installed.",
  });
}
