import { execFile } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

import { MAX_VIDEO_FRAMES_HARD_CAP, MIN_VIDEO_FRAMES } from "@/lib/reconstruction/limits";

const execFileAsync = promisify(execFile);

const MAX_FRAMES_DEFAULT = 6;

function clampFrameCount(requested: number): number {
  if (!Number.isFinite(requested) || requested < MIN_VIDEO_FRAMES) return MIN_VIDEO_FRAMES;
  return Math.min(MAX_VIDEO_FRAMES_HARD_CAP, Math.floor(requested));
}

function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

/**
 * Sample up to `maxFrames` PNG frames spread across the video using fps filter.
 * Returns raw PNG file paths; caller reads bytes. Returns null if ffmpeg fails or is missing.
 */
export async function sampleVideoFramesToPngFiles(
  videoAbsolutePath: string,
  maxFrames = MAX_FRAMES_DEFAULT
): Promise<string[] | null> {
  const cap = clampFrameCount(maxFrames);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reelish-frames-"));
  const pattern = path.join(tmp, "f-%03d.png");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    videoAbsolutePath,
    "-vf",
    `fps=1/4,scale=720:-1`,
    "-frames:v",
    String(cap),
    pattern,
  ];
  try {
    await execFileAsync(ffmpegBin(), args, { timeout: 120_000 });
  } catch (e) {
    if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
      console.error("[reelish:ffmpeg:frames]", e instanceof Error ? e.message : e);
    }
    await fs.rm(tmp, { recursive: true }).catch(() => {});
    return null;
  }

  const files: string[] = [];
  for (let i = 1; i <= cap; i++) {
    const p = path.join(tmp, `f-${String(i).padStart(3, "0")}.png`);
    try {
      await fs.access(p);
      files.push(p);
    } catch {
      break;
    }
  }
  if (!files.length) {
    await fs.rm(tmp, { recursive: true }).catch(() => {});
    return null;
  }
  return files;
}

/**
 * Extract a mono 16 kHz WAV for Whisper when possible.
 */
export async function extractAudioWavFromVideo(videoAbsolutePath: string): Promise<string | null> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "reelish-audio-"));
  const out = path.join(tmp, "speech.wav");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    videoAbsolutePath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    out,
  ];
  try {
    await execFileAsync(ffmpegBin(), args, { timeout: 180_000 });
    await fs.access(out);
    return out;
  } catch (e) {
    if (process.env.REELISH_DEBUG_EXTRACTION === "1") {
      console.error("[reelish:ffmpeg:audio]", e instanceof Error ? e.message : e);
    }
    await fs.rm(tmp, { recursive: true }).catch(() => {});
    return null;
  }
}

export async function cleanupTempPaths(paths: string[]): Promise<void> {
  const dirs = new Set<string>();
  for (const p of paths) {
    dirs.add(path.dirname(p));
    await fs.unlink(p).catch(() => {});
  }
  for (const d of dirs) {
    await fs.rm(d, { recursive: true }).catch(() => {});
  }
}
