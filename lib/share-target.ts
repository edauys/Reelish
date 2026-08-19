/**
 * Web Share Target (PWA) — client helpers
 * ----------------------------------------
 * When Reelish is installed as a PWA, the OS can POST `multipart/form-data`
 * to the URL declared in `manifest.json` → `share_target`.
 *
 * MVP flow:
 * 1. Browser POSTs to `/api/share-target` with fields like `url`, `text`, `title`, and optional `files` (PWA Level 2).
 * 2. Files are stored under `REELISH_MEDIA_DIR` (see `lib/media/local-store.ts`); redirect includes short `share_media` ids.
 * 3. Route responds with a 303 redirect to `/dashboard?...` so the client can pre-fill the import form.
 * 4. Extraction prioritizes shared/pasted caption text, then recipe text, then title; a bare URL alone
 *    does not produce a fake recipe unless media is attached (see `lib/extraction/ingestion.ts`).
 *
 * Limitations (document in README):
 * - Share Target works best when the PWA is installed; some browsers require HTTPS.
 * - iOS Safari share-to-PWA support has historically been uneven — test on device.
 * - Very large pasted recipes may need truncation (we cap query length).
 *
 * Native apps later:
 * - iOS Share Extension / Android Intent would receive shares without relying on
 *   manifest POST; you'd deep link into the app with the shared URL/text.
 */

import { normalizeShareIntakeText } from "@/lib/share/normalize-share-text";

/** Native share extension may split long captions across `share_text`, `share_text_2`, … */
export const MAX_SHARE_TEXT_SEGMENTS = 32;

export const SHARE_QUERY = {
  url: "share_url",
  text: "share_text",
  title: "share_title",
  /** Comma-separated server `mediaAssetId` values from share-target file handoff. */
  media: "share_media",
  /** ISO time from server when the share-target POST was handled (provenance). */
  receivedAt: "share_received_at",
  /** Optional: originating app bundle id / package (native deep links). */
  sourceApp: "share_source_app",
  /** Optional: human-readable source app name. */
  sourceAppLabel: "share_source_label",
  flag: "from_share",
  /** `"1"` when the handoff comes from native iOS/Android share (not the PWA POST). */
  nativeIntake: "intake_native",
  /** iOS host uploaded staged files from App Group before WebView saw the URL (`share_media` populated). */
  nativeStagedMedia: "share_native_staged",
  /** Some staged files failed upload; at least one `share_media` id may still be present. */
  uploadPartial: "share_upload_partial",
  /** Internal: extension session id — removed by the host after upload (cleanup only). */
  shareInbox: "share_inbox",
  /** Native host failed to upload staged App Group files (`share_inbox` removed without `share_media`). */
  nativeUploadFailed: "share_native_upload_failed",
  /** Host merged full handoff from App Group after a minimal wake URL (`app_group_handoff=1`). */
  handoffRelay: "share_handoff_relay",
  /** Share extension Simulator build — auto-open is often unreliable; informational. */
  handoffSimulator: "share_handoff_simulator",
  /** Pending handoff replayed when the user opened the app manually (extension `open` failed). */
  handoffManualResume: "share_handoff_manual_resume",
  /**
   * Personal Team / no App Group: iOS offered media but it could not be staged (no shared container).
   * See `docs/PERSONAL_TEAM_IOS_FALLBACK.md`.
   */
  noAppGroupStaging: "share_no_app_group",
} as const;

export function readShareFromSearchParams(searchParams: URLSearchParams): {
  url: string;
  text: string;
  title: string;
  /** Resolved media asset ids from PWA share file handoff. */
  mediaAssetIds: string[];
  /** Server timestamp when `/api/share-target` accepted the POST (if present). */
  shareReceivedAt: string;
  fromShare: boolean;
  /** True when `intake_native=1` (native share shell / extension). */
  nativeIntake: boolean;
  /** True when `share_native_staged=1` (iOS uploaded App Group files to `/api/media/upload`). */
  nativeStagedMedia: boolean;
  /** True when `share_upload_partial=1` (native upload had per-file failures). */
  uploadPartial: boolean;
  /** True when native staged upload failed entirely (no media ids). */
  nativeUploadFailed: boolean;
  /** Present while iOS still has `share_inbox` in the URL (media staging upload in flight). */
  shareInboxPending: boolean;
  sourceAppId: string;
  sourceAppLabel: string;
  handoffFromAppGroupRelay: boolean;
  handoffSimulatorBuild: boolean;
  handoffManualResume: boolean;
  /** True when native extension signals media was blocked (Personal Team — no App Group container). */
  noAppGroupStaging: boolean;
} {
  const url = searchParams.get(SHARE_QUERY.url) ?? "";
  const textSegments: string[] = [];
  const first = searchParams.get(SHARE_QUERY.text) ?? "";
  if (first) textSegments.push(first);
  for (let seg = 2; seg <= MAX_SHARE_TEXT_SEGMENTS; seg++) {
    const part = searchParams.get(`${SHARE_QUERY.text}_${seg}`) ?? "";
    if (part) textSegments.push(part);
  }
  const text = normalizeShareIntakeText(textSegments.join("\n\n"));
  const title = normalizeShareIntakeText(searchParams.get(SHARE_QUERY.title) ?? "", { dedupeUrlLines: false });
  const mediaRaw = searchParams.get(SHARE_QUERY.media) ?? "";
  const mediaAssetIds = mediaRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const shareReceivedAt = searchParams.get(SHARE_QUERY.receivedAt) ?? "";
  const fromShare = searchParams.get(SHARE_QUERY.flag) === "1";
  const nativeIntake = searchParams.get(SHARE_QUERY.nativeIntake) === "1";
  const nativeStagedMedia = searchParams.get(SHARE_QUERY.nativeStagedMedia) === "1";
  const uploadPartial = searchParams.get(SHARE_QUERY.uploadPartial) === "1";
  const nativeUploadFailed = searchParams.get(SHARE_QUERY.nativeUploadFailed) === "1";
  const shareInboxPending = Boolean((searchParams.get(SHARE_QUERY.shareInbox) ?? "").trim());
  const sourceAppId = searchParams.get(SHARE_QUERY.sourceApp) ?? "";
  const sourceAppLabel = searchParams.get(SHARE_QUERY.sourceAppLabel) ?? "";
  const handoffFromAppGroupRelay = searchParams.get(SHARE_QUERY.handoffRelay) === "1";
  const handoffSimulatorBuild = searchParams.get(SHARE_QUERY.handoffSimulator) === "1";
  const handoffManualResume = searchParams.get(SHARE_QUERY.handoffManualResume) === "1";
  const noAppGroupStaging = searchParams.get(SHARE_QUERY.noAppGroupStaging) === "1";
  return {
    url,
    text,
    title,
    mediaAssetIds,
    shareReceivedAt,
    fromShare,
    nativeIntake,
    nativeStagedMedia,
    uploadPartial,
    nativeUploadFailed,
    shareInboxPending,
    sourceAppId,
    sourceAppLabel,
    handoffFromAppGroupRelay,
    handoffSimulatorBuild,
    handoffManualResume,
    noAppGroupStaging,
  };
}
