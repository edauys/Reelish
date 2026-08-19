/**
 * Native share handoff contract (iOS Share Extension / Android share intent)
 * =============================================================================
 *
 * All native surfaces should normalize into `ShareIntakePayload` (see `lib/share/types.ts`)
 * before calling `buildRecipeEvidence` / `runExtraction`. No scraping — only OS-provided
 * payloads and optional uploads that become `mediaAssetIds` (same contract as PWA).
 *
 * Field mapping (conceptual):
 *
 * | Native (iOS)                    | Native (Android)     | ShareIntakePayload        |
 * |--------------------------------|----------------------|---------------------------|
 * | NSURL in attachments           | Intent EXTRA_TEXT    | sharedUrl                 |
 * | plain text / attributed string | EXTRA_TEXT           | sharedText                |
 * | title / subject                | EXTRA_SUBJECT        | sharedTitle               |
 * | image/video → upload → ids     | stream URI → upload  | mediaAssetIds             |
 * | bundleIdentifier (host app)    | calling package      | sourceAppId               |
 * | localized app name (optional)  | app label            | sourceAppLabel            |
 * | extension completion time      | system timestamp     | receivedAt / client time  |
 * | app group / keychain session   | intent extras        | sessionId (optional)      |
 *
 * Set `origin: "native_share_extension"` for any handoff that did not come from the
 * Web Share Target POST (`web_share_target`).
 */

import { detectSourceFromUrl } from "@/lib/extraction/url-meta";
import type { ShareIntakePayload } from "@/lib/share/types";

/** Raw handoff from a native shell before normalization. */
export type NativeShareHandoffInput = {
  sharedUrl?: string;
  sharedText?: string;
  sharedTitle?: string;
  mediaAssetIds?: string[];
  sourceAppId?: string;
  sourceAppLabel?: string;
  /** When the OS / extension delivered the share (ISO 8601). Defaults to now. */
  receivedAt?: string;
  sessionId?: string;
};

/**
 * Convert a native share payload into the canonical `ShareIntakePayload`.
 * Deep links and authenticated POST bodies should produce the same shape.
 */
export function nativeHandoffToShareIntake(
  input: NativeShareHandoffInput,
  sessionIdFallback?: string
): ShareIntakePayload {
  const url = input.sharedUrl?.trim();
  const text = input.sharedText?.trim();
  const title = input.sharedTitle?.trim();
  const inferred = url ? detectSourceFromUrl(url) : undefined;
  const inferredPlatform = inferred && inferred !== "unknown" ? inferred : undefined;

  return {
    origin: "native_share_extension",
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    sessionId: input.sessionId?.trim() || sessionIdFallback,
    sharedUrl: url || undefined,
    sharedText: text || undefined,
    sharedTitle: title || undefined,
    mediaAssetIds: input.mediaAssetIds?.length ? [...new Set(input.mediaAssetIds)] : undefined,
    inferredPlatform,
    sourceAppId: input.sourceAppId?.trim() || undefined,
    sourceAppLabel: input.sourceAppLabel?.trim() || undefined,
  };
}
