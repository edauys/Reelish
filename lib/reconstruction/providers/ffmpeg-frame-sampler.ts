import fs from "fs/promises";
import { sampleVideoFramesToPngFiles, cleanupTempPaths } from "@/lib/media/ffmpeg-pipeline";
import type { FrameSampler, FrameSampleInput } from "@/lib/reconstruction/providers/frames";

/**
 * Real frame sampler for local video files (dev + uploaded assets).
 * Returns raw base64 PNG strings for the vision provider, or null if ffmpeg is unavailable.
 */
export const ffmpegFrameSampler: FrameSampler = {
  async sampleFrames(input: FrameSampleInput): Promise<string[] | null> {
    const path = input.localVideoPath?.trim();
    if (!path) return null;
    const pngPaths = await sampleVideoFramesToPngFiles(path, input.maxFrames ?? 6);
    if (!pngPaths?.length) return null;
    const out: string[] = [];
    try {
      for (const p of pngPaths) {
        const buf = await fs.readFile(p);
        out.push(`data:image/png;base64,${buf.toString("base64")}`);
      }
      return out;
    } finally {
      await cleanupTempPaths(pngPaths);
    }
  },
};
