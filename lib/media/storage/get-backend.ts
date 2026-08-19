import { LocalFilesystemMediaStorage } from "@/lib/media/storage/local-filesystem-storage";
import type { MediaStorageBackend } from "@/lib/media/storage/types";

let singleton: MediaStorageBackend | null = null;

/**
 * Resolve the active storage backend. Default `local` uses `REELISH_MEDIA_DIR` on disk.
 * Set `REELISH_MEDIA_STORAGE_BACKEND=s3` when an S3 adapter is implemented — extraction stays unchanged.
 */
export function getMediaStorageBackend(): MediaStorageBackend {
  if (singleton) return singleton;
  const backend = process.env.REELISH_MEDIA_STORAGE_BACKEND?.trim().toLowerCase() || "local";
  if (backend === "local") {
    singleton = new LocalFilesystemMediaStorage();
    return singleton;
  }
  if (backend === "s3") {
    throw new Error(
      "REELISH_MEDIA_STORAGE_BACKEND=s3 is not implemented yet. Use local filesystem or add lib/media/storage/s3-storage.ts."
    );
  }
  throw new Error(`Unknown REELISH_MEDIA_STORAGE_BACKEND: ${backend}`);
}
