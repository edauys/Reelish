import fs from "fs/promises";
import type { RecipeEvidence, RecipeMediaHints } from "@/lib/reconstruction/types";
import { resolveMaxVideoFramesFromEnv } from "@/lib/reconstruction/limits";
import { extractAudioWavFromVideo, sampleVideoFramesToPngFiles, cleanupTempPaths } from "@/lib/media/ffmpeg-pipeline";
import { inferMimeFromBytesPrefix } from "@/lib/media/mime-sniff";
import { getStoredMediaAsset, readMediaFile, resolveMediaAbsolutePath } from "@/lib/media/local-store";
import { classifyMediaKind, isSafeMediaAssetId } from "@/lib/media/paths";

const MAX_FRAMES = resolveMaxVideoFramesFromEnv();

export type MediaExpansionMeta = {
  serverAssetIds: string[];
  ffmpegFramesUsed: boolean;
  ffmpegAudioFromVideoUsed: boolean;
  processingNotes: string[];
  /** At least one stored asset was classified as video before expansion. */
  sawVideoAsset: boolean;
  /** At least one stored asset was classified as image before expansion. */
  sawImageAsset: boolean;
  /** At least one stored asset was classified as audio before expansion. */
  sawAudioAsset: boolean;
};

function bufferToDataUrl(mime: string, buf: Buffer): string {
  const b64 = buf.toString("base64");
  return `data:${mime};base64,${b64}`;
}

/**
 * Resolve server `mediaAssetId(s)` into inline buffers for Whisper + vision.
 * Keeps any client-supplied base64; merges image parts.
 */
export async function expandRecipeMediaHints(
  hints: RecipeMediaHints | undefined,
  meta: MediaExpansionMeta
): Promise<RecipeMediaHints> {
  if (!hints) return {};

  const hadClientAudio = Boolean(hints.audioBase64?.trim());

  const out: RecipeMediaHints = {
    audioBase64: hints.audioBase64,
    audioMimeType: hints.audioMimeType,
    imageBase64Parts: [...(hints.imageBase64Parts ?? [])],
  };

  const ids = new Set<string>();
  if (hints.mediaAssetId?.trim()) ids.add(hints.mediaAssetId.trim());
  for (const id of hints.mediaAssetIds ?? []) {
    if (id?.trim()) ids.add(id.trim());
  }

  for (const rawId of ids) {
    if (!isSafeMediaAssetId(rawId)) {
      meta.processingNotes.push(`Ignored invalid media id.`);
      continue;
    }
    const loaded = await readMediaFile(rawId);
    if (!loaded) {
      meta.processingNotes.push(`Media asset not found (expired or invalid): ${rawId.slice(0, 8)}…`);
      continue;
    }
    meta.serverAssetIds.push(rawId);
    let { asset, buffer } = loaded;
    const abs = resolveMediaAbsolutePath(asset);
    if (!abs) continue;

    let kind = asset.mediaType;
    let effectiveMime = asset.mimeType;
    if (kind === "unknown") {
      const inferred = inferMimeFromBytesPrefix(buffer);
      if (inferred) {
        effectiveMime = inferred;
        kind = classifyMediaKind(inferred);
        meta.processingNotes.push(
          `Re-classified ${asset.mediaAssetId.slice(0, 8)}… from bytes as ${inferred} (${kind}).`
        );
      }
    }

    if (kind === "audio") {
      meta.sawAudioAsset = true;
      out.audioBase64 = bufferToDataUrl(effectiveMime, buffer);
      out.audioMimeType = effectiveMime;
    } else if (kind === "image") {
      meta.sawImageAsset = true;
      out.imageBase64Parts!.push(bufferToDataUrl(effectiveMime, buffer));
    } else if (kind === "video") {
      meta.sawVideoAsset = true;
      const framePaths = await sampleVideoFramesToPngFiles(abs, MAX_FRAMES);
      if (framePaths?.length) {
        meta.ffmpegFramesUsed = true;
        const pngRead: string[] = [];
        try {
          for (const fp of framePaths) {
            const b = await fs.readFile(fp);
            pngRead.push(bufferToDataUrl("image/png", b));
          }
          out.imageBase64Parts!.push(...pngRead);
        } finally {
          await cleanupTempPaths(framePaths);
        }
      } else {
        meta.processingNotes.push(
          "Video frames could not be sampled (install ffmpeg locally and ensure it is on PATH, or set FFMPEG_PATH)."
        );
      }

      if (!hadClientAudio) {
        const wavPath = await extractAudioWavFromVideo(abs);
        if (wavPath) {
          try {
            const wav = await fs.readFile(wavPath);
            out.audioBase64 = bufferToDataUrl("audio/wav", wav);
            out.audioMimeType = "audio/wav";
            meta.ffmpegAudioFromVideoUsed = true;
          } finally {
            await cleanupTempPaths([wavPath]);
          }
        } else if (!meta.ffmpegFramesUsed) {
          meta.processingNotes.push("Could not extract audio from video (ffmpeg required).");
        }
      }
    } else {
      meta.processingNotes.push(
        `Unsupported media type for asset ${asset.mediaAssetId.slice(0, 8)}… (${asset.mimeType}${kind === "unknown" ? "; byte sniff did not match a known image/video/audio signature" : ""}) — not recognized as image, video, or audio after upload.`
      );
    }
  }

  if (!out.imageBase64Parts?.length) delete out.imageBase64Parts;
  if (!out.audioBase64?.trim()) {
    delete out.audioBase64;
    delete out.audioMimeType;
  }

  return out;
}

/**
 * Expand server-side assets into `RecipeEvidence` and attach processing notes.
 */
export async function expandMediaInEvidence(
  evidence: RecipeEvidence,
  meta: MediaExpansionMeta
): Promise<RecipeEvidence> {
  const expandedHints = await expandRecipeMediaHints(evidence.mediaHints, meta);
  return {
    ...evidence,
    mediaHints: expandedHints,
    mediaProcessingNotes:
      meta.processingNotes.length > 0 ? meta.processingNotes : evidence.mediaProcessingNotes,
  };
}

/** Lightweight check without reading bytes. */
export async function countResolvableMediaIds(hints?: RecipeMediaHints): Promise<number> {
  if (!hints) return 0;
  const ids = new Set<string>();
  if (hints.mediaAssetId?.trim()) ids.add(hints.mediaAssetId.trim());
  for (const id of hints.mediaAssetIds ?? []) {
    if (id?.trim()) ids.add(id.trim());
  }
  let n = 0;
  for (const id of ids) {
    if (!isSafeMediaAssetId(id)) continue;
    const a = await getStoredMediaAsset(id);
    if (a) n++;
  }
  return n;
}
