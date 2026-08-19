/**
 * Structured internal logging for operations (no raw captions, tokens, or PII).
 * Enable with `REELISH_TELEMETRY=1` (staging/prod) or `REELISH_SHARE_DEBUG=1` (share intake detail).
 */

function enabled(): boolean {
  return process.env.REELISH_TELEMETRY === "1" || process.env.REELISH_SHARE_DEBUG === "1";
}

export function shortId(id: string | undefined, n = 8): string | undefined {
  if (!id) return undefined;
  const t = id.trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/** Length buckets for text without storing content. */
export function textShape(s: string | undefined): { len: number; lines: number } {
  const t = s?.trim() ?? "";
  const lines = t ? t.split(/\r?\n/).length : 0;
  return { len: t.length, lines };
}

export function logReelishTelemetry(scope: string, fields: Record<string, unknown>): void {
  if (!enabled()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    scope: `reelish:${scope}`,
    ...fields,
  });
  console.info(line);
}
