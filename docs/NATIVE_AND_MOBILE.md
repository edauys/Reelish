# Native mobile path and PWA limits

This document is the internal roadmap for **true share-to-app** behavior (iOS/Android) while the product remains a **Next.js web app** + **PWA** with optional future **Capacitor** (or similar) wrapping.

## App boundaries (where code lives)

| Layer | Role | Key paths |
|-------|------|-----------|
| **Web UI** | Dashboard, recipe flow, share redirect handling | `app/`, `components/` |
| **Share intake** | Normalize every entry point into `ShareIntakePayload` | `lib/share/types.ts`, `lib/share/intake.ts`, `lib/share/native-handoff-contract.ts` |
| **Extraction** | Resolve paste vs share vs URL-only; text hints | `lib/extraction/` |
| **Reconstruction** | Evidence bag, multimodal merge, confidence, transparency | `lib/reconstruction/` |
| **Media** | Uploaded assets, server ids (no social scraping) | `lib/media/`, `app/api/media/` |

The **canonical handoff** for any surface is: build `ShareIntakePayload` → `buildRecipeEvidence` → `runExtraction`. Native code should not fork recipe logic.

## PWA / Web Share Target limitations

- **Browser variance**: Share Target Level 2 (`files` in `manifest.json`) depends on the browser and OS; iOS Safari PWA behavior has been uneven across versions.
- **Source apps control payloads**: Instagram, TikTok, Facebook, etc. decide what they put in the share sheet. Often you get **URL + short text**, not the video file, via Web Share Target.
- **Reelish does not scrape** social URLs for page content; extraction uses **user-provided text/media** plus optional multimodal signals from **uploaded** clips.

## Why Instagram / TikTok / Facebook sharing feels inconsistent

- The **host app** may not register as a share target recipient the user expects, or may send **minimal** text.
- **Web Share Target** requires the PWA to be installed and the browser to route POST correctly; failures are often silent to the user (opens browser tab without share data).
- **OS policies** and in-app share UIs change frequently.

## What a native app + share extension solves

- **Reliable OS integration**: Share extensions and Android intents receive `NSURL` / `Intent` payloads without depending on Chromium share-target POST.
- **Richer handoff**: Optional access to **binary streams** (images/video) the user chose to share, uploaded to the same **`mediaAssetIds`** pipeline as today.
- **Provenance**: Bundle id / package name → `ShareIntakePayload.sourceAppId` and optional display name → `sourceAppLabel` (see `lib/share/native-handoff-contract.ts`).

## Share extension → Reelish mapping

Use **`nativeHandoffToShareIntake()`** or mirror **`buildShareIntakePayload()`** with `origin: "native_share_extension"`:

- **Shared URL** → `sharedUrl`
- **Shared text** → `sharedText`
- **Title / subject** → `sharedTitle`
- **Uploaded media** → `mediaAssetIds` (same as PWA file flow)
- **Source app** → `sourceAppId`, `sourceAppLabel`
- **When Reelish accepted the payload** → `receivedAt` (ISO 8601)
- **Session / correlation** → `sessionId` (optional; can match tab id or app group token)

Deep links can reuse query keys in `lib/share-target.ts` (`share_url`, `share_text`, …, `share_source_app`, `share_source_label`).

## Minimal caption / dish-name path

When only a **short caption** or **dish name** is present (with or without a link), ingestion uses `minimal_caption_hint`. Extraction stays **honest**: low confidence, reconstruction warnings, and (with OpenAI) explicit “minimal caption mode” instructions. Mock/offline mode returns a **skeleton** recipe with clear warnings.

## Next implementation steps (engineering)

1. **Capacitor** is wired in-repo (`capacitor.config.ts`, `capacitor-www/`, npm `mobile:*` scripts). See **`docs/CAPACITOR.md`** for hosting the Next app in the WebView, LAN dev, and deployment assumptions.
2. Run **`npx cap add ios`** / **`npx cap add android`** when Xcode / Android SDK are ready; then `npm run mobile:sync` and open the native IDEs.
3. **iOS**: Share Extension target → upload media → open Universal Link / custom scheme with query params or POST `ShareIntakePayload` JSON to an authenticated route.
4. **Android**: `ACTION_SEND` handler → same JSON or App Links into the WebView with query params.
5. Keep **one** recipe pipeline: no duplicate extraction services in native code.

## Related docs

- **`docs/CAPACITOR.md`** — Capacitor shell, local testing, production URL assumptions.
- `docs/share-architecture.md` — PWA share-target flow and `ShareIntakePayload` fields.
