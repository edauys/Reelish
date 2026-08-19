/**
 * Lightweight source-language guess from Unicode script ranges (no external NLP).
 * Returns ISO 639-1 codes aligned with `lib/languages.ts` where possible; else "und".
 */

const SCRIPT = {
  arabic: /[\u0600-\u06FF]/,
  cyrillic: /[\u0400-\u04FF]/,
  devanagari: /[\u0900-\u097F]/,
  hangul: /[\uAC00-\uD7AF]/,
  hiragana: /[\u3040-\u309F]/,
  katakana: /[\u30A0-\u30FF]/,
  latin: /[A-Za-zÀ-ÿ]/,
} as const;

export function guessSourceLanguageCode(text: string): string {
  const t = text.trim();
  if (!t) return "und";

  const score: Record<string, number> = {};

  const bump = (code: string, n: number) => {
    score[code] = (score[code] ?? 0) + n;
  };

  for (const ch of t) {
    if (SCRIPT.arabic.test(ch)) bump("ar", 2);
    if (SCRIPT.cyrillic.test(ch)) bump("ru", 2);
    if (SCRIPT.devanagari.test(ch)) bump("hi", 2);
    if (SCRIPT.hangul.test(ch)) bump("ko", 3);
    if (SCRIPT.hiragana.test(ch) || SCRIPT.katakana.test(ch)) bump("ja", 3);
    if (/[\u4E00-\u9FFF]/.test(ch)) bump("zh", 2);
    if (SCRIPT.latin.test(ch)) bump("_latin", 1);
  }

  const top = Object.entries(score)
    .filter(([k]) => k !== "_latin")
    .sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) return top[0];

  const ja = score.ja ?? 0;
  const ko = score.ko ?? 0;
  const zh = score.zh ?? 0;
  if (ja && ja >= ko) return "ja";
  if (ko >= 3) return "ko";
  if (zh >= 3) return "zh";

  const lower = t.toLowerCase();
  if (/\b(el|la|los|las|con|para)\b/.test(lower) && SCRIPT.latin.test(t)) return "es";
  if (/\b(le|une|des|avec|pour)\b/.test(lower) && SCRIPT.latin.test(t)) return "fr";
  if (/\b(und|der|die|mit|für)\b/.test(lower) && SCRIPT.latin.test(t)) return "de";
  if (/\b(il|gli|con|per)\b/.test(lower) && SCRIPT.latin.test(t)) return "it";
  if (/\b(o|com|para|uma)\b/.test(lower) && SCRIPT.latin.test(t)) return "pt";
  if (/\b(ve|için|bir)\b/.test(lower) && SCRIPT.latin.test(t)) return "tr";
  if (/\b(и|в|на|с)\b/.test(t) && SCRIPT.cyrillic.test(t)) return "ru";

  if (score._latin && score._latin >= 5) return "en";

  return "und";
}
