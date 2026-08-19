# Production observability & safeguards

Single ingestion pipeline — no alternate extract paths. This doc lists **auth**, **rate limits**, **telemetry**, and **media storage** boundaries.

## Authentication

| Surface | Mechanism |
|--------|------------|
| **Web** (`fetch` to `/api/media/upload`, `extractRecipeAction`) | Supabase session **cookies** (`createClient()` + `getUser()`). Use `credentials: "include"` on `fetch`. |
| **Native iOS upload** (`ShareInboxUploader`) | `Authorization: Bearer <access_token>`. The WebView syncs the Supabase access token to `@capacitor/preferences` (`components/auth-token-sync.tsx`); Swift reads `CapacitorStorage.reelish_supabase_access_token` from `UserDefaults`. |

### Env toggles (`lib/auth/env-flags.ts`)

- **`REELISH_UPLOAD_REQUIRE_AUTH`** — default **on** (any value other than `0` requires sign-in for uploads). Set to `0` only for local tooling.
- **`REELISH_EXTRACT_REQUIRE_AUTH`** — `0` = allow anonymous extraction (rate-limited by IP); `1` = always require sign-in; unset = **require auth in production** (`NODE_ENV === production`), allow anonymous in development.

## Rate limiting (`lib/rate-limit/in-memory.ts`)

In-process counters (per Node instance). Replace with Redis/Upstash for multi-instance deployments.

- **Upload (authenticated):** hourly cap + short burst window (`REELISH_RATE_UPLOAD_PER_HOUR`, `REELISH_RATE_UPLOAD_BURST`, `REELISH_RATE_UPLOAD_BURST_MS`).
- **Upload (anonymous):** when `REELISH_UPLOAD_REQUIRE_AUTH=0`, keyed by IP (`checkAnonUploadRateLimit`).
- **Extract (authenticated):** hourly + burst (`REELISH_RATE_EXTRACT_*`).
- **Extract (anonymous):** when allowed, keyed by IP (`REELISH_RATE_ANON_EXTRACT_PER_HOUR`).

Responses include JSON `{ code: "RATE_LIMITED", retryAfterMs }` and HTTP **429** with `Retry-After` where applicable.

## Telemetry (`lib/telemetry/reelish-log.ts`)

Structured **one-line JSON** logs to `console` when enabled:

- **`REELISH_TELEMETRY=1`** — recommended in staging/production for ops.
- **`REELISH_SHARE_DEBUG=1`** — extra `share.debug_shape` and richer extraction context (still no raw captions).

Events include:

- `reelish:media.upload.ok` — user id prefix, byte size, media kind.
- `reelish:extraction.completed` — ingestion source, multimodal tier, confidence numbers, warning counts, text **lengths** only.
- `reelish:share.debug_shape` — share origin, session id prefix, field lengths (when `REELISH_SHARE_DEBUG=1`).

Never logs full user text, tokens, or email addresses.

## Media storage abstraction (`lib/media/storage/`)

- **`REELISH_MEDIA_STORAGE_BACKEND=local`** (default) — `LocalFilesystemMediaStorage` under `REELISH_MEDIA_DIR`.
- **`REELISH_MEDIA_STORAGE_BACKEND=s3`** — not implemented; throws with a clear message until `s3-storage.ts` is added. Extraction and `mediaAssetIds` flow stay unchanged.

## Device / share debugging

1. Enable **`REELISH_SHARE_DEBUG=1`** on the server and reproduce a share — inspect logs for `share.debug_shape` and `extraction.completed`.
2. Confirm native uploads send a Bearer token (user signed in once in the WebView so `AuthTokenSync` has persisted the token).
3. Use **`REELISH_TELEMETRY=1`** in staging to validate log volume before production.

## Related

- `docs/SHARE_PIPELINE.md` — end-to-end flow.
- `docs/share-architecture.md` — query contract and `ShareIntakePayload`.
