/**
 * Shared recipe types for extraction, personalization, and Supabase JSON columns.
 * Replace serialized shapes cautiously if you migrate to OpenAI structured output later.
 */

import type { RecipeOutputLanguageCode } from "@/lib/languages";
import type { StructuredIngredientLine } from "@/lib/ingredients/structured-line";
import type { EvidenceProvenanceKind } from "@/lib/url-enrichment/types";
import type { ShareIntakeOrigin } from "@/lib/share/types";

export type RecipeSource = "instagram" | "tiktok" | "facebook" | "manual" | "unknown";

/** How recipe text was supplied before extraction (for transparency in UI / saved JSON). */
export type RecipeIngestionSource =
  | "pasted_text"
  | "shared_text"
  | "shared_title"
  | "shared_text_and_title"
  | "url_only_insufficient"
  /** URL and/or share context with uploaded or inline media (audio/images) supplementing extraction. */
  | "media_supplemented"
  /** Link-only import where public URL retrieval supplied weak/recovered text before extraction. */
  | "url_retrieval_supplemented"
  /** Short dish name or micro-caption only — extraction runs with low confidence + warnings. */
  | "minimal_caption_hint";

/** Curated codes from `lib/languages.ts` — recipe UI output / extraction target language. */
export type PreferredLanguage = RecipeOutputLanguageCode;

export interface RecipePayload {
  title: string;
  ingredients: string[];
  /**
   * Optional structured parse of `ingredients` for personalization and future UI.
   * Older saved rows omit this — loaders treat it as optional.
   */
  ingredientsStructured?: StructuredIngredientLine[];
  steps: string[];
  notes?: string[];
  estimatedServings?: number | null;
  extractionConfidence?: number;
  measurementConfidence?: number;
  sourceLanguage?: string;
  outputLanguage?: PreferredLanguage;
  extractionWarnings?: string[];
  sourceUrl?: string;
  sourceType: RecipeSource;
  sourcePlatform?: RecipeSource;
  creatorHandle?: string | null;
  /** Present after extraction; omitted on older saved rows. */
  ingestionSource?: RecipeIngestionSource;
  /** Multimodal reconstruction layer — which evidence channels were considered. */
  evidenceSummary?: string;
  /** Structured warnings from reconstruction (also merged into extractionWarnings for list UI). */
  reconstructionWarnings?: string[];
  /** Transparency: which share inputs and multimodal channels were used (optional on older rows). */
  extractionEvidenceDetail?: ExtractionEvidenceDetail;
}

/** Snapshot for dashboard/detail UI — derived from `RecipeEvidence` at extract time. */
export interface ExtractionEvidenceDetail {
  sharedLink?: string;
  usedSharedCaption?: boolean;
  /** Short excerpt of shared caption text (when used). */
  captionTextSnippet?: string;
  usedSharedTitle?: boolean;
  usedPastedText?: boolean;
  transcriptPresent?: boolean;
  transcriptPreview?: string;
  onScreenTextPresent?: boolean;
  onScreenTextPreview?: string;
  visualIngredientLabels?: string[];
  visualCookingCueLabels?: string[];
  mediaProcessingNotes?: string[];
  /** Server media ids referenced (not file paths). */
  serverMediaAssetIds?: string[];
  /** Share handoff provenance (when `RecipeEvidence.shareIntake` was set). */
  intakeOrigin?: ShareIntakeOrigin;
  intakeReceivedAt?: string;
  intakeSessionId?: string;
  intakeInferredPlatform?: RecipeSource;
  /** From `ShareIntakePayload.sourceAppId` when the handoff included it (native share). */
  intakeSourceAppId?: string;
  intakeSourceAppLabel?: string;
  /** Heuristic multimodal signal strength (transcript + OCR + vision). */
  multimodalStrengthTier?: "strong" | "moderate" | "weak" | "none";
  multimodalStrengthSummary?: string;
  /** Media was staged by the iOS Share Extension (App Group) and uploaded as `mediaAssetIds`. */
  nativeMediaStagedFromExtension?: boolean;
  /** Some staged files failed to upload; at least one succeeded (native handoff). */
  nativeMediaUploadPartial?: boolean;
  /** How shared/pasted input, media, and optional URL enrichment combined. */
  evidenceProvenance?: EvidenceProvenanceKind;
  /** Human-readable title for `evidenceProvenance` (set at extract time). */
  evidenceProvenanceTitle?: string;
  evidenceProvenanceDetail?: string;
  urlEnrichmentSourceLabel?: string;
  urlEnrichmentContributed?: boolean;
  /** From structured parse — lines with estimated quantities (heuristic). */
  structuredIngredientEstimatedCount?: number;
  /** From structured parse — lines with explicit amounts/units (heuristic). */
  structuredIngredientParsedWithQtyCount?: number;
  /** Characters in the shared caption channel (after normalization). */
  shareCaptionCharCount?: number;
  /** Heuristic: iOS often sends only the short “See this Instagram post…” preview. */
  shareCaptionLikelyTeaserOnly?: boolean;
  /** One-line explanation of caption intake (payload vs limitation). */
  shareCaptionIntakeDetail?: string;
  /** Instagram URL + weak teaser — documents optional future gated fetch (see experimental hook). */
  linkFirstEnrichmentHint?: string;
  /** Host restored full handoff from App Group after a short `reelish://` wake URL. */
  nativeHandoffFromAppGroupRelay?: boolean;
  /** Share extension was built for iOS Simulator (auto-open is often unreliable). */
  nativeHandoffSimulatorBuild?: boolean;
  /** Pending handoff was replayed when the user opened the app manually (extension `open()` failed). */
  nativeHandoffManualResume?: boolean;
  /** Staged native files uploaded but expansion marked them unusable (e.g. generic binary MIME). */
  nativeMediaStagedButUnprocessable?: boolean;
  /** Step-by-step multimodal path: upload → expansion → ffmpeg → Whisper → vision. */
  multimodalPipelineRows?: string[];
  /** Honest one-line: whether the recipe likely came from share caption vs transcript/OCR vs paste (heuristic). */
  reconstructionPrimarySourcesNote?: string;
  /** Personal Team: media was offered by iOS but App Group staging was unavailable (no shared container). */
  nativeNoAppGroupMediaBlocked?: boolean;
  /** Canonical display URL after normalization (Instagram/TikTok retrieval key). */
  sourceRetrievalCanonicalUrl?: string;
  /** True when supplementary text came from disk cache for that canonical URL. */
  sourceRetrievalCacheHit?: boolean;
  /** Aggregated supplemental strength from public retrieval (`none` omitted in UI when absent). */
  sourceRetrievalSupplementStrength?: "weak" | "moderate";
  /** Heuristic: oEmbed-ish or substantive ingredients/steps wording in retrieved block. */
  sourceRetrievalRecoveredCaptionLike?: boolean;
  /** Human-readable rows: provider outcomes (dev/transparency). */
  sourceRetrievalProviderRows?: string[];
  /** Import was link-only before retrieval ran. */
  sourceRetrievalUrlOnlyDetected?: boolean;
  /** Recovered supplement was merged into extraction input. */
  sourceRetrievalSupplementMerged?: boolean;
}

export interface SubstitutionEntry {
  from: string;
  to: string;
  reason: string;
}

export interface PersonalizedRecipe {
  title: string;
  ingredients: string[];
  steps: string[];
  substitutions: SubstitutionEntry[];
  rationale: string;
}

export type DietPreference =
  | "gluten_free"
  | "dairy_free"
  | "vegan"
  | "vegetarian"
  | "low_sodium"
  | "low_fodmap"
  | "nightshade_free"
  | "nut_free"
  | "soy_free"
  | "egg_free"
  | "halal_friendly"
  | "kosher_friendly";

export type NutritionGoal =
  | "high_protein"
  | "keto"
  | "low_carb"
  | "weight_loss"
  | "muscle_gain"
  | "balanced_meals"
  | "anti_inflammatory"
  | "blood_sugar_friendly";

export type DietaryPattern = "omnivore" | "vegetarian" | "vegan" | "pescatarian";

export type Allergy =
  | "peanuts"
  | "tree_nuts"
  | "shellfish"
  | "fish"
  | "milk"
  | "eggs"
  | "soy"
  | "sesame"
  | "wheat";

export interface UserProfile {
  dietaryPattern: DietaryPattern;
  restrictions: DietPreference[];
  allergies: Allergy[];
  dislikedIngredients: string[];
  goals: NutritionGoal[];
  preferredLanguage?: PreferredLanguage;
  onboardingCompleted?: boolean;
}

export interface ConversionContext {
  preferences: DietPreference[];
  goals: NutritionGoal[];
  allergies?: Allergy[];
  dietaryPattern?: DietaryPattern;
  dislikedIngredients?: string[];
}

export interface RecipePreferences {
  preferences: DietPreference[];
  goals: NutritionGoal[];
}
