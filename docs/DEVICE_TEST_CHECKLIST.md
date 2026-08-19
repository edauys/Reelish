# Real device checklist (iPhone)

Use this after installing a **Debug** or **Release** build from Xcode on a physical iPhone (same Wi‑Fi as your Mac for local dev).

## A. Styled Next.js app in the WebView

1. On your Mac: `npm run dev -- --hostname 0.0.0.0` (or use your deployed `https://` origin).
2. Set `CAPACITOR_SERVER_URL` to `http://<Mac-LAN-IP>:3000` (or production URL), then:
   ```bash
   npx cap sync ios
   ```
3. Xcode → Run **App** on the device.
4. **Expect:** Dark Reelish UI, serif headings, accent buttons — **not** the brown “Capacitor stub only” page.
5. **If you see the stub:** `server.url` is missing in the synced `capacitor.config.json` — fix env + sync + rebuild.

## B. Desktop / mobile browser (no native shell)

1. Open `http://localhost:3000` (or LAN IP from phone Safari).
2. **Expect:** Same styled marketing page; DevTools → Network → document + CSS `/_next/static/css/...` return **200**.

## C. Reelish in the Instagram share sheet

1. Install the app, then **open Reelish once** (iOS registers extensions after first host launch).
2. Instagram → open any post → **Share**.
3. On the top row of apps, look for **Reelish** (scroll if needed).
4. If missing: tap **Edit Actions…** / **More** (depending on iOS) and enable **Reelish** for sharing.
5. **Expect:** Tapping Reelish opens the host app with `reelish://handoff?…` and lands on the dashboard with share params.

**Note:** Instagram does not expose a video file for every post; you may only get **URL + text**. That is an Instagram limitation, not Reelish.

## D. End-to-end share payload

1. Share a **post with a link** → confirm URL appears in Reelish import.
2. Share **text-only** where Instagram allows → confirm caption/body merges.
3. Share **photo/video** when the system provides files → confirm staged media + `share_media` ids after host upload.

## E. Regression quick check

- After code changes, confirm **`globals.css`** still loads (styled layout).
- If anything looks like **default blue links / Times font**, check Network for failed `/_next/static/**` requests and confirm middleware is not blocking static assets (see `middleware.ts` matcher).
