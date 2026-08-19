import type { StoredMediaAsset } from "@/lib/media/types";

export type SaveMediaParams = {
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
  sourceUrl?: string;
};

/**
 * Pluggable persistence for uploaded media bytes + sidecar metadata.
 * Default: local filesystem (`REELISH_MEDIA_STORAGE_BACKEND=local`).
 * Future: S3-compatible (`s3`) — swap adapter without changing extraction.
 */
export interface MediaStorageBackend {
  saveUpload(params: SaveMediaParams): Promise<StoredMediaAsset>;
  getStoredMediaAsset(id: string): Promise<StoredMediaAsset | null>;
  /** Resolved absolute path for ffmpeg / local tools, or null when not file-backed. */
  resolveAbsolutePath(asset: StoredMediaAsset): string | null;
  readMediaFile(id: string): Promise<{ asset: StoredMediaAsset; buffer: Buffer } | null>;
}
