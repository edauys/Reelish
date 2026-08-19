import type { StoredMediaAsset } from "@/lib/media/types";
import { getMediaStorageBackend } from "@/lib/media/storage/get-backend";
import type { SaveMediaParams } from "@/lib/media/storage/types";

export { MAX_MEDIA_UPLOAD_BYTES } from "@/lib/media/local-store-constants";

/**
 * Save uploaded bytes via the configured storage backend (default: local disk).
 */
export async function saveMediaUpload(params: SaveMediaParams): Promise<StoredMediaAsset> {
  return getMediaStorageBackend().saveUpload(params);
}

export async function getStoredMediaAsset(id: string): Promise<StoredMediaAsset | null> {
  return getMediaStorageBackend().getStoredMediaAsset(id);
}

export function resolveMediaAbsolutePath(asset: StoredMediaAsset): string | null {
  return getMediaStorageBackend().resolveAbsolutePath(asset);
}

export async function readMediaFile(id: string): Promise<{ asset: StoredMediaAsset; buffer: Buffer } | null> {
  return getMediaStorageBackend().readMediaFile(id);
}
