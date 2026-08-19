import type { RetrievalDiagnosticsSnapshot } from "@/lib/retrieval/types";
import type { RetrievalOrchestrationContext } from "@/lib/retrieval/types";

export function sharedMediaMarkersDiagnostics(ctx: RetrievalOrchestrationContext): RetrievalDiagnosticsSnapshot {
  if (!ctx.hasAttachedMediaIds) {
    return {
      providerId: "shared_media",
      safety: "share",
      attempted: true,
      succeeded: false,
      message: "no_server_media_asset_ids_this_run",
    };
  }

  return {
    providerId: "shared_media",
    safety: "share",
    attempted: true,
    succeeded: true,
    message: "media_ids_present_whisper_ocr_primary_when_text_weak",
    warn:
      ctx.preliminary.ingestionSource === "minimal_caption_hint" ||
      ctx.preliminary.minimalTextHintOnly === true
        ? "Multimodal evidence should outweigh thin share text."
        : undefined,
  };
}
