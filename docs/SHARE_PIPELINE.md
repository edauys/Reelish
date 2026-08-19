# Native share → upload → evidence → extraction

This document describes the **single unified pipeline** for all import paths (PWA share target, manual dashboard, iOS share extension). There is no parallel extraction path and no scraping of social feeds.

## End-to-end flow (iOS with media)

1. **Share Extension** (`ios/App/ShareExtension`) collects URL, text (plain/UTF‑8/RTF/HTML via `NSAttributedString`), and media via `NSItemProvider`.
2. **Staging:** Files are copied into the App Group container at `ShareInbox/<sessionUUID>/` with a `manifest.json` listing `{ filename, mimeType }`. Files larger than **80MB** are skipped at copy time (`ShareMediaStaging`).
3. **Handoff:** The extension opens `reelish://handoff?…` using the same query keys as `lib/share-target.ts` (`SHARE_QUERY`), plus internal **`share_inbox=<sessionUUID>`** for the host to find staged bytes.
4. **Host upload** (`ios/App/App/AppDelegate.swift` + `ShareInboxUploader.swift`):
   - Resolves base URL from `capacitor.config.json` → `server.url` or `ReelishUploadBaseURL`.
   - Uploads each manifest entry to **`POST /api/media/upload`** with multipart field **`file`** (and optional **`sourceUrl`** from `share_url`).
   - **Retries** transient failures (network, 429/502/503/504). Per-file failures are tracked; successful ids are still returned (**partial upload**).
   - **Serial queue per session** avoids duplicate concurrent uploads if the handoff fires twice; a **short TTL cache** replays recent successful ids if the staging folder was already removed.
   - The staging directory is **always deleted** after processing (success, partial, or empty manifest).
5. **URL rewrite:** `share_inbox` is stripped; **`share_media=id1,id2`** and **`share_native_staged=1`** are added when any upload succeeded; **`share_upload_partial=1`** if some files failed or were over the size limit.
6. **Web app:** `readShareFromSearchParams` merges **`share_text`…`share_text_32`**, runs **`normalizeShareIntakeText`** (HTML/RTF cleanup, URL dedupe, paragraph dedupe, length cap), and hydrates **`stagedMediaIds`** from **`share_media`**.
7. **Extraction:** `extractRecipeAction` → `runExtraction` → `buildRecipeEvidence` → `enrichEvidenceWithMultimodalProviders` (Whisper, OCR, vision as configured) → **`combinedTextForExtractionModel`** → OpenAI or mock extractor → **`enrichRecipePayloadWithStructuredIngredients`** → **`attachExtractionEvidenceDetail`** (transparency for UI).

## App Group paths

- **Identifier:** `group.app.reelish` (entitlements on app + extension).
- **Inbox folder:** `<App Group Container>/ShareInbox/<session>/manifest.json` + staged files.
- The WebView **never** reads the App Group; only the native host uploads then deletes the folder.

## Server limits (`/api/media/upload`)

- **Auth:** Required by default — Supabase session cookies (web) or `Authorization: Bearer` (native). See `docs/PRODUCTION_OBSERVABILITY.md`. Local-only bypass: `REELISH_UPLOAD_REQUIRE_AUTH=0`.
- **Rate limits:** Per-user hourly + burst; anonymous uploads (only when auth bypassed) per-IP. JSON `{ code: "RATE_LIMITED" }`, HTTP **429**.
- **Max size:** 80MB per file (`MAX_MEDIA_UPLOAD_BYTES` via `lib/media/local-store-constants.ts`), enforced before persisting and mirrored on iOS before upload/copy.
- **Type:** Responses use **415** for clearly non-media MIME types (e.g. `text/*`).

## Multimodal caps

- Transcript / OCR / primary text clipping: `lib/reconstruction/limits.ts` (`clipTextForMultimodalPipeline`, `MAX_TRANSCRIPT_CHARS_MODEL`, `MAX_OCR_CHARS_MODEL`, `MAX_PRIMARY_TEXT_IN_MODEL`).
- Video frames: `REELISH_MAX_VIDEO_FRAMES` (clamped **3–10**, hard cap **10**) in `expand-recipe-media-hints.ts` / `ffmpeg-pipeline.ts`.
- OpenAI extraction HTTP: **`REELISH_EXTRACTION_TIMEOUT_MS`** (default **120s**) in `lib/extraction/openai-extractor.ts`.

## Share payload limits (social apps)

- Apps often supply **URL + short caption**; video bytes are only available when the OS provides file providers (native share) or the user attaches media manually.
- Very long captions are split across **`share_text_N`**; the client merges with `\n\n` then normalizes (see `lib/share/normalize-share-text.ts`).

## Production hardening (still recommended)

- **Distributed rate limits:** Replace in-memory limiter with Redis when running multiple Node instances.
- **Object storage:** Set `REELISH_MEDIA_STORAGE_BACKEND` when an S3 adapter exists; until then, local disk only.
- **Malware / content policy:** Add scanning or trusted upload sources per your compliance needs.

## Related docs

- `docs/PRODUCTION_OBSERVABILITY.md` — auth, rate limits, telemetry, storage backends.
- `docs/share-architecture.md` — intake model and query contract.
- `docs/IOS_SHARE_EXTENSION.md` — Xcode targets, ATS, testing.
- `docs/CAPACITOR.md` — WebView server URL for dev devices.
