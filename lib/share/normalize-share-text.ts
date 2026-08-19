/**
 * Defensive normalization for share handoff text (PWA + native). Single pipeline — no scraping.
 */

/** Total merged share text cap (defensive; native segments are already chunked). */
export const MAX_SHARE_TEXT_TOTAL_CHARS = 200_000;

const URL_LINE_RE = /^https?:\/\/\S+$/i;

/** Strip common HTML wrappers from PWA / web share payloads (iOS native converts HTML in the extension). */
export function stripHtmlLikeToPlainText(raw: string): string {
  let s = raw.normalize("NFC");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/<\/(?:p|div|h[1-6]|li|tr)\s*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Minimal RTF shell stripping when plain text slips through as RTF (rare on web). */
export function stripRtfShellToPlainText(raw: string): string {
  const t = raw.trim();
  if (!t.startsWith("{\\rtf")) return raw;
  let s = t.replace(/\{\*?\\[^{}]*\}/g, " ");
  s = s.replace(/\\'([0-9a-f]{2})/gi, (_, hex) => {
    const code = Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 ? String.fromCharCode(code) : "";
  });
  s = s.replace(/\\[a-z]+\d* ?/gi, " ");
  s = s.replace(/[{}]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Collapse consecutive duplicate paragraphs (common when multiple providers repeat the same caption). */
export function dedupeConsecutiveParagraphs(raw: string): string {
  const blocks = raw.split(/\n\s*\n/);
  const out: string[] = [];
  let prevNorm = "";
  for (const b of blocks) {
    const t = b.trim();
    if (!t) continue;
    const norm = t.replace(/\s+/g, " ").toLowerCase();
    if (norm === prevNorm) continue;
    out.push(t);
    prevNorm = norm;
  }
  return out.join("\n\n");
}

/**
 * NFC-normalize, trim, collapse excessive newlines, optionally dedupe repeated URL-only lines.
 */
export function normalizeShareIntakeText(raw: string, opts?: { dedupeUrlLines?: boolean }): string {
  let s = raw.normalize("NFC").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (/<[a-z][\s\S]*>/i.test(s) && /<\/?[a-z][^>]*>/i.test(s)) {
    s = stripHtmlLikeToPlainText(s);
  } else if (s.trimStart().startsWith("{\\rtf")) {
    s = stripRtfShellToPlainText(s);
  }

  s = s.replace(/\n{4,}/g, "\n\n\n").trim();
  s = dedupeConsecutiveParagraphs(s);

  if (opts?.dedupeUrlLines !== false && s.length > 0) {
    const lines = s.split("\n");
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (URL_LINE_RE.test(t)) {
        const key = t.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(line);
    }
    s = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  if (s.length > MAX_SHARE_TEXT_TOTAL_CHARS) {
    return `${s.slice(0, MAX_SHARE_TEXT_TOTAL_CHARS)}\n\n… (truncated — share text exceeded safe length)`;
  }
  return s;
}
