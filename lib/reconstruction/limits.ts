/**
 * Central caps for multimodal reconstruction — keeps prompts bounded and mobile-friendly.
 */

/** Max characters from speech transcript injected into the extraction model (full evidence may store same cap). */
export const MAX_TRANSCRIPT_CHARS_MODEL = 14_000;

/** Max characters from OCR / on-screen text injected into the extraction model. */
export const MAX_OCR_CHARS_MODEL = 10_000;

/** Max characters for the primary caption/recipe block inside the combined multimodal prompt. */
export const MAX_PRIMARY_TEXT_IN_MODEL = 50_000;

/** Video frame sampling: clamp env and hard-cap for performance. */
export const MAX_VIDEO_FRAMES_HARD_CAP = 10;
export const MIN_VIDEO_FRAMES = 3;

export function resolveMaxVideoFramesFromEnv(): number {
  const n = Number(process.env.REELISH_MAX_VIDEO_FRAMES ?? "6");
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
  return Math.min(MAX_VIDEO_FRAMES_HARD_CAP, Math.max(MIN_VIDEO_FRAMES, v));
}

/**
 * Truncate long multimodal strings with a clear marker (preserves start of content).
 */
export function clipTextForMultimodalPipeline(text: string | undefined, maxChars: number): string | undefined {
  const t = text?.trim();
  if (!t) return text;
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n… (truncated for processing limits)`;
}

/** OpenAI extraction HTTP timeout (large multimodal prompts). Override with `REELISH_EXTRACTION_TIMEOUT_MS`. */
export function resolveExtractionFetchTimeoutMs(): number {
  const n = Number(process.env.REELISH_EXTRACTION_TIMEOUT_MS ?? "120000");
  return Number.isFinite(n) && n >= 15_000 ? Math.min(300_000, Math.floor(n)) : 120_000;
}
