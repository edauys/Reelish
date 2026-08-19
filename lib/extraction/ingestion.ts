import { normalizeRecipeOutputLanguageCode } from "@/lib/languages";
import { detectSourceFromUrl, inferCreatorHandleFromUrl } from "@/lib/extraction/url-meta";
import {
  hasAnyExtractableText,
  hasMinimalRecipeHint,
  hasUsableExtractionText,
} from "@/lib/extraction/text-hints";
import {
  looksLikeDisposableShareSheetTitle,
  looksLikeIosInstagramLinkTeaser,
} from "@/lib/share/caption-intake-hints";
import type { RecipeMediaHints } from "@/lib/reconstruction/types";
import type { PreferredLanguage, RecipeIngestionSource, RecipePayload } from "@/types/recipe";

export { hasAnyExtractableText, hasMinimalRecipeHint, hasUsableExtractionText } from "@/lib/extraction/text-hints";

const URL_PATTERN = /^https?:\/\//i;

/** Promote a lone URL in the text box to `url` so link-only paste triggers retrieval. */
export function coalesceImportUrlFields(input: { url?: string; text?: string }): {
  url?: string;
  text: string;
  urlOnlyInTextField: boolean;
} {
  const urlField = input.url?.trim() ?? "";
  const box = input.text?.trim() ?? "";
  if (urlField && URL_PATTERN.test(urlField)) {
    return { url: urlField, text: box, urlOnlyInTextField: false };
  }
  const onlyUrl = box.match(/^(https?:\/\/\S+)\s*$/i);
  if (onlyUrl) {
    return { url: onlyUrl[1], text: "", urlOnlyInTextField: true };
  }
  return { url: undefined, text: box, urlOnlyInTextField: false };
}

export type ResolvedExtractionInput = {
  url?: string;
  /** Text sent to extractors (caption / recipe / title). */
  extractionText: string;
  ingestionSource: RecipeIngestionSource;
  /** True when only a social URL is present with no usable text. */
  isUrlOnlyInsufficient: boolean;
  /**
   * True when text is only a short dish name / micro-caption (not a full recipe block).
   * Extraction runs with strong uncertainty warnings and low target confidence.
   */
  minimalTextHintOnly?: boolean;
};

export function hasMediaHints(hints?: RecipeMediaHints): boolean {
  if (!hints) return false;
  if (hints.audioBase64?.trim()) return true;
  if (hints.mediaAssetId?.trim()) return true;
  if ((hints.mediaAssetIds?.length ?? 0) > 0) return true;
  return (hints.imageBase64Parts?.some((x) => Boolean(x?.trim())) ?? false);
}

/**
 * Priority:
 * 1) Full usable text in main field → infer shared vs pasted
 * 2) Minimal recipe hint in main field (dish name / short caption)
 * 3) Full usable shared text / title
 * 4) Minimal hint in shared text / title
 * 5) Social URL without extractable text or media → insufficient (honest)
 * 6) Media only, no text → media_supplemented
 */
export function resolveExtractionInput(input: {
  url?: string;
  text?: string;
  shareTextAtOpen?: string;
  shareTitleAtOpen?: string;
  mediaHints?: RecipeMediaHints;
}): ResolvedExtractionInput {
  const urlRaw = input.url?.trim();
  const url = urlRaw && URL_PATTERN.test(urlRaw) ? urlRaw : undefined;
  const box = input.text?.trim() ?? "";
  const shareText = input.shareTextAtOpen?.trim() ?? "";
  const shareTitle = input.shareTitleAtOpen?.trim() ?? "";

  const hasUrl = Boolean(url);

  /** iOS often puts the preview line in `share_text` and a dish name in `share_title` — never drop the title when it’s richer. */
  if (
    shareText &&
    looksLikeIosInstagramLinkTeaser(shareText) &&
    shareTitle &&
    !looksLikeIosInstagramLinkTeaser(shareTitle) &&
    !looksLikeDisposableShareSheetTitle(shareTitle) &&
    (hasUsableExtractionText(shareTitle) || hasMinimalRecipeHint(shareTitle)) &&
    (!box.trim() || box.trim() === shareText)
  ) {
    const merged = `${shareTitle.trim()}\n\n⸻\n\n${shareText.trim()}`;
    return {
      url,
      extractionText: merged,
      ingestionSource: hasUsableExtractionText(shareTitle) ? "shared_text_and_title" : "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: !hasUsableExtractionText(shareTitle),
    };
  }

  const anyExtractable =
    hasAnyExtractableText(box) || hasAnyExtractableText(shareText) || hasAnyExtractableText(shareTitle);

  const hasMedia = hasMediaHints(input.mediaHints);

  if (hasUrl && !anyExtractable && !hasMedia) {
    return {
      url,
      extractionText: "",
      ingestionSource: "url_only_insufficient",
      isUrlOnlyInsufficient: true,
    };
  }

  if (!anyExtractable && hasMedia) {
    return {
      url,
      extractionText: "",
      ingestionSource: "media_supplemented",
      isUrlOnlyInsufficient: false,
    };
  }

  /** iOS often sends a long “See this Instagram post…” line — not a recipe; multimodal should lead. */
  if (box && looksLikeIosInstagramLinkTeaser(box) && hasAnyExtractableText(box)) {
    return {
      url,
      extractionText: box,
      ingestionSource: "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: true,
    };
  }

  function inferSourceFromBox(): RecipeIngestionSource {
    if (shareText && shareTitle && box.includes(shareText) && box.includes(shareTitle)) {
      return "shared_text_and_title";
    }
    if (shareText && (box === shareText || (box.startsWith(shareText) && box.length <= shareText.length + 400))) {
      return "shared_text";
    }
    if (!shareText && shareTitle && box === shareTitle) return "shared_title";
    if (shareText && box.includes(shareText)) return "shared_text";
    return "pasted_text";
  }

  if (hasUsableExtractionText(box)) {
    return {
      url,
      extractionText: box,
      ingestionSource: inferSourceFromBox(),
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: false,
    };
  }

  if (hasMinimalRecipeHint(box)) {
    return {
      url,
      extractionText: box,
      ingestionSource: "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: true,
    };
  }

  if (shareText && looksLikeIosInstagramLinkTeaser(shareText) && hasAnyExtractableText(shareText)) {
    return {
      url,
      extractionText: shareText,
      ingestionSource: "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: true,
    };
  }

  if (hasUsableExtractionText(shareText)) {
    return {
      url,
      extractionText: shareText,
      ingestionSource: "shared_text",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: false,
    };
  }

  if (hasMinimalRecipeHint(shareText)) {
    return {
      url,
      extractionText: shareText,
      ingestionSource: "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: true,
    };
  }

  if (hasUsableExtractionText(shareTitle)) {
    return {
      url,
      extractionText: shareTitle,
      ingestionSource: "shared_title",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: false,
    };
  }

  if (hasMinimalRecipeHint(shareTitle)) {
    return {
      url,
      extractionText: shareTitle,
      ingestionSource: "minimal_caption_hint",
      isUrlOnlyInsufficient: false,
      minimalTextHintOnly: true,
    };
  }

  if (hasUrl) {
    return {
      url,
      extractionText: "",
      ingestionSource: "url_only_insufficient",
      isUrlOnlyInsufficient: true,
    };
  }

  return {
    extractionText: "",
    ingestionSource: "pasted_text",
    isUrlOnlyInsufficient: false,
  };
}

export function buildInsufficientUrlRecipe(
  url: string,
  preferredLanguage: PreferredLanguage,
  opts?: { retrievalAttempted?: boolean; platformBlocked?: boolean }
): RecipePayload {
  const outLang = normalizeRecipeOutputLanguageCode(preferredLanguage ?? "en");
  const platform = detectSourceFromUrl(url);
  const handle = inferCreatorHandleFromUrl(url);
  const isInstagram = platform === "instagram";
  const isTikTok = platform === "tiktok";
  const attempted = opts?.retrievalAttempted !== false;
  const blocked = opts?.platformBlocked === true;

  const notes = isInstagram
    ? [
        attempted
          ? "Reelish attempted public source retrieval from this Instagram URL (oEmbed/page metadata when enabled) but did not recover enough caption-like text to reconstruct a recipe."
          : "Your Instagram URL is saved, but source retrieval did not run in this environment.",
        blocked
          ? "Instagram often blocks anonymous server requests (401/403). Shared video/images (transcript/OCR) or pasting the caption still work."
          : "Try Share → Reelish with media attached, enable REELISH_EXPERIMENTAL_SOCIAL_RETRIEVAL=1 for stronger public recovery, or paste the caption as a fallback.",
        "Reelish does not log into Instagram or scrape private feeds.",
      ]
    : isTikTok
      ? [
          attempted
            ? "Reelish attempted public TikTok retrieval (oEmbed/HTML) but could not recover enough recipe signal from the link alone."
            : "Your TikTok URL is saved, but source retrieval did not run in this environment.",
          "Share → Reelish with media, enable experimental social retrieval, or paste the caption if needed.",
        ]
      : [
          attempted
            ? "Reelish tried public metadata for this link but could not recover enough text for a recipe."
            : "We saved the post link — add caption text or media for a stronger result.",
        ];

  const extractionWarnings = isInstagram
    ? [
        attempted
          ? "Link only — source retrieval ran but Instagram did not expose usable public caption/metadata for extraction."
          : "Link only — no caption or media in this import.",
        blocked ? "Platform likely blocked public access (common for Instagram oEmbed/HTML)." : undefined,
        "When Share includes media, Reelish prioritizes transcript, on-screen text, and vision over the short preview line.",
      ].filter(Boolean) as string[]
    : [
        attempted
          ? "Link only — public retrieval did not yield enough text to extract a recipe."
          : "Link only — no caption or media was available to parse.",
        "Sharing the caption (or attaching a clip) gives the strongest extraction.",
      ];

  return {
    title: isInstagram
      ? attempted
        ? "Instagram link — source retrieval could not recover a full recipe"
        : "Instagram link saved — caption or media needed for a full recipe"
      : isTikTok
        ? attempted
          ? "TikTok link — source retrieval could not recover a full recipe"
          : "TikTok link saved — add more detail when you can"
        : attempted
          ? "Link saved — public retrieval found no usable recipe text"
          : "Link saved — add more detail when you can",
    ingredients: [],
    steps: [],
    notes,
    sourceUrl: url,
    sourceType: platform,
    sourcePlatform: platform,
    creatorHandle: handle,
    extractionConfidence: 0,
    measurementConfidence: 0,
    extractionWarnings,
    ingestionSource: "url_only_insufficient",
    outputLanguage: outLang,
    sourceLanguage: undefined,
  };
}
