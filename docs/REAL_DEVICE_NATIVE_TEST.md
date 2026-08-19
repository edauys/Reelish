# Real iPhone: native Reelish + dev server (one page)

Use this for **Share → Reelish** on a **physical device**. A home-screen PWA cannot replace this — you need the **Xcode-built app** with the Share Extension (see [IOS_NATIVE_VS_PWA.md](./IOS_NATIVE_VS_PWA.md)).

**No paid Apple Developer account yet?** Use Xcode scheme **`App-PersonalTeam`** and read **[PERSONAL_TEAM_IOS_FALLBACK.md](./PERSONAL_TEAM_IOS_FALLBACK.md)** — same install steps below, but App Group–based media staging and long-URL relay are unavailable until you switch back to Debug/Release with App Groups.

## 1. One-time / when your LAN IP changes

1. **Mac LAN IP** — System Settings → Network → Wi‑Fi → your IP (e.g. `192.168.1.42`), or `ipconfig getifaddr en0` in Terminal.
2. From the **repo root**:

   ```bash
   export CAPACITOR_SERVER_URL=http://YOUR_LAN_IP:3000
   npm run mobile:sync
   ```

   This bakes `server.url` into `ios/.../capacitor.config.json` so the WebView and native upload code use **your Mac**, not `127.0.0.1` (the phone cannot reach `127.0.0.1` on your Mac).

3. **Start Next on all interfaces** (phone must reach port 3000):

   ```bash
   npm run dev -- --hostname 0.0.0.0
   ```

4. **Open Xcode** (same shell session is optional):

   ```bash
   npm run mobile:open:ios
   ```

   Open **`ios/App/App.xcworkspace`** (not the bare `.xcodeproj` if CocoaPods is in use).

5. **Signing** — Select the **Reelish** app target → **Signing & Capabilities** → your **Team**; repeat for the **Share Extension** target. **App Groups** `group.app.reelish` must be enabled for **both** in the Apple Developer portal and in Xcode.

6. **Connect the iPhone** (USB or wireless debugging), select it as the **Run** destination, press **Run** ▶.

7. **Trust the developer** on the phone if prompted: *Settings → General → VPN & Device Management* → trust your certificate.

8. **Same Wi‑Fi** — Mac and iPhone on the same LAN; corporate guest networks often block device-to-device traffic.

**Sanity check:** On the iPhone, open **Safari** and visit `http://YOUR_LAN_IP:3000/dashboard`. If the page does not load, fix the network before testing the shell.

---

## 2. Server env for extraction (same machine as `next dev`)

- **`OPENAI_API_KEY`** — required for real extraction (not the mock).
- **`REELISH_EXPERIMENTAL_INSTAGRAM_SOCIAL_FETCH=1`** (optional) — gated public Instagram oEmbed attempt when share text is thin; often blocked by Instagram; see `.env.example`.

---

## 3. Real-device test checklist

| Step | Action | Success |
|------|--------|---------|
| A | Open **native** Reelish (Xcode install), not Safari PWA | App is the Capacitor shell; dashboard loads from your LAN URL |
| B | Instagram → **Share** → scroll to **Reelish** | Reelish appears in the share sheet (if not, you are not running the native build) |
| C | Pick Reelish | App opens to dashboard with query params (link/text may be short) |
| D | Read **Import path** card | Shows **Native share (iOS)**; link row checked if URL arrived |
| E | Teaser vs full caption | **Share preview** warning if text matches “See this Instagram…” — **expected** for many link shares |
| F | Media | **Media attached** with **(from iOS Share)** if App Group upload ran; media ids shown as chips |
| G | **Handoff diagnostics** line (if present) | Confirms App Group relay, partial upload, manual replay, or simulator build |
| H | Run **Extract** | Completes without upload 401 (sign in if prod requires auth) |
| I | **Evidence Reelish used** (after extract) | **Multimodal pipeline** steps if video/image ran; **Audio transcript** / **On-screen text** when present |
| J | **Likely primary source (heuristic)** | Explains whether the recipe probably came from **transcript/OCR** vs **preview line** vs **paste** |
| K | **URL enrichment** | If oEmbed ran, label mentions experimental oEmbed; if blocked, subtext says so |

### Interpreting results

| Outcome | Meaning |
|---------|---------|
| Link + short preview + **no** media ids | **Platform limitation** — Instagram did not attach a file; extraction cannot invent video. Optional: oEmbed may add a weak title if enabled. |
| Preview line + **media** + transcript/OCR in evidence | **Success path** — reconstruction should lean on multimodal rows; heuristic note should say so. |
| **Couldn’t upload shared files** banner | Auth, network, or server not reachable at `CAPACITOR_SERVER_URL`; fix URL/sign-in. |
| **Native staged media** but **unsupported type** | OS gave a generic binary; re-share from Photos or paste caption. |

### Dev-only: WebView console

Set `NEXT_PUBLIC_REELISH_NATIVE_BRIDGE_DEBUG=1` in `.env.local`, rebuild/restart dev server, reinstall or refresh. Safari → **Develop** → *device* → **Reelish** → Console: look for `[reelish:native-bridge]` when the share handoff fires.

---

## 4. Related docs

- [IOS_SHARE_EXTENSION.md](./IOS_SHARE_EXTENSION.md) — handoff query keys, App Group, upload URL order  
- [CAPACITOR.md](./CAPACITOR.md) — `CAPACITOR_SERVER_URL`, troubleshooting blank WebView  
