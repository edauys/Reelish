# `lib/app` — product shell vs domain logic

This folder documents boundaries (no heavy runtime here unless added later).

- **`app/`** (Next.js routes) — HTTP, auth, PWA entry, API routes.
- **`lib/share/`** — Share handoff contracts (`ShareIntakePayload`, native mapping in `native-handoff-contract.ts`). All import paths should converge here before extraction.
- **`lib/extraction/`** — Text resolution, URL-only gates, OpenAI/mock extractors.
- **`lib/reconstruction/`** — Evidence assembly, multimodal merge, confidence calibration, user-facing transparency.

Adding **Capacitor** does not replace these layers: the native shell should deliver the same `ShareIntakePayload` shape the web app already uses.
