# Capacitor mobile shell (Reelish + Next.js)

Reelish remains a **Next.js** app (`next dev` / `next build`). Capacitor adds an **iOS/Android WebView** that loads that app over **HTTPS in production** or a **LAN URL in development** — no requirement to `next export` for the first shell.

## How the wrapper hosts Reelish

| Mode | What loads in the WebView | When to use |
|------|---------------------------|-------------|
| **Remote URL** | Your deployed site, e.g. `https://app.example.com` | Production-like builds, staging, full SSR/API routes |
| **Local dev URL** | `http://<your-lan-ip>:3000` with `CAPACITOR_SERVER_URL` | Iterating on the same machine or phone on Wi‑Fi |

Configuration lives in **`capacitor.config.ts`** at the repo root:

- **`webDir: "capacitor-www"`** — Minimal static stub copied into native projects by `npx cap sync`. It is **not** the Next build output; it is only there because Capacitor requires a directory to sync.
- **`server.url`** — Set indirectly via environment variable **`CAPACITOR_SERVER_URL`** when you want the WebView to load your running Next app instead of the stub. Omit it for a build that will ship without a baked-in URL (then you must set `server.url` in CI or use a different release strategy).

**Important:** Capacitor does **not** start Next.js. You still run `npm run dev` or deploy to Vercel/your host; the native app is a shell around that URL.

### Production deployment assumptions

- **HTTPS** for the loaded origin (required for modern APIs; App Transport Security on iOS blocks plain HTTP except in dev).
- **Same auth model as the browser**: Supabase cookies / PKCE flows must work inside the WebView (check cookie `SameSite`, custom URL schemes if you add them later).
- **CORS / API routes**: behave like a normal browser tab pointed at your domain — no extra CORS for “same site” if the WebView origin matches your API.
- **File uploads / media**: same `/api/*` routes as the web app; native share extensions later will POST or deep-link into the same handlers.

### Alternative (not default here): static export

You could point `webDir` at `out/` from `output: "export"` and ship fully offline-capable static assets. That **changes** Next.js capabilities (no SSR as you have it today). Reelish’s first-class path is **hosted Next + WebView URL**.

## Future iOS / Android share extensions → host app

Share extensions **do not** replace this doc’s WebView — they **feed** the same **`ShareIntakePayload`** pipeline:

1. Extension receives URL / text / files from the OS.
2. Large files upload to your existing **`/api/media/upload`** (or future ingest route) → **`mediaAssetIds`**.
3. Host app opens the Capacitor WebView to a URL that already exists on web:

   - **Universal Links / App Links** to  
     `https://<your-domain>/dashboard?from_share=1&share_url=...&share_text=...&share_media=...`  
     (see `lib/share-target.ts` and `lib/share/native-handoff-contract.ts`), **or**
   - Custom scheme / intent that your native layer resolves to the same query shape.

4. **`buildShareIntakePayload` / `nativeHandoffToShareIntake`** on the JS side — unchanged.

Native code should stay thin: **no duplicate recipe extraction** in Swift/Kotlin.

## Project layout after adding native platforms

From the repo root (once Xcode / Android SDK are installed):

```bash
npx cap add ios
npx cap add android
```

That creates **`ios/`** and **`android/`** directories. Teams usually **commit** them so CI can build; alternatively ignore them until the first release (tradeoff: collaborators must regenerate).

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run mobile:sync` | `cap sync` — copy `capacitor-www` + config into native projects |
| `npm run mobile:open:ios` | Open Xcode workspace |
| `npm run mobile:open:android` | Open Android Studio project |
| `npm run mobile:run:ios` | `cap run ios` (device/simulator) |
| `npm run mobile:run:android` | `cap run android` |

## Troubleshooting: “unstyled” / blue links / default fonts

This usually means **CSS or JS chunks did not load** (failed request), or the **middleware** ran on `/_next/static/**` and broke the response. Reelish excludes `_next/static`, `_next/image`, `_next/webpack`, and common static file extensions in `middleware.ts`.

Also verify you are not staring at the **Capacitor stub** (`capacitor-www/index.html`): that page is intentionally minimal. You must set **`CAPACITOR_SERVER_URL`** and sync so the WebView loads the real Next.js origin.

### Blank white WebView (no styled app)

1. **Next.js not running** on the port in `ios/.../capacitor.config.json` (default **`http://127.0.0.1:3000`** after sync from `capacitor.config.ts`).
2. **`localhost` vs `127.0.0.1`**: synced config prefers **`127.0.0.1`** for the **iOS Simulator** (reaches the host Mac). Bare `localhost` in the WebView is easy to misconfigure — run `npm run dev` and open the same URL in Simulator Safari to verify.
3. **Physical device**: `127.0.0.1` is the phone itself — set **`CAPACITOR_SERVER_URL=http://<your-mac-lan-ip>:3000`** and `npm run dev -- --hostname 0.0.0.0`, then `npx cap sync ios`.
4. **Console (native)**: In Safari → Develop → Simulator → Reelish, check failed network requests to `/_next/...`.

### Share extension → host: `extensionContext.open` returns false (Simulator)

The Simulator often rejects **long** `reelish://handoff?…` URLs. Reelish stores the **full handoff** in the **App Group** (`UserDefaults`), opens a **minimal** `reelish://handoff?app_group_handoff=1` wake URL, and the **host `AppDelegate`** restores the full URL before Capacitor. If auto-open still fails, open Reelish from the home screen — **`applicationDidBecomeActive`** replays any pending handoff from the App Group.

If Supabase auth is down, the app should still render: `lib/supabase/middleware.ts` catches `getUser()` failures so the HTML shell is not replaced by a **500** without styles.

## Local testing (development)

1. **Start Next** on all interfaces so a phone can reach your machine:

   ```bash
   npm run dev -- --hostname 0.0.0.0
   ```

2. Find your computer’s **LAN IP** (e.g. `192.168.1.10`).

3. Set **`CAPACITOR_SERVER_URL`** to `http://<LAN-IP>:3000` and run sync + open native IDE:

   ```bash
   export CAPACITOR_SERVER_URL=http://192.168.1.10:3000
   npm run mobile:sync
   npm run mobile:open:ios   # or android
   ```

4. **iOS Simulator**: `http://127.0.0.1:3000` often works with `CAPACITOR_SERVER_URL=http://127.0.0.1:3000`.

5. **Android emulator**: use `http://10.0.2.2:3000` to reach the host loopback (Android-specific).

6. **Cleartext HTTP**: `capacitor.config.ts` sets `cleartext: true` when the URL is `http:` so Android allows it in dev; production should use **HTTPS**.

Until **`npx cap add ios` / `android`** has been run, `mobile:sync` may only be useful after those platforms exist — the config and `capacitor-www` are still valid preparation.

## Shell readiness (auth, flows, WebView behavior)

- **Supabase (email/password)** — Uses `createBrowserClient` from `@supabase/ssr` in the browser; sessions behave like a normal mobile browser tab. No OAuth redirects in the current app, so there is no in-app / external-browser handoff to configure for login.
- **Service worker** — PWA `sw.js` is **not** registered inside the Capacitor WebView (`lib/native.ts` + `RegisterServiceWorker`), so the shell does not cache or intercept navigations like an installed PWA might.
- **API routes** — Dashboard actions, extraction, media upload, and share-target POSTs hit the **same origin** as the loaded Next app (`/api/...`). Keep `CAPACITOR_SERVER_URL` pointed at that origin (dev or deployed).
- **File / camera uploads** — `<input type="file">` works in the WebView. After `npx cap add ios`, you may need **Info.plist** usage strings (e.g. photo library / camera) if the OS prompts; Android may need runtime permission for camera capture (picking files from the gallery is usually fine).

### What to test first (in order)

1. **Load** — WebView opens your URL; no infinite spinner; layout/fonts load.
2. **Auth** — Sign up or log in; confirm redirect to dashboard and session survives a **reload** of the WebView.
3. **Onboarding / profile** — Complete or edit profile; data persists after reload.
4. **Dashboard + extraction** — Paste URL + text, run extract; verify recipe UI.
5. **Save / saved / recipe detail** — Save a recipe, open from **Saved**, favorites/reconvert if you use them.
6. **Media** — Upload a small image or clip; confirm `/api/media/upload` succeeds and extraction can use staged media.
7. **Share-target parity (optional in shell)** — Full PWA share-target POST is browser-specific; in the shell, simulate the same flow via **manual URL + text + media** on the dashboard (the intake model is unchanged).

### Known WebView / auth caveats

| Topic | Notes |
|-------|--------|
| **Dev URL vs production** | Use one consistent origin in the WebView. For LAN dev, use your machine’s IP and `npm run dev -- --hostname 0.0.0.0`. |
| **Supabase dashboard** | If you later add **magic links** or OAuth, add the WebView origin(s) to Supabase Auth redirect allowlist. Email/password only: still ensure **Site URL** matches your deployed app for any email templates. |
| **HTTP cleartext** | Only for local dev (`http://` + `cleartext`). Release builds should load **HTTPS**. |
| **iOS ATS** | Blocks non-TLS dev servers unless you use HTTP cleartext config (Capacitor handles this for `server.url`). |
| **Cookies / ITP** | WKWebView generally persists first-party cookies for your app origin like Safari; if session drops only in shell, compare exact origin (trailing slash / `www` vs apex). |

### Code touchpoints

- `capacitor.config.ts` — `server.url`, cleartext, `webDir`.
- `lib/native.ts` — `isCapacitorNative()` for shell-specific behavior.
- `components/register-sw.tsx` — disables PWA service worker in the native WebView.

## Related

- `docs/REAL_DEVICE_NATIVE_TEST.md` — LAN IP, `mobile:sync`, Xcode, physical iPhone + Instagram share checklist
- `docs/NATIVE_AND_MOBILE.md` — PWA limits vs native, product roadmap
- `docs/share-architecture.md` — `ShareIntakePayload` and query params
- `lib/share/native-handoff-contract.ts` — native share → JSON contract
