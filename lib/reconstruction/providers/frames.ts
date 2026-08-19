import type { RecipeSource } from "@/types/recipe";

/** Frame sampling for OCR/vision — local video path or future resolved asset (no URL scraping). */
export type FrameSampleInput = {
  sourceUrl?: string;
  sourcePlatform?: RecipeSource;
  mediaAssetId?: string;
  /** Absolute path to a video file on the server (upload / temp). */
  localVideoPath?: string;
  maxFrames?: number;
};

export interface FrameSampler {
  sampleFrames(input: FrameSampleInput): Promise<string[] | null>;
}

export const noopFrameSampler: FrameSampler = {
  async sampleFrames() {
    return null;
  },
};
