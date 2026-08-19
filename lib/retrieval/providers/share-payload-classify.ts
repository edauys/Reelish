import { looksLikeIosInstagramLinkTeaser } from "@/lib/share/caption-intake-hints";
import type { RetrievalDiagnosticsSnapshot } from "@/lib/retrieval/types";
import type { RetrievalOrchestrationContext } from "@/lib/retrieval/types";

export function classifySharePayloadDiagnostics(ctx: RetrievalOrchestrationContext): RetrievalDiagnosticsSnapshot {
  const txt = ctx.shareTextAtOpen?.trim() ?? "";
  const teaser = txt ? looksLikeIosInstagramLinkTeaser(txt) : false;
  const titleLen = ctx.shareTitleAtOpen?.trim().length ?? 0;

  let message = txt ? (teaser ? "share_text_preview_line" : "share_text_non_teaser_heuristic") : "share_text_absent";

  const succeeded = txt.length > 0 || titleLen > 0;
  const detail = titleLen ? `${message}_with_title_${titleLen}` : message;

  return {
    providerId: "share_payload_classify",
    safety: "share",
    attempted: true,
    succeeded,
    message: detail,
    warn: teaser ? "Treat share text as teaser until stronger recovery exists." : undefined,
  };
}
