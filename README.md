# Reelish

**Reelish** is an AI-ready recipe web app: save recipe videos from social platforms, extract structured recipes, personalize them for dietary needs and nutrition goals, and store them per user.

**Headline:** *Save a viral recipe. Make it fit you.*

This repository is an **MVP**: extraction and personalization are **mocked with realistic logic** so you can ship a polished product narrative while planning real integrations.

## Tech stack

- **Next.js** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS** for a warm, mobile-first UI
- **Supabase Auth** + **Postgres** for accounts and saved recipes
- **PWA**: `manifest.json`, minimal `sw.js`, **Web Share Target** for mobile share → app

## Run locally

```bash
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase URL and anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy **Project URL** and **anon public** key into `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. In the **SQL Editor**, run these migrations in order:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_product_foundation.sql`
4. This adds `user_profiles`, saved recipe metadata (`source_platform`, `creator_handle`, favorites), and convert-later support.
5. Under **Authentication → Providers**, ensure **Email** is enabled. For local dev, you may turn off **Confirm email** in Auth settings so sign-up logs in immediately.

No service role key is required for this MVP (the app uses the anon key with RLS).

## Environment variables

| Variable | Required | Purpose                                                                     |
|----------|----------|-----------------------------------------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes* | Supabase API URL                                                          |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes* | Public anon key (safe in browser with RLS)                                |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Reserved for future admin scripts; **do not** expose to the client         |
| `OPENAI_API_KEY` | No | Placeholder for future extraction/personalization via OpenAI               |

\*If these are missing, **auth-protected routes are skipped** in middleware (so you can preview UI), but **login and database features will not work** until they are set.

## Mocked extraction (`lib/extract-recipe.ts`)

- **Social URLs** (Instagram, TikTok, Facebook): the MVP **does not scrape** those networks. It returns a **realistic template** recipe (rotates between a pasta, dessert, and bowl example based on the URL) and sets `sourceType` from the domain.
- **Raw text**: a small **parser** tries to detect a title, `Ingredients` / `Steps` sections, or falls back to heuristics (quantities, numbered lines).

**Future:** Replace `extractRecipe()` with a call to OpenAI, a dedicated media pipeline, or vendor APIs that comply with platform terms.

## Mocked personalization (`lib/personalize-recipe.ts`, `lib/substitutions.ts`)

- **Rule-based** swaps for tags such as gluten free, dairy free, vegan, vegetarian, keto, low carb, high protein, low sodium, and weight loss.
- **Profile-aware safety layer** applies in strict order: allergies → restrictions/medical needs → dietary pattern → dislikes → goals.
- Outputs: personalized title, ingredients, steps, a **substitutions** list, and a short **rationale**.

**Future:** Swap the rule engine for structured LLM output while keeping the same TypeScript types in `types/recipe.ts`.

## PWA and Web Share Target

- **`public/manifest.json`** declares `share_target` POSTing to **`/api/share-target`** with `title`, `text`, and `url` fields (see [Web Share Target](https://developer.mozilla.org/docs/Web/Manifest/share_target)).
- **`app/api/share-target/route.ts`** reads the form body and **redirects** to `/dashboard` with query parameters so the dashboard can **pre-fill** the link/text inputs.
- **`public/sw.js`** is minimal: it helps satisfy installability on many Chromium browsers but is **not** a full offline cache strategy.

### What works in this MVP

- **Add to Home Screen** + standalone display after deploying over **HTTPS**.
- **Android Chrome**: sharing a URL/text to an **installed** PWA often routes through the share target (behavior varies by OS/version).
- **Code comments** in `lib/share-target.ts` and the API route describe limitations.

### Limitations

- **iOS Safari** historically had **limited or inconsistent** Web Share Target support for PWAs; always test on a real device.
- **Very long** shared text is **truncated** to keep redirect URLs manageable (see API route).
- **First-party scraping** of Instagram/TikTok/Facebook from the server is **not** implemented (ToS, auth walls, rate limits).

### Native apps later

- **iOS Share Extension** and **Android share intents** can receive shares **without** relying on `manifest.json`, then deep link into a native shell or WebView.

## Project structure

```
app/                    # App Router pages (landing, auth, onboarding, profile, dashboard, demo, saved, recipe detail)
  actions/              # Server Actions (save, convert, delete, profile upsert, favorite)
  api/share-target/     # POST handler for Web Share Target
components/             # Reusable UI (header, chips, workflow, service worker registration)
lib/                    # extract-recipe, personalize-recipe, substitutions, Supabase helpers, samples
types/recipe.ts         # Shared recipe/preference types
public/                 # manifest, sw.js, icons
supabase/migrations/    # SQL for base schema + user_profiles/product foundation
```

## New product-foundation UX

- **Onboarding survey**: after sign-up, users complete a quick profile (`/onboarding`) once; editable anytime at `/profile`.
- **Save original or convert now**: from dashboard import flow.
- **Convert later**: from `/saved` cards or `/recipe/[id]`.
- **Delete + confirmation**: from saved cards and recipe detail.
- **Search/filter/sort in library**: query, dietary filter, goal filter, converted/original filter, newest sort.
- **Creator attribution**: each saved recipe keeps `source_url`, `source_platform`, `creator_handle`, plus “View original video”.

## What to build next

1. **Real extraction**: OpenAI vision/text, user-provided captions, or compliant partner APIs — replace `lib/extract-recipe.ts`.
2. **AI personalization**: Keep `PersonalizedRecipe` shape; generate rationale and swaps with structured outputs.
3. **Native share**: Thin Capacitor/React Native wrapper with share extensions for seamless “Share → Reelish.”
4. **Recipe images & OCR**: optional upload flow for screenshots of on-screen ingredients.
5. **Nutrition estimates**: third-party nutrition API per personalized recipe.

## License

MIT (or choose your own — this MVP ships as a starter codebase).
