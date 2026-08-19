/**
 * Multimodal provider bundle — swap noop implementations for real ASR/OCR/vision when available.
 */
import type { FrameSampler } from "@/lib/reconstruction/providers/frames";
import { noopFrameSampler } from "@/lib/reconstruction/providers/frames";
import type { OcrTextProvider } from "@/lib/reconstruction/providers/ocr";
import { noopOcrTextProvider } from "@/lib/reconstruction/providers/ocr";
import { openAiWhisperTranscriptProvider } from "@/lib/reconstruction/providers/openai-whisper";
import type { TranscriptProvider } from "@/lib/reconstruction/providers/transcript";
import { noopTranscriptProvider } from "@/lib/reconstruction/providers/transcript";
import type { VisualIngredientProvider } from "@/lib/reconstruction/providers/visual";
import { noopVisualIngredientProvider } from "@/lib/reconstruction/providers/visual";

export { noopFrameSampler } from "@/lib/reconstruction/providers/frames";
export { ffmpegFrameSampler } from "@/lib/reconstruction/providers/ffmpeg-frame-sampler";
export { noopOcrTextProvider } from "@/lib/reconstruction/providers/ocr";
export { noopTranscriptProvider } from "@/lib/reconstruction/providers/transcript";
export { noopVisualIngredientProvider } from "@/lib/reconstruction/providers/visual";
export { openAiWhisperTranscriptProvider } from "@/lib/reconstruction/providers/openai-whisper";
export { analyzeCookingFramesWithOpenAI } from "@/lib/reconstruction/providers/openai-frame-analysis";

export type MultimodalProviderBundle = {
  transcript: TranscriptProvider;
  ocr: OcrTextProvider;
  visual: VisualIngredientProvider;
  frames: FrameSampler;
};

export const defaultMultimodalProviderBundle: MultimodalProviderBundle = {
  transcript: noopTranscriptProvider,
  ocr: noopOcrTextProvider,
  visual: noopVisualIngredientProvider,
  frames: noopFrameSampler,
};

function resolveTranscriptProvider(): TranscriptProvider {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return openAiWhisperTranscriptProvider;
  }
  return noopTranscriptProvider;
}

/** Active bundle: Whisper when `OPENAI_API_KEY` is set; OCR/visual frames run via `gather-evidence` + OpenAI vision. */
export function getMultimodalProviderBundle(): MultimodalProviderBundle {
  return {
    transcript: resolveTranscriptProvider(),
    ocr: noopOcrTextProvider,
    visual: noopVisualIngredientProvider,
    frames: noopFrameSampler,
  };
}
