/**
 * Bounded HTTP HTML read for social / URL enrichment.
 * Never fails solely because the full response exceeds the cap — keeps the first N bytes for parsing.
 */

const DEFAULT_SOCIAL_MAX_BYTES = 2_097_152; // 2 MiB — Instagram/TikTok HTML often > 512 KiB
const DEFAULT_GENERIC_MAX_BYTES = 512_000;
const ABSOLUTE_CAP_BYTES = 8_388_608; // 8 MiB hard ceiling
const DEFAULT_TIMEOUT_MS = 8_000;

export type BoundedHtmlFetchOk = {
  ok: true;
  html: string;
  bytesRead: number;
  truncated: boolean;
  contentLength?: number;
};

export type BoundedHtmlFetchResult =
  | BoundedHtmlFetchOk
  | { ok: false; reason: string; bytesRead?: number; html?: string; truncated?: boolean };

export function socialRetrievalMaxBytes(): number {
  const raw = process.env.REELISH_SOCIAL_RETRIEVAL_MAX_BYTES?.trim();
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_SOCIAL_MAX_BYTES;
  if (!Number.isFinite(n) || n < 65_536) return DEFAULT_SOCIAL_MAX_BYTES;
  return Math.min(n, ABSOLUTE_CAP_BYTES);
}

export function genericUrlEnrichmentMaxBytes(): number {
  return DEFAULT_GENERIC_MAX_BYTES;
}

export async function fetchBoundedHtml(
  url: string,
  opts?: { maxBytes?: number; timeoutMs?: number; userAgent?: string }
): Promise<BoundedHtmlFetchResult> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_GENERIC_MAX_BYTES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "User-Agent": opts?.userAgent ?? "ReelishBoundedHtml/1.0 (+https://reelish.app)",
      },
      signal: ac.signal,
    });

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    const contentLength = (() => {
      const h = res.headers.get("content-length");
      if (!h) return undefined;
      const n = Number.parseInt(h, 10);
      return Number.isFinite(n) ? n : undefined;
    })();

    const body = res.body;
    if (!body) {
      const buf = await res.arrayBuffer();
      return sliceBufferToHtml(buf, maxBytes, contentLength);
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    let truncated = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      if (bytesRead + value.length > maxBytes) {
        const take = maxBytes - bytesRead;
        if (take > 0) chunks.push(value.slice(0, take));
        bytesRead = maxBytes;
        truncated = true;
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        break;
      }

      chunks.push(value);
      bytesRead += value.length;
    }

    if (contentLength != null && contentLength > maxBytes) {
      truncated = true;
    }

    const merged = new Uint8Array(bytesRead);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }

    const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { ok: true, html, bytesRead, truncated, contentLength };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: msg };
  } finally {
    clearTimeout(timer);
  }
}

function sliceBufferToHtml(
  buf: ArrayBuffer,
  maxBytes: number,
  contentLength?: number
): BoundedHtmlFetchResult {
  const truncated = buf.byteLength > maxBytes || (contentLength != null && contentLength > maxBytes);
  const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
  const bytesRead = slice.byteLength;
  const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  return { ok: true, html, bytesRead, truncated, contentLength };
}
