/**
 * Lightweight in-process rate limiter (single Node instance).
 * For multi-instance production, replace with Redis/Upstash — keep the same helpers.
 */

export type RateLimitResult = { ok: true; remaining: number; resetAtMs: number } | { ok: false; retryAfterMs: number };

type Window = { count: number; startMs: number };

const store = new Map<string, Window>();

function now() {
  return Date.now();
}

function parsePositiveInt(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function getRateLimitConfig() {
  return {
    uploadMaxPerHour: parsePositiveInt(process.env.REELISH_RATE_UPLOAD_PER_HOUR, 60),
    uploadBurstMax: parsePositiveInt(process.env.REELISH_RATE_UPLOAD_BURST, 8),
    uploadBurstWindowMs: parsePositiveInt(process.env.REELISH_RATE_UPLOAD_BURST_MS, 10_000),

    extractMaxPerHour: parsePositiveInt(process.env.REELISH_RATE_EXTRACT_PER_HOUR, 120),
    extractBurstMax: parsePositiveInt(process.env.REELISH_RATE_EXTRACT_BURST, 15),
    extractBurstWindowMs: parsePositiveInt(process.env.REELISH_RATE_EXTRACT_BURST_MS, 60_000),

    anonExtractMaxPerHour: parsePositiveInt(process.env.REELISH_RATE_ANON_EXTRACT_PER_HOUR, 40),
  };
}

function consume(key: string, max: number, windowMs: number): RateLimitResult {
  const t = now();
  let w = store.get(key);
  if (!w) {
    w = { count: 0, startMs: t };
    store.set(key, w);
  }
  if (t - w.startMs > windowMs) {
    w.count = 0;
    w.startMs = t;
  }
  if (w.count >= max) {
    const retryAfterMs = Math.max(500, windowMs - (t - w.startMs));
    return { ok: false, retryAfterMs };
  }
  w.count += 1;
  const remaining = max - w.count;
  const resetAtMs = w.startMs + windowMs;
  return { ok: true, remaining, resetAtMs };
}

/** Hourly + short burst window — both must pass. */
export function checkUploadRateLimit(userId: string): RateLimitResult {
  const c = getRateLimitConfig();
  const hour = consume(`upl:h:${userId}`, c.uploadMaxPerHour, 60 * 60 * 1000);
  if (!hour.ok) return hour;
  const burst = consume(`upl:b:${userId}`, c.uploadBurstMax, c.uploadBurstWindowMs);
  if (!burst.ok) return burst;
  return hour;
}

export function checkExtractRateLimit(userId: string): RateLimitResult {
  const c = getRateLimitConfig();
  const hour = consume(`ext:h:${userId}`, c.extractMaxPerHour, 60 * 60 * 1000);
  if (!hour.ok) return hour;
  const burst = consume(`ext:b:${userId}`, c.extractBurstMax, c.extractBurstWindowMs);
  if (!burst.ok) return burst;
  return hour;
}

export function checkAnonExtractRateLimit(ip: string): RateLimitResult {
  const c = getRateLimitConfig();
  return consume(`ext:anon:${ip}`, c.anonExtractMaxPerHour, 60 * 60 * 1000);
}

const anonUploadMaxPerHour = 30;

export function checkAnonUploadRateLimit(ip: string): RateLimitResult {
  return consume(`upl:anon:${ip}`, anonUploadMaxPerHour, 60 * 60 * 1000);
}
