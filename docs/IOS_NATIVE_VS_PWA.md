# Native iOS app vs PWA / “installed” web on iPhone

Reelish ships as a **Next.js web app** and an optional **Capacitor native shell** (iOS/Android). The **same** extraction and dashboard code runs in Safari, in a home-screen PWA, and inside the native WebView — but **only the native Xcode build** includes the pieces that make **Share → Reelish** work as a first-class path.

## What the PWA / Safari-installed app is

- **Safari** or **Add to Home Screen** gives you a **web app** with no access to iOS **Share Extensions** or **App Groups**.
- Users can open links, paste text, and use **file upload** inside the page, but **iOS will not list Reelish in the system share sheet** for that install. That is an OS limitation, not a Reelish bug.

## What the native (Xcode) build adds

| Capability | PWA / browser | Native Capacitor app |
|------------|---------------|----------------------|
| Appears in **Share sheet** | No | Yes (Share Extension target) |
| **App Group** staging for large videos / multi-file share | No | Yes (`group.app.reelish`) |
| **`reelish://handoff`** deep link with `share_inbox`, `share_media`, … | No | Yes (`AppDelegate` + extension) |
| Same `/api/*` + dashboard UI | Yes | Yes (WebView loads your server URL or bundled web assets) |

**True “share an Instagram post into Reelish” requires the native app** built from `ios/` with the Share Extension and entitlements. A localhost- or HTTPS-installed PWA alone cannot replace that.

See [IOS_SHARE_EXTENSION.md](./IOS_SHARE_EXTENSION.md) for the handoff contract and upload pipeline.

## Install on a real iPhone (commands + checklist)

Use **[REAL_DEVICE_NATIVE_TEST.md](./REAL_DEVICE_NATIVE_TEST.md)** — single place for `CAPACITOR_SERVER_URL`, `npm run dev -- --hostname 0.0.0.0`, `mobile:sync`, workspace path, signing, trust, and what to verify when sharing from Instagram.

## Honest expectations

- Instagram often supplies only a **short preview line** plus the **URL**; the **full caption may not be in the share payload** (see combine-text / caption-intake hints). Recovery then depends on **shared media** (transcript, OCR, vision), optional **gated oEmbed** (`REELISH_EXPERIMENTAL_INSTAGRAM_SOCIAL_FETCH=1`), or **manual paste** as fallback — not on the PWA vs native distinction alone.
