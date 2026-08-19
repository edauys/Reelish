/**
 * Heuristics for what iOS Safari / Instagram actually put in the share sheet.
 * Not content scraping — only classifies text we already received from the OS.
 */

const IG_TEASER_RE = /see\s+this\s+instagram\s+(post|reel|video)\b/i;

/** Short OS-provided preview line (often all Instagram exposes when sharing a link). */
/** Share sheet titles that are not recipe content (don’t treat as “fuller caption”). */
export function looksLikeDisposableShareSheetTitle(text: string | undefined | null): boolean {
  const t = (text ?? "").trim();
  if (t.length < 2) return true;
  const lower = t.toLowerCase();
  return (
    lower === "instagram" ||
    lower === "reel" ||
    lower === "post" ||
    lower === "posts" ||
    lower === "story" ||
    lower === "video" ||
    lower === "photo"
  );
}

export function looksLikeIosInstagramLinkTeaser(text: string | undefined | null): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (t.length > 420) return false;
  if (IG_TEASER_RE.test(t)) return true;
  const lower = t.toLowerCase();
  if (t.length <= 200 && lower.includes("instagram") && (lower.includes("post by") || lower.includes("watch this"))) {
    return true;
  }
  return false;
}

export function shareCaptionIntakeSummary(caption: string | undefined | null): {
  charCount: number;
  likelyTeaserOnly: boolean;
  detail: string;
} {
  const raw = caption ?? "";
  const charCount = raw.trim().length;
  const likely = looksLikeIosInstagramLinkTeaser(raw);
  let detail: string;
  if (!charCount) {
    detail = "No caption text arrived in the share payload (link-only or empty text).";
  } else if (likely) {
    detail =
      "Text looks like the short Instagram/Safari preview line — the full post caption often is not included when sharing a link from Instagram.";
  } else {
    detail =
      "Caption text from the share sheet was non-empty; if extraction still looks weak, the post may use mostly on-screen recipe text.";
  }
  return { charCount, likelyTeaserOnly: likely, detail };
}
