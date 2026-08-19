import type { RecipeSource } from "@/types/recipe";

/**
 * Where the import request entered the Reelish pipeline.
 * - `web_share_target`: Chromium PWA POST → `/api/share-target` → dashboard query params.
 * - `manual_import`: user typed/pasted in the dashboard (or demo) without a share redirect.
 * - `native_share_extension`: reserved for iOS Share Extension / Android share intent → same payload shape.
 * - `programmatic`: server actions, tests, or internal callers.
 */
export type ShareIntakeOrigin = "web_share_target" | "manual_import" | "native_share_extension" | "programmatic";

/**
 * Normalized share handoff — any entry point (web, native later, API) maps into this before `RecipeEvidence`.
 * Keep fields JSON-serializable; no raw media bytes here (use `mediaAssetIds`).
 */
export interface ShareIntakePayload {
  origin: ShareIntakeOrigin;
  /** ISO 8601 — when Reelish accepted the intake (client clock for PWA; server for share-target redirect). */
  receivedAt: string;
  /** Optional correlation id (tab session, support); not a security boundary. */
  sessionId?: string;
  sharedUrl?: string;
  sharedText?: string;
  sharedTitle?: string;
  mediaAssetIds?: string[];
  /** From shared URL when detectable; metadata only. */
  inferredPlatform?: RecipeSource;
  /**
   * Originating app (share extension / intent). Optional — PWA often omits this.
   * iOS: bundle id (e.g. `com.burbn.instagram`). Android: package name.
   */
  sourceAppId?: string;
  /** Human-readable app name from the OS share sheet when available. */
  sourceAppLabel?: string;
  /** Native host uploaded some App Group files but not all (size limit, network, or server rejection). */
  nativeMediaUploadPartial?: boolean;
  /** Host restored the full handoff query from App Group after a short wake `reelish://` URL. */
  nativeHandoffFromAppGroupRelay?: boolean;
  /** Handoff was produced by the Simulator-target share extension build (auto-open often fails). */
  nativeHandoffSimulatorBuild?: boolean;
  /** Full handoff was replayed on `applicationDidBecomeActive` (user opened app manually). */
  nativeHandoffManualResume?: boolean;
  /**
   * True when URL + text + optional media came from one Share → Reelish action (PWA or native app).
   * Models a single multimodal import, not disconnected hints.
   */
  combinedShareHandoff?: boolean;
  /**
   * Native (Personal Team): iOS offered media types but App Group staging was unavailable —
   * `share_media` will be empty; transcript/OCR won’t run from extension-staged files.
   */
  nativeNoAppGroupMediaBlocked?: boolean;
}
