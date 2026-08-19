# iOS Share Extension

**Share sheet + App Group handoff exist only in the native Xcode-built app**, not in a Safari / home-screen PWA. See [IOS_NATIVE_VS_PWA.md](./IOS_NATIVE_VS_PWA.md).

**Personal Team / no paid developer account:** use the **`App-PersonalTeam`** scheme — installs without App Groups; media staging and App Group relay are off until you move to a paid team. See [PERSONAL_TEAM_IOS_FALLBACK.md](./PERSONAL_TEAM_IOS_FALLBACK.md).

Native share flows use the same **query contract** as the PWA (`lib/share-target.ts`) and the same **server pipeline** (`/api/media/upload` → `mediaAssetId` → `extractRecipeAction` / `RecipeEvidence`).

## Text + URL handoff

The Share Extension builds `reelish://handoff?…` with `share_url`, `share_text` (and `share_text_2`… when long), `share_title`, `intake_native=1`, `share_received_at`, etc. The WebView receives the same params as a PWA redirect after `ApplicationDelegate` processing (see below).

## Shared media (images / video / files)

### 1. Staging (App Group)

- **App Group:** `group.app.reelish` (entitlements on **App** and **ShareExtension** targets).
- The extension copies each shared file from `NSItemProvider.loadFileRepresentation` into:

  `Application Group Container/ShareInbox/<sessionUUID>/`

- A **`manifest.json`** lists `{ filename, mimeType }` for each file (up to **8** files per share).
- The handoff URL includes **`share_inbox=<sessionUUID>`** (internal; not part of the long-term web contract).

### 2. Host pickup + upload

- On `reelish://handoff`, **`AppDelegate`** checks for **`share_inbox`**.
- **`ShareInboxUploader`** reads the manifest, uploads each file with **`multipart/form-data`** field **`file`** to:

  **`<server base URL>/api/media/upload`**

  It also sends **`Authorization: Bearer <access_token>`** when the user has signed in: the WebView syncs the Supabase session token via `@capacitor/preferences` (`AuthTokenSync` in `app/layout.tsx`); Swift reads `CapacitorStorage.reelish_supabase_access_token` from `UserDefaults`. Without a token, the server returns **401** (production uploads require auth).

  where **server base URL** is resolved in order:

  1. **`server.url`** in bundled `capacitor.config.json` (from `CAPACITOR_SERVER_URL` + `npx cap sync ios`), or  
  2. **`ReelishUploadBaseURL`** in `App/Info.plist` (optional fallback when no Capacitor server block).

- Optional form field **`sourceUrl`** is set from **`share_url`** when present (same as web upload).
- After upload (success or partial), the **staging directory is deleted** (cleanup even when every file fails).
- **Retries:** Each file upload retries on transient network errors and HTTP **429 / 502 / 503 / 504**.
- **Size:** Files over **80MB** are skipped before upload (same limit as `saveMediaUpload` on the server).
- **Duplicate handoffs:** A **per-session serial queue** plus a **short in-memory cache** of recent `(sessionId → media ids)` reduces duplicate work if `reelish://handoff` is opened twice.
- The app forwards to Capacitor with:

  - **`share_inbox` removed**
  - **`share_media=<id1,id2,…>`** when uploads succeeded
  - **`share_native_staged=1`** when at least one id was returned
  - **`share_upload_partial=1`** when some files failed or were skipped but at least one id succeeded

The WebView never needs to read the App Group directly.

### 3. Web app merge

- **`readShareFromSearchParams`** parses **`share_media`** into **`mediaAssetIds`** (same as PWA).
- **`RecipeWorkflow`** merges those into **`stagedMediaIds`** and runs extraction like manual attach.
- **`share_native_staged`** drives import UI copy (“from iOS Share”) and evidence labeling.

### 4. Transparency

- **Share arrival:** `ShareArrivalStatus` notes when media came from iOS Share.
- **After extract:** `ExtractionEvidencePanel` labels server media as **Media (iOS Share)** when the handoff was native with media ids.

## Local networking / ATS

- **`NSAllowsLocalNetworking`** is enabled in `App/Info.plist` so **`http://<LAN>:3000`**-style `CAPACITOR_SERVER_URL` uploads work during development.

## Testing

| Environment | What to verify |
|-------------|----------------|
| **Simulator** | Build **App**; share an image from **Photos** → Reelish extension; confirm dashboard shows media ids when your Next server is reachable from the sim (localhost or LAN URL in Capacitor config). |
| **Physical iPhone** | Follow **[REAL_DEVICE_NATIVE_TEST.md](./REAL_DEVICE_NATIVE_TEST.md)** — Instagram share payload and uploads differ from Simulator. |
| **Upload URL** | Without `server.url` or `ReelishUploadBaseURL`, uploads are skipped (text/url handoff still works; **`share_inbox`** is stripped). |

## Production checklist

1. **Developer Portal:** App Group `group.app.reelish` attached to the App ID for **Reelish** and the **Share Extension** target.
2. **Signing:** Provisioning profiles include App Groups.
3. **Server URL:** Production builds often load the shipped `capacitor-www`; set **`ReelishUploadBaseURL`** to your deployed origin (e.g. `https://app.reelish.com`) so native uploads hit the same API as the WebView.
4. **Seamless social share:** Many apps only expose a link in the share sheet; **photos/video** depend on the source app. There is no scraping — if the OS does not provide a file, Reelish cannot invent one.

## CocoaPods / UTF-8

If `pod install` fails with encoding errors, run with a UTF-8 locale, e.g. `export LANG=en_US.UTF-8`.
