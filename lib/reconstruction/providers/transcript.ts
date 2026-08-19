import type { RecipeSource } from "@/types/recipe";

/**
 * Transcript extraction — ASR from uploaded/shared audio or future platform assets.
 * Social URLs alone do not imply downloadable media (no scraping).
 */
export type TranscriptJobInput = {
  sourceUrl?: string;
  sourcePlatform?: RecipeSource;
  mediaAssetId?: string;
  /** Base64 audio bytes or `data:audio/...;base64,...`. */
  audioBase64?: string;
  audioMimeType?: string;
  /** Suggested filename for multipart upload (Whisper). */
  filenameHint?: string;
};

export interface TranscriptResult {
  text: string;
  /** 0–1 when the provider supplies it; Whisper often omits this. */
  confidence?: number;
  provider?: string;
}

export interface TranscriptProvider {
  fetchTranscript(input: TranscriptJobInput): Promise<TranscriptResult | null>;
}

export const noopTranscriptProvider: TranscriptProvider = {
  async fetchTranscript() {
    return null;
  },
};
