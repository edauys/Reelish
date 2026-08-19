# Share ingestion architecture

Reelish is built so **direct share from social apps** is the primary product path, with **manual paste** as an explicit fallback. The same pipeline powers multimodal extraction (caption → transcript → OCR → visual cues → reconstruction).

## Entry points (today)

| Surface | Mechanism | Code |
|--------|-----------|------|
| **Web Share Target (PWA)** | `POST /api/share-target` with `multipart/form-data` (`title`, `text`, `url`, optional `files`) | `app/api/share-target/route.ts`, `public/manifest.json` |
| **Dashboard manual import** | User fills URL + text + optional media upload | `components/recipe-workflow.tsx` |
| **Media upload API** | `POST /api/media/upload` with `file` → `mediaAssetId` (auth + rate limits; see `docs/PRODUCTION_OBSERVABILITY.md`) | `app/api/media/upload/route.ts` |
| **Programmatic / tests** | `extractRecipeAction({ shareIntake: { origin: "programmatic", ... } })` | `app/actions/extract-recipe-action.ts` |
| **iOS Share Extension** | `reelish://handoff?…` → same `SHARE_QUERY` keys + `intake_native=1` | `ios/App/ShareExtension`, `components/native-share-bridge.tsx` |

## Canonical model: `ShareIntakePayload`

Defined in `lib/share/types.ts`. Every path should normalize into this shape **before** `buildRecipeEvidence()`:

- `origin`: `web_share_target` \| `manual_import` \| `native_share_extension` \| `programmatic`
- `receivedAt`: ISO timestamp (server time for share-target redirect; client time acceptable for manual)
- `sessionId`: optional correlation id (`sessionStorage` helper in `lib/share/intake.ts`)
- `sharedUrl`, `sharedText`, `sharedTitle`, `mediaAssetIds`, optional `nativeMediaUploadPartial`
- `inferredPlatform`: from URL heuristics only (no scraping)
- `sourceAppId`, `sourceAppLabel`: originating app when the OS provides them (native share; optional on web)

This attaches to `RecipeEvidence.shareIntake` and surfaces in `RecipePayload.extractionEvidenceDetail` for UI transparency.

See **`docs/NATIVE_AND_MOBILE.md`** for PWA limits, why social share-to-PWA is inconsistent, and the native share-extension mapping. For the Capacitor shell (WebView URL, local testing, deployment), see **`docs/CAPACITOR.md`**.

## Query params after PWA share (stable contract)

Declared in `lib/share-target.ts` (`SHARE_QUERY`). **Native apps should reuse these names** when deep-linking so the dashboard can hydrate without a second mapping layer:

- `share_url`, `share_text`, `share_title`, `share_media` (comma-separated ids), `share_received_at`, `from_share=1`
- Native iOS/Android: `intake_native=1` so the dashboard sets `origin: native_share_extension`
- Long native captions: `share_text`, `share_text_2`, … `share_text_32` (merged client-side into one `sharedText`)
- Optional: `share_source_app`, `share_source_label` (bundle id / package and display name)
- After native upload: `share_native_staged=1`, optional `share_upload_partial=1` (some staged files failed or were skipped)
- Text normalization: `normalizeShareIntakeText` in `lib/share/normalize-share-text.ts` (HTML/RTF fragments, duplicate URL lines, consecutive duplicate paragraphs, total length cap)

## iOS Share Extension (implemented)

1. Extension reads `NSExtensionItem` (text/title/URL/RTF/HTML) **and** stages binary attachments under App Group `group.app.reelish` / `ShareInbox/<session>/` with `manifest.json`.
2. Handoff includes `share_inbox=<session>`; the **host app** uploads files to `/api/media/upload`, then rewrites the URL to `share_media=…` + `share_native_staged=1` before the WebView loads.
3. Dashboard behavior matches PWA: same `mediaAssetIds` → `RecipeEvidence` → multimodal extraction. **No scraping.**

## Future: Android share intent

1. `Intent.ACTION_SEND` / `ACTION_SEND_MULTIPLE` → Activity or deep link handler.
2. Mirror the same query param contract, or `POST /api/share/ingest` with JSON body matching `ShareIntakePayload` for authenticated users.

## Limitations (browser / OS)

- Many social apps **only send URL + text**, not the video file, via Web Share Target.
- iOS Safari PWA share support varies by version.
- File payloads require **Share Target Level 2** (`files` in `manifest.json`) and a cooperating source app.

## Related modules

- `lib/share/intake.ts` — builders and session helper
- `lib/reconstruction/build-evidence.ts` — merges intake into `RecipeEvidence`
- `lib/media/*` — persisted assets referenced by `mediaAssetIds`
