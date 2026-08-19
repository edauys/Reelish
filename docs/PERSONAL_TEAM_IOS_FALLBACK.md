# Personal Team (temporary) — install Reelish on a real iPhone without a paid Apple Developer account

Apple’s **App Groups** capability (used for ShareInbox staging + relay between the Share Extension and host app) normally requires registering the group in the Developer portal, which **paid** membership unlocks end-to-end. On a **Personal Team** (free Apple ID), provisioning often **cannot** include App Groups, so Xcode fails to install builds that declare `com.apple.security.application-groups`.

This repo adds a **reversible** Xcode configuration so you can still **install and run** the main app + share extension on device for WebView, auth, extraction, and **URL/text** share handoff — without deleting any App Group code.

## What was added

| Piece | Purpose |
|-------|---------|
| **`PersonalTeam` build configuration** | App + Share Extension targets use **empty entitlements** (no App Groups). |
| **`App-PersonalTeam.entitlements`** / **`ShareExtension-PersonalTeam.entitlements`** | Minimal plist (`<dict/>`). Full builds keep using **`App.entitlements`** / **`ShareExtension.entitlements`** with `group.app.reelish`. |
| **Swift flag `REELISH_PERSONAL_TEAM_FALLBACK`** | Set only for `PersonalTeam`. Logs in the host app; share extension skips the App Group **wake relay** when `open()` fails (avoids opening a useless `app_group_handoff=1` URL with nothing stored). |
| **Scheme `App-PersonalTeam`** | Builds/runs with the `PersonalTeam` configuration. |

**Nothing was removed:** Debug / Release still use full App Group entitlements. Simulator workflows that used Debug are unchanged if you keep selecting the **App** scheme with **Debug**.

## What works in Personal Team mode

- Installing **App.app** + embedded **ShareExtension.appex** on your iPhone with **Personal Team** automatic signing (after you pick your team in Xcode).
- Capacitor WebView loading your dev or production server (`CAPACITOR_SERVER_URL`, etc.).
- Sign-in, dashboard, manual paste, link field, file upload from the main app — same as web.
- Share extension **when Instagram provides a short enough** `reelish://handoff?…` URL: **link + text** arrive on the dashboard.
- **No ShareInbox session** — `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)` is nil, so **no staged media upload** from the extension (`share_inbox` is never added).

## What does not work until you restore App Groups (paid team + portal)

- **Shared container** between extension and app — no multi-file **ShareInbox** staging / `share_media` ids from native share.
- **UserDefaults(suiteName: group.app.reelish)** — nil in both processes; **App Group relay** for very long handoff URLs cannot persist the full query.
  - If `extensionContext.open(fullHandoff)` fails on device, the Personal Team build **does not** fall back to the wake URL (it would open the app without restoring text). The extension prompts you to open Reelish from the Home Screen.
- **Dashboard flag `share_no_app_group=1`:** when iOS attached image/video types but the extension could not stage them (no container), the import screen explains that transcript/OCR require staged media or an App Groups build.
- **Simulator-specific** paths that relied on App Group replay still work in **Debug** on Simulator — use the normal **Debug** scheme there.

## Install the fallback build on your iPhone

1. `cd ios/App` and open **`App.xcworkspace`**.
2. **Product → Scheme → `App-PersonalTeam`**.
3. Select your **physical iPhone** as the run destination.
4. **Signing & Capabilities** for targets **App** and **ShareExtension**:
   - Check **Automatically manage signing**
   - **Team**: your **Personal Team**
   - If Xcode reports a bundle ID conflict, temporarily change **both** `app.reelish` and `app.reelish.ShareExtension` to something unique (e.g. `com.yourname.reelish` / `com.yourname.reelish.ShareExtension`) — revert when moving to a paid team.
5. **Run** ▶. Trust the developer on the device if prompted.
6. Point the app at your Next server as in [REAL_DEVICE_NATIVE_TEST.md](./REAL_DEVICE_NATIVE_TEST.md) (`CAPACITOR_SERVER_URL`, `npm run dev -- --hostname 0.0.0.0`, `npm run mobile:sync` from repo root).

**Console (host):** On cold launch you should see a log line that `REELISH_PERSONAL_TEAM_FALLBACK` is active (App Groups not used).

## Restore the full share pipeline later

1. Enroll in the **Apple Developer Program** and register **App Groups** for your App IDs (`group.app.reelish` must match [ReelishAppGroup.swift](../ios/App/App/ReelishAppGroup.swift) and entitlements).
2. In Xcode, use the **default App scheme** with **Debug** or **Release** (not `App-PersonalTeam`).
3. Confirm **Signing & Capabilities** shows **App Groups** with `group.app.reelish` on **both** App and Share Extension (must match [`ReelishAppGroup.swift`](../ios/App/App/ReelishAppGroup.swift)).
4. Re-install on device. Share → Reelish should again support **ShareInbox**, media upload, and App Group relay for long URLs.

## Related

- [IOS_SHARE_EXTENSION.md](./IOS_SHARE_EXTENSION.md) — full architecture when App Groups are enabled  
- [REAL_DEVICE_NATIVE_TEST.md](./REAL_DEVICE_NATIVE_TEST.md) — LAN server + device checklist  
