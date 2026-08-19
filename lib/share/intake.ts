/**
 * Share intake — entry-point abstraction
 * =======================================
 *
 * All user-visible import paths should converge on `ShareIntakePayload` + `buildRecipeEvidence()`.
 *
 * | Entry point                    | Mechanism                                      | Maps to              |
 * |-------------------------------|------------------------------------------------|----------------------|
 * | Web Share Target (PWA)        | POST `/api/share-target` → redirect + query    | `web_share_target`   |
 * | Manual paste / type           | Dashboard form                                 | `manual_import`      |
 * | Media attach (upload)       | POST `/api/media/upload` → ids in form state   | same as manual*      |
 * | Native iOS Share Extension  | `reelish://handoff?…` / same query keys         | `native_share_extension` |
 * | Native Android share intent | (future) Intent → deep link or backend POST  | `native_share_extension` |
 *
 * *Uploads are still `manual_import` unless the client sets origin to `web_share_target` when
 *   continuing a share session (see `recipe-workflow` state).
 *
 * Future native handoff (sketch):
 * 1. iOS: Share extension copies URL/text into app group; host app opens `https://reelish.app/dashboard?share_url=...`
 *    or custom scheme `reelish://import?...` with the SAME query keys as `SHARE_QUERY` in `lib/share-target.ts`.
 * 2. Android: Intent extras mirrored into the same query shape via App Links.
 * 3. Optional: authenticated POST `/api/share/ingest` with JSON body matching `ShareIntakePayload` for large payloads.
 *
 * Do not add scraping here — only structured handoff.
 */

import { detectSourceFromUrl } from "@/lib/extraction/url-meta";
import type { ShareIntakeOrigin, ShareIntakePayload } from "@/lib/share/types";

const SESSION_KEY = "reelish_share_session_id";

/** Stable id per browser tab session for share debugging / correlation. */
export function getOrCreateShareSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function buildShareIntakePayload(params: {
  origin: ShareIntakeOrigin;
  receivedAt?: string;
  sessionId?: string;
  url?: string;
  text?: string;
  title?: string;
  mediaAssetIds?: string[];
  sourceAppId?: string;
  sourceAppLabel?: string;
  nativeMediaUploadPartial?: boolean;
  nativeHandoffFromAppGroupRelay?: boolean;
  nativeHandoffSimulatorBuild?: boolean;
  nativeHandoffManualResume?: boolean;
  combinedShareHandoff?: boolean;
  nativeNoAppGroupMediaBlocked?: boolean;
}): ShareIntakePayload {
  const url = params.url?.trim();
  const inferred = url ? detectSourceFromUrl(url) : undefined;
  const platform = inferred && inferred !== "unknown" ? inferred : undefined;

  return {
    origin: params.origin,
    receivedAt: params.receivedAt ?? new Date().toISOString(),
    sessionId: params.sessionId,
    sharedUrl: url,
    sharedText: params.text?.trim() || undefined,
    sharedTitle: params.title?.trim() || undefined,
    mediaAssetIds: params.mediaAssetIds?.length ? [...new Set(params.mediaAssetIds)] : undefined,
    inferredPlatform: platform,
    sourceAppId: params.sourceAppId?.trim() || undefined,
    sourceAppLabel: params.sourceAppLabel?.trim() || undefined,
    nativeMediaUploadPartial: params.nativeMediaUploadPartial === true ? true : undefined,
    nativeHandoffFromAppGroupRelay: params.nativeHandoffFromAppGroupRelay === true ? true : undefined,
    nativeHandoffSimulatorBuild: params.nativeHandoffSimulatorBuild === true ? true : undefined,
    nativeHandoffManualResume: params.nativeHandoffManualResume === true ? true : undefined,
    combinedShareHandoff: params.combinedShareHandoff === true ? true : undefined,
    nativeNoAppGroupMediaBlocked: params.nativeNoAppGroupMediaBlocked === true ? true : undefined,
  };
}
