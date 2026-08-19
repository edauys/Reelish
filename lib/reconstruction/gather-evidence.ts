import { analyzeCookingFramesWithOpenAI } from "@/lib/reconstruction/providers/openai-frame-analysis";
import {
  clipTextForMultimodalPipeline,
  MAX_OCR_CHARS_MODEL,
  MAX_TRANSCRIPT_CHARS_MODEL,
} from "@/lib/reconstruction/limits";
import type { MultimodalProviderBundle } from "@/lib/reconstruction/providers";
import { getMultimodalProviderBundle } from "@/lib/reconstruction/providers";
import type { RecipeEvidence } from "@/lib/reconstruction/types";
import type { MediaExpansionMeta } from "@/lib/media/expand-recipe-media-hints";
import { expandMediaInEvidence } from "@/lib/media/expand-recipe-media-hints";

function hasExpandedMediaContent(evidence: RecipeEvidence): boolean {
  const m = evidence.mediaHints;
  if (!m) return false;
  if (m.audioBase64?.trim()) return true;
  return (m.imageBase64Parts?.filter((x) => Boolean(x?.trim())).length ?? 0) > 0;
}

function hadMediaIntent(evidence: RecipeEvidence): boolean {
  const m = evidence.mediaHints;
  if (!m) return false;
  if (m.audioBase64?.trim()) return true;
  if (m.mediaAssetId?.trim()) return true;
  if ((m.mediaAssetIds?.length ?? 0) > 0) return true;
  return m.imageBase64Parts?.some((x) => Boolean(x?.trim())) ?? false;
}

function collectMediaIds(evidence: RecipeEvidence): string[] {
  const m = evidence.mediaHints;
  if (!m) return [];
  const raw = [...(m.mediaAssetIds ?? []), ...(m.mediaAssetId ? [m.mediaAssetId] : [])];
  return [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
}

/**
 * Enrich evidence with transcript (Whisper when audio is attached) and a single vision pass
 * for OCR + visual hints when frame images are attached. Does not download media from social URLs.
 * Server-stored assets are resolved to buffers first (see `lib/media/expand-recipe-media-hints.ts`).
 */
export async function enrichEvidenceWithMultimodalProviders(
  evidence: RecipeEvidence,
  providers: MultimodalProviderBundle = getMultimodalProviderBundle()
): Promise<RecipeEvidence> {
  const expansionMeta: MediaExpansionMeta = {
    serverAssetIds: [],
    ffmpegFramesUsed: false,
    ffmpegAudioFromVideoUsed: false,
    processingNotes: [],
    sawVideoAsset: false,
    sawImageAsset: false,
    sawAudioAsset: false,
  };

  const expanded = await expandMediaInEvidence(evidence, expansionMeta);

  const hasUrl = Boolean(expanded.sourceUrl?.trim());
  const hasContent = hasExpandedMediaContent(expanded);
  const intent = hadMediaIntent(evidence);
  const mediaIds = collectMediaIds(evidence);
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY?.trim());

  if (!hasUrl && !hasContent && !intent) {
    return { ...expanded, multimodalPipelineRows: ["No URL and no media in this extraction request."] };
  }

  if (!hasUrl && !hasContent && intent) {
    return {
      ...expanded,
      multimodalPipelineRows: [
        "Media ids were referenced but nothing expanded (check upload/storage).",
        ...(expanded.mediaProcessingNotes ?? []),
      ],
    };
  }

  const images = expanded.mediaHints?.imageBase64Parts?.filter((x) => x?.trim()) ?? [];

  const [transcriptResult, frameAnalysis] = await Promise.all([
    providers.transcript.fetchTranscript({
      sourceUrl: expanded.sourceUrl,
      sourcePlatform: expanded.sourcePlatform,
      mediaAssetId: expanded.mediaHints?.mediaAssetId ?? expanded.mediaHints?.mediaAssetIds?.[0],
      audioBase64: expanded.mediaHints?.audioBase64,
      audioMimeType: expanded.mediaHints?.audioMimeType,
    }),
    images.length ? analyzeCookingFramesWithOpenAI(images) : Promise.resolve(null),
  ]);

  const next: RecipeEvidence = { ...expanded };

  if (transcriptResult?.text?.trim()) {
    next.transcriptText = clipTextForMultimodalPipeline(transcriptResult.text.trim(), MAX_TRANSCRIPT_CHARS_MODEL);
    if (transcriptResult.confidence != null) {
      next.transcriptConfidence = transcriptResult.confidence;
    }
  }

  if (frameAnalysis) {
    if (frameAnalysis.overlayText.trim()) {
      next.ocrText = clipTextForMultimodalPipeline(frameAnalysis.overlayText.trim(), MAX_OCR_CHARS_MODEL);
    }
    if (frameAnalysis.ingredientHints.length) {
      next.visualIngredientHints = frameAnalysis.ingredientHints;
    }
    if (frameAnalysis.cookingCues.length) {
      next.visualCookingCues = frameAnalysis.cookingCues;
    }
  }

  const hadAudioForWhisper = Boolean(expanded.mediaHints?.audioBase64?.trim());

  const pipeline: string[] = [];

  if (mediaIds.length > 0) {
    pipeline.push(`Upload: ${mediaIds.length} media asset id(s) attached (${mediaIds.map((id) => id.slice(0, 8)).join(", ")}…).`);
  }

  if (expansionMeta.serverAssetIds.length > 0) {
    pipeline.push(
      `Expansion: loaded ${expansionMeta.serverAssetIds.length} file(s) from storage; ` +
        `video=${expansionMeta.sawVideoAsset ? "yes" : "no"}, image=${expansionMeta.sawImageAsset ? "yes" : "no"}, audio=${expansionMeta.sawAudioAsset ? "yes" : "no"}.`
    );
  } else if (intent && mediaIds.length > 0) {
    pipeline.push("Expansion: no files resolved from storage — ids may be invalid or uploads incomplete.");
  } else if (intent && mediaIds.length === 0 && hadAudioForWhisper) {
    pipeline.push("Expansion: using client-supplied audio only (no server mediaAssetId).");
  }

  if (expansionMeta.ffmpegFramesUsed) {
    pipeline.push("FFmpeg: sampled frames from video for OCR/vision.");
  }
  if (expansionMeta.ffmpegAudioFromVideoUsed) {
    pipeline.push("FFmpeg: extracted audio from video for Whisper.");
  }

  if (hadAudioForWhisper) {
    if (next.transcriptText?.trim()) {
      pipeline.push(`Transcript (Whisper): generated (${next.transcriptText.length} characters).`);
    } else {
      pipeline.push(
        !hasApiKey
          ? "Transcript (Whisper): not generated — OPENAI_API_KEY not set."
          : "Transcript (Whisper): not generated — API returned empty, audio unusable, or request failed (enable REELISH_DEBUG_EXTRACTION for server logs)."
      );
    }
  } else if (intent || expansionMeta.sawVideoAsset || expansionMeta.sawImageAsset || mediaIds.length > 0) {
    if (!hasApiKey) {
      pipeline.push("Transcript (Whisper): skipped — OPENAI_API_KEY not set.");
    } else if (expansionMeta.sawVideoAsset && !expansionMeta.ffmpegAudioFromVideoUsed) {
      pipeline.push(
        "Transcript (Whisper): skipped — no audio buffer (ffmpeg could not extract audio from this video, or video decode failed)."
      );
    } else if (expansionMeta.sawImageAsset && !expansionMeta.sawVideoAsset && !expansionMeta.sawAudioAsset) {
      pipeline.push("Transcript (Whisper): skipped — still images have no speech track.");
    } else if (!expansionMeta.sawVideoAsset && !expansionMeta.sawImageAsset && !expansionMeta.sawAudioAsset) {
      pipeline.push("Transcript (Whisper): skipped — media could not be classified as audio/video/image after expansion.");
    }
  }

  if (images.length > 0) {
    if (!hasApiKey) {
      pipeline.push("OCR / vision: skipped — OPENAI_API_KEY not set.");
    } else if (frameAnalysis) {
      const ocrLen = frameAnalysis.overlayText.trim().length;
      pipeline.push(
        `OCR / vision: ran on ${images.length} frame image(s); overlay text ${ocrLen > 0 ? `(${ocrLen} chars)` : "(empty)"}; ` +
          `ingredient hints=${frameAnalysis.ingredientHints.length}; cooking cues=${frameAnalysis.cookingCues.length}.`
      );
    } else {
      pipeline.push("OCR / vision: frame images present but analysis returned no result (API error or refusal).");
    }
  } else if (intent && expansionMeta.sawVideoAsset && !expansionMeta.ffmpegFramesUsed) {
    pipeline.push("OCR / vision: no frame images — ffmpeg frame sampling failed or produced no files (install ffmpeg, set FFMPEG_PATH).");
  } else if (intent && expansionMeta.sawImageAsset && images.length === 0) {
    pipeline.push("OCR / vision: image file(s) did not produce inline buffers for analysis.");
  }

  if (pipeline.length > 0) {
    next.multimodalPipelineRows = pipeline;
  }

  return next;
}
