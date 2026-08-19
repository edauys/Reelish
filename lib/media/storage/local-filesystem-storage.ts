import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { StoredMediaAsset } from "@/lib/media/types";
import { inferMimeFromBytesPrefix } from "@/lib/media/mime-sniff";
import {
  classifyMediaKind,
  ensureDir,
  extForMime,
  getMediaRoot,
  isSafeMediaAssetId,
  ensureWithinMediaRoot,
} from "@/lib/media/paths";
import type { MediaStorageBackend, SaveMediaParams } from "@/lib/media/storage/types";
import { MAX_MEDIA_UPLOAD_BYTES } from "@/lib/media/local-store-constants";

function metaPathFor(root: string, id: string): string {
  return path.join(root, `${id}.json`);
}

export class LocalFilesystemMediaStorage implements MediaStorageBackend {
  async saveUpload(params: SaveMediaParams): Promise<StoredMediaAsset> {
    const root = getMediaRoot();
    await ensureDir(root);

    if (params.buffer.length > MAX_MEDIA_UPLOAD_BYTES) {
      throw new Error(`File too large (max ${Math.floor(MAX_MEDIA_UPLOAD_BYTES / (1024 * 1024))}MB).`);
    }

    const id = randomUUID();
    let mime = params.mimeType;
    let kind = classifyMediaKind(mime);
    if (kind === "unknown" || mime.toLowerCase() === "application/octet-stream") {
      const inferred = inferMimeFromBytesPrefix(params.buffer);
      if (inferred) {
        mime = inferred;
        kind = classifyMediaKind(inferred);
      }
    }
    const ext = extForMime(mime);
    const rel = `${id}${ext}`;
    const abs = path.join(root, rel);

    await fs.writeFile(abs, params.buffer);

    const record: StoredMediaAsset = {
      mediaAssetId: id,
      mediaType: kind,
      mimeType: mime,
      byteSize: params.buffer.length,
      originalFilename: params.originalFilename,
      sourceUrl: params.sourceUrl?.trim() || undefined,
      storagePath: rel,
      storageRoot: root,
      ingestionStatus: "ready",
      createdAt: new Date().toISOString(),
    };

    await fs.writeFile(metaPathFor(root, id), JSON.stringify(record, null, 2), "utf8");
    return record;
  }

  async getStoredMediaAsset(id: string): Promise<StoredMediaAsset | null> {
    if (!isSafeMediaAssetId(id)) return null;
    const root = getMediaRoot();
    const meta = metaPathFor(root, id);
    try {
      const raw = await fs.readFile(meta, "utf8");
      return JSON.parse(raw) as StoredMediaAsset;
    } catch {
      return null;
    }
  }

  resolveAbsolutePath(asset: StoredMediaAsset): string | null {
    const root = getMediaRoot();
    const joined = path.join(root, asset.storagePath);
    if (!ensureWithinMediaRoot(joined, root)) return null;
    return joined;
  }

  async readMediaFile(id: string): Promise<{ asset: StoredMediaAsset; buffer: Buffer } | null> {
    const asset = await this.getStoredMediaAsset(id);
    if (!asset) return null;
    const abs = this.resolveAbsolutePath(asset);
    if (!abs) return null;
    try {
      const buffer = await fs.readFile(abs);
      return { asset, buffer };
    } catch {
      return null;
    }
  }
}
