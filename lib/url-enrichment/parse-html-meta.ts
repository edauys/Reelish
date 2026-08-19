/**
 * Lightweight OG / meta extraction without a full HTML parser (bounded input).
 */

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function firstMatch(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m?.[1]?.trim() ? decodeBasicEntities(m[1].trim()) : undefined;
}

export function extractOpenGraphAndMeta(html: string): { title?: string; description?: string } {
  const title =
    firstMatch(html, /property=["']og:title["']\s+content=["']([^"']+)["']/i) ??
    firstMatch(html, /content=["']([^"']+)["']\s+property=["']og:title["']/i) ??
    firstMatch(html, /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i);

  const description =
    firstMatch(html, /property=["']og:description["']\s+content=["']([^"']+)["']/i) ??
    firstMatch(html, /content=["']([^"']+)["']\s+property=["']og:description["']/i) ??
    firstMatch(html, /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);

  return { title, description };
}

/** Very rough visible text for experimental tier — not semantic HTML parsing. */
export function roughVisibleTextSample(html: string, maxChars: number): string {
  let s = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, maxChars)}…`;
}
