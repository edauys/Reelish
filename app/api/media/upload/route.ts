import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserForApiRoute } from "@/lib/auth/api-route-user";
import { uploadRequiresAuth } from "@/lib/auth/env-flags";
import { MAX_MEDIA_UPLOAD_BYTES, saveMediaUpload } from "@/lib/media/local-store";
import { checkAnonUploadRateLimit, checkUploadRateLimit } from "@/lib/rate-limit/in-memory";
import { logReelishTelemetry, shortId } from "@/lib/telemetry/reelish-log";

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Upload media for extraction — requires a signed-in user by default (`REELISH_UPLOAD_REQUIRE_AUTH=0` to disable for local tooling).
 * Native iOS sends `Authorization: Bearer <access_token>` (synced via `@capacitor/preferences`); web uses cookies.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserForApiRoute(request);

    if (uploadRequiresAuth() && !user) {
      return NextResponse.json(
        { error: "Sign in required to upload media.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    if (user) {
      const rl = checkUploadRateLimit(user.id);
      if (!rl.ok) {
        return NextResponse.json(
          {
            error: "Upload rate limit exceeded. Try again later.",
            code: "RATE_LIMITED",
            retryAfterMs: rl.retryAfterMs,
          },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
      }
    } else {
      const rl = checkAnonUploadRateLimit(clientIp(request));
      if (!rl.ok) {
        return NextResponse.json(
          {
            error: "Upload rate limit exceeded for this network. Sign in for higher limits.",
            code: "RATE_LIMITED",
            retryAfterMs: rl.retryAfterMs,
          },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
      }
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: "Expected non-empty multipart field `file`.", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }
    if (file.size > MAX_MEDIA_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (max ${Math.floor(MAX_MEDIA_UPLOAD_BYTES / (1024 * 1024))}MB).`,
          code: "PAYLOAD_TOO_LARGE",
        },
        { status: 413 }
      );
    }
    const mime = file.type || "application/octet-stream";
    const m = mime.toLowerCase();
    if (m.startsWith("text/") || m === "application/json" || m === "application/javascript") {
      return NextResponse.json({ error: "Unsupported media type for this endpoint.", code: "UNSUPPORTED_TYPE" }, { status: 415 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim() || undefined;

    const asset = await saveMediaUpload({
      buffer,
      mimeType: file.type || "application/octet-stream",
      originalFilename: file.name,
      sourceUrl,
    });

    logReelishTelemetry("media.upload.ok", {
      userId: user ? shortId(user.id) : "anon",
      byteSize: asset.byteSize,
      mediaType: asset.mediaType,
      mimeType: asset.mimeType,
    });

    return NextResponse.json({
      mediaAssetId: asset.mediaAssetId,
      mediaType: asset.mediaType,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      ingestionStatus: asset.ingestionStatus,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: msg, code: "UPLOAD_FAILED" }, { status: 400 });
  }
}
