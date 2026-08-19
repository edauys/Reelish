import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { retrievalEnvCacheEnabled } from "@/lib/retrieval/types";

const CACHE_SUBDIR = "reelish-retrieval-cache";

export interface RetrievalCacheEnvelope {
  version: 1;
  canonicalKey: string;
  savedAtIso: string;
  supplementPlain: string;
  enrichmentMergeJson?: Record<string, unknown> | null;
}

function ttlMs(): number {
  const raw = process.env.REELISH_RETRIEVAL_CACHE_TTL_SEC?.trim();
  const sec = raw ? Number.parseInt(raw, 10) : 86_400;
  if (!Number.isFinite(sec) || sec <= 60) return 86_400_000;
  return sec * 1000;
}

function cacheRoot(): string {
  const explicit = process.env.REELISH_RETRIEVAL_CACHE_DIR?.trim();
  if (explicit) return explicit;
  return path.join(process.cwd(), ".data", CACHE_SUBDIR);
}

function sanitizeKey(canonicalKey: string): string {
  const hash = [...canonicalKey].reduce((acc, ch) => (acc + ch.charCodeAt(0) * 31) >>> 0, 7);
  const safe = canonicalKey.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120);
  return `${safe}_${hash.toString(16)}.json`;
}

export async function readRetrievalCache(canonicalKey: string): Promise<Omit<RetrievalCacheEnvelope, "version"> | null> {
  if (!retrievalEnvCacheEnabled() || !canonicalKey) return null;
  try {
    const fp = path.join(cacheRoot(), sanitizeKey(canonicalKey));
    const raw = await readFile(fp, "utf-8");
    const env = JSON.parse(raw) as RetrievalCacheEnvelope;
    if (env.version !== 1 || env.canonicalKey !== canonicalKey) return null;
    const age = Date.now() - new Date(env.savedAtIso).getTime();
    if (age > ttlMs()) return null;
    return env;
  } catch {
    return null;
  }
}

export async function writeRetrievalCache(entry: Omit<RetrievalCacheEnvelope, "version">): Promise<void> {
  if (!retrievalEnvCacheEnabled() || !entry.canonicalKey) return;
  try {
    const root = cacheRoot();
    await mkdir(root, { recursive: true });
    const env: RetrievalCacheEnvelope = { version: 1, ...entry };
    await writeFile(path.join(root, sanitizeKey(entry.canonicalKey)), JSON.stringify(env, null, 0), "utf-8");
  } catch {
    /* dev disk optional */
  }
}
