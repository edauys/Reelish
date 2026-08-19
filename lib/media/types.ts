/**
 * Server-side media ingestion model — local MVP store with a path to Supabase Storage / object storage later.
 */

export type IngestionMediaType = "audio" | "video" | "image" | "unknown";

export type IngestionStatus =
  | "pending"
  | "ready"
  | "processing"
  | "failed"
  | "purged";

/**
 * Canonical record for an uploaded or share-handoff media asset (persisted next to bytes on disk for MVP).
 */
export interface StoredMediaAsset {
  mediaAssetId: string;
  mediaType: IngestionMediaType;
  mimeType: string;
  byteSize: number;
  /** Original client filename when known. */
  originalFilename?: string;
  /** Social URL from share context when provided (metadata only — we do not fetch it). */
  sourceUrl?: string;
  /** Relative path under the media root, e.g. `ab/cd/uuid.mp4`. */
  storagePath: string;
  /** Absolute directory root used at save time (for resolving reads). */
  storageRoot: string;
  durationSec?: number;
  width?: number;
  height?: number;
  ingestionStatus: IngestionStatus;
  createdAt: string;
  /** Optional processing notes (e.g. ffmpeg missing). */
  processingNote?: string;
}
