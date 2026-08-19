import type { RecipeSource } from "@/types/recipe";

/** Future: on-screen text from sampled frames (official OCR / vision APIs). */
export type OcrJobInput = {
  sourceUrl?: string;
  sourcePlatform?: RecipeSource;
  frameUrls?: string[];
  /** Inline frame images (base64 or data URLs) when available. */
  imageBase64Parts?: string[];
  mediaAssetId?: string;
};

export interface OcrTextProvider {
  extractOnScreenText(input: OcrJobInput): Promise<string | null>;
}

export const noopOcrTextProvider: OcrTextProvider = {
  async extractOnScreenText() {
    return null;
  },
};
