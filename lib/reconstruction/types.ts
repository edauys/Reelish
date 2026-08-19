/**
 * Multimodal recipe reconstruction — internal evidence and layer types.
 * Consumer-facing shape remains `RecipePayload` (with optional reconstruction fields).
 */

import type { SourceRetrievalSnapshot } from "@/lib/retrieval/types";
import type { EvidenceProvenanceKind, UrlEnrichmentAttachment } from "@/lib/url-enrichment/types";
import type { ShareIntakePayload } from "@/lib/share/types";
import type { PreferredLanguage, RecipeIngestionSource, RecipeSource } from "@/types/recipe";

/** Which evidence channels contributed to a reconstruction. */
export type EvidenceModality =
  | "url"
  | "caption"
  | "pasted"
  | "title"
  | "transcript"
  | "ocr"
  | "visual_ingredients"
  | "visual_actions";

/** Single visual hint from future vision models (stub-ready). */
export interface VisualIngredientHint {
  label: string;
  confidence?: number;
}

/** High-level cooking cue from video (stub-ready). */
export interface VisualCookingCue {
  label: string;
  confidence?: number;
}

/**
 * Normalized evidence bag for reconstruction. All multimodal fields are optional;
 * production will fill transcript/OCR/visual as providers are implemented.
 */
/** Optional media attached to extraction (share extensions, uploads, future platform payloads). */
export interface RecipeMediaHints {
  /** Raw base64 audio bytes or a `data:audio/...;base64,...` data URL. */
  audioBase64?: string;
  audioMimeType?: string;
  /** One or more images: raw base64 or `data:image/...;base64,...`. */
  imageBase64Parts?: string[];
  /** @deprecated Use `mediaAssetIds` — single id kept for backward compatibility. */
  mediaAssetId?: string;
  /** Server-stored upload/share-handoff asset ids (preferred over huge inline base64). */
  mediaAssetIds?: string[];
}

export interface RecipeEvidence {
  sourceUrl?: string;
  sourcePlatform?: RecipeSource;
  creatorHandle?: string | null;

  /** Text block chosen as the primary extraction input (after share/paste priority). */
  primaryText: string;

  /** Optional channel splits (for provenance and sectioned prompts). */
  captionText?: string;
  pastedRecipeText?: string;
  sharedTitle?: string;

  transcriptText?: string;
  /** When ASR returns a confidence score (Whisper does not — may be undefined). */
  transcriptConfidence?: number;
  ocrText?: string;
  visualIngredientHints?: VisualIngredientHint[];
  visualCookingCues?: VisualCookingCue[];

  /** Inline/uploaded media for Whisper + vision (not fetched from social URLs). */
  mediaHints?: RecipeMediaHints;
  /** Notes from local media expansion (e.g. ffmpeg missing). */
  mediaProcessingNotes?: string[];
  /** Human-readable multimodal pipeline status for evidence UI (upload → expansion → Whisper → vision). */
  multimodalPipelineRows?: string[];

  /**
   * Structured share handoff (PWA share target, manual import, future native).
   * Optional for older code paths; when set, feeds transparency UI and future analytics.
   */
  shareIntake?: ShareIntakePayload;
  /** True when `minimal_caption_hint` — primary text is a dish name / fragment, not a full recipe. */
  minimalTextHintOnly?: boolean;

  /** Optional weak page metadata / experimental text fetched server-side for public URLs. */
  urlEnrichment?: UrlEnrichmentAttachment;
  /** How share/paste, media, and URL enrichment combined for this run (transparency). */
  evidenceProvenance?: EvidenceProvenanceKind;

  /** Source retrieval orchestrator — cache, providers attempted, supplementary recovery (additive). */
  sourceRetrieval?: SourceRetrievalSnapshot;

  preferredLanguage: PreferredLanguage;
  sourceLanguageGuess?: string;
  ingestionSource?: RecipeIngestionSource;
}

/**
 * Internal reconstruction output before mapping onto `RecipePayload`.
 * Mirrors recipe fields plus transparency fields required by product.
 */
export interface ReconstructionLayerResult {
  title: string;
  ingredients: string[];
  steps: string[];
  notes?: string[];
  estimatedServings?: number | null;
  extractionConfidence?: number;
  measurementConfidence?: number;
  reconstructionWarnings: string[];
  evidenceSummary: string;
}
