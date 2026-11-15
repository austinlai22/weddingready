# WeddingReady

A free, installable web app that builds a training and nutrition plan backwards from your wedding date (and outfit fitting, if you know it), then tells you exactly what to do each day.

- **Train**: today's session, set bubbles with a rest timer, remembered weights, week strip, phase card.
- **Eat**: daily meal picks scaled to your target, food search over a USDA-sourced database, "Describe it" AI estimates, manual entry, My foods, a protein bar, and the keep-your-dessert rule.
- **Plan**: phase timeline with today, fitting and wedding markers, plus a drag-and-drop week editor and "Ask AI to change it" with a before/after preview.
- **Settings**: edit anything and the plan rebuilds without losing logs; export, import and delete your data.

There are no accounts. Everything personal stays in the browser on the device.

> Portfolio project. General guidance, not medical advice. See [Known limitations](#known-limitations).

## Quick start

```bash
npm install            # .npmrc sets legacy-peer-deps (vitest's optional peers trip npm 10)
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

The app works with no environment variables set:
- **AI:** the AI routes return 503 and the UI falls back to manual entry.
- **Analytics:** a no-op.
- **Rate limits and the spend cap:** an in-memory store.

Node 20.9+ is required. Vitest is pinned to 4.x because Vitest 5 needs Node 22.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm test` | Vitest unit tests: engine, nutrition, guardrails, storage migrations, AI and limits (68 tests) |
| `npm run e2e` | Playwright end-to-end tests at 390px and 1280px (24 tests). Run `npm run build` first; it starts `next start` on port 3100 |
| `npm run lint` / `typecheck` | ESLint and TypeScript |
| `npm run foods:verify` | Rebuilds `data/foods.json` from USDA FoodData Central (see [Food data](#food-data)) |
| `npm run posthog:dashboard` | Creates the SPEC §1 metrics dashboard in PostHog |

## Environment

See `.env.example`.

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | AI meal estimates and schedule edits with Claude. Server only. Used first when its account has API credits. |
| `AI_MODEL` | Optional. Defaults to `claude-sonnet-5-5` (the spec's model). |
| `GEMINI_API_KEY` | Free AI with Google's Gemini API free tier (key from aistudio.google.com/apikey). Answers when there's no Anthropic key or no Anthropic credits. Google may use free-tier requests to improve its products; the privacy page says so. |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.6-flash` (free tier, stable; the newer `gemini-3.8-flash` is often overloaded on the free tier). `gemini-3.5-flash-lite` is the automatic backup when the main model is busy. |
| `AI_DAILY_BUDGET_USD` | Global daily spend cap. Default `2`. When it's hit, AI routes return 503 and the UI falls back to manual entry. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_*`) | Rate limits and spend tracking across serverless instances. Required in production. |
| `RATE_LIMIT_SECRET` | HMAC secret for hashing device IDs and IPs in rate-limit keys |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | Anonymous analytics |

### Deploying to Vercel

1. Import the repo into Vercel (framework: Next.js).
2. Add **Upstash Redis** from the Vercel Marketplace. It sets `KV_REST_API_*`.
3. Set `ANTHROPIC_API_KEY`, `AI_DAILY_BUDGET_USD`, `RATE_LIMIT_SECRET` and the PostHog variables.
4. In PostHog, turn on **Discard client IP data** for the project. The app also strips `$ip` and URL properties client-side.
5. Run `POSTHOG_PERSONAL_API_KEY=… POSTHOG_PROJECT_ID=… npm run posthog:dashboard` once.

## Architecture

```
lib/engine/      Pure, deterministic plan engine (no clock reads; "today" is passed in)
  dates.ts         ISO-date math on UTC midnights (DST-proof), Monday-first weeks
  phases.ts        §6.1 phase table, goal modifiers, fitting-date shift, recovery weeks, taper
  split.ts         §6.3 splits and strength-day placement around your activities
  workouts.ts      Templates → exercises per equipment, §6.2 prescriptions, session-length trimming
  nutrition.ts     Mifflin-St Jeor, activity factor, capped deficit, macro ranges, expectations
  guardrails.ts    §6.7 safety rules (enforced in both the UI and the engine)
  meals.ts         Diet/avoid filtering, 3-tier portions, daily rotation, food search
  schedule.ts      Week template ops (move/add/remove/swap), validation, reconciliation
  plan.ts          Profile → Plan → DayPlan
lib/state/       Zod schema mirroring SPEC §11, versioned migrations, Zustand persist store
lib/server/      AI calls (Claude, structured output + Zod), rate limits, spend cap, store
app/(app)/       Train, Eat, Plan, Settings (client components behind a hydration gate)
app/setup/       12-step onboarding
app/api/         estimate-meal, edit-schedule
public/sw.js     Hand-written service worker (app shell, build assets, viewed media)
data/            exercises.json, foods.json (generated), foods.source.json, meal-templates.json
```

**Persistence.** Zustand `persist` writes to `localStorage` under `weddingready-v1`. Every load and every import is parsed with Zod. If saved data is invalid, the raw copy is backed up under `weddingready-backup-<timestamp>`, the app starts fresh, and it says so.

**AI.** Claude is tried first. If there's no Anthropic key, or the account has no credits or rejects the key, Google's Gemini free tier (`gemini-3.6-flash`, structured JSON output from the same Zod schemas) answers instead, so the app can run at no cost. A used-up Gemini quota turns AI off until it resets, and the app falls back to manual entry. Spend on Gemini counts as $0. Claude calls use `client.beta.messages.parse` with:
- Zod structured output.
- Effort `low`.
- Server-side refusal fallback (`fallbacks: "default"`).

Around each call:
- User text is wrapped in `<user_input>` delimiters with angle brackets neutralised, and the model is told to treat it as data.
- Invalid output gets one retry, then an error.
- Meal estimates whose calories and macros disagree by more than 20% are downgraded to low confidence.
- Schedule ops that name a session not in the week are rejected.
- The app applies ops to a copy and shows a before/after preview; nothing changes until you tap Apply.
- Only anonymous daily counters are stored server-side. Food and schedule text is never logged.

**Offline.** After the first visit, the app shell, build assets (JS, CSS, fonts, and the bundled exercise and food data) and viewed exercise media are cached. Logging works offline. The AI panels show "Needs a connection".

## Decisions and defaults

**Owner decisions:**
- **Goal modifiers apply.** The tone + lose fat fixture is Foundation 8 / Strength 11 / Shape 17 / Maintain 12. The §6.1 sanity check (8 / 13 / 15 / 12) is tested without modifiers.
- **Expectations line.** It shows 40–70% of the straight-line projection, stops projecting at BMI 22 (so never near 18.5), and never shows a goal weight.

**Choices where the spec left a gap:**
- **Recovery weeks** are every 6th week counted from the first week after Foundation, only in Strength/Shape/Build, and only when the plan is 12+ weeks.
- **Foundation on 4–7 week plans** is 1 week when W ≤ 5, otherwise 2.
- **Fitting-date shift minimums** are Shape 2, Strength 2, Build 1, and Foundation per §6.1. If a fitting is too early to fit, Maintain starts as early as the minimums allow and the Plan view says so.
- **Final taper** runs from the wedding minus 9 days through the wedding day.
- **"Start today"** starts the plan in the current Monday-first week; earlier days that week are previews.
- **Lunch and dinner** draw from the same template pool, but dinner continues the rotation, so they differ when the diet allows.
- **Countable foods** (eggs, slices, tortillas) stay whole when portions scale.
- **Exercise media** shows a placeholder card with cues for now (§6.8). Drop licensed or self-recorded loops at `public/media/exercises/<id>.mp4` and set `media` in `data/exercises.json`. Viewed media is cached offline.

## Food data

`data/foods.source.json` lists 163 foods. `npm run foods:verify` builds `data/foods.json` from it:

- **122 whole foods** each carry a USDA FoodData Central ID and a gram weight per unit, mostly from FDC's own portion data. Their values are computed from FDC per-100 g nutrients, from SR Legacy (2018-04) and FNDDS 2021–2023. The script downloads FDC's public bulk CSVs, so no key is needed; set `FDC_API_KEY` to use the API instead. Every entry's `source` names the FDC ID.
- **5 chain items** use the chains' published values with a dated citation: a Chipotle bowl, a McDonald's Quarter Pounder with Cheese, fries and nuggets, and a Starbucks latte.
- **36 restaurant dishes** are kept from the prototype and shown as "Restaurant estimate, varies". They are not verified.
- **Label-dependent items** (protein powder and bars, oat milk) are tagged "check label".

The verification run found 12 prototype values off by more than 10%, and the script replaced them with FDC values. Examples: canned tuna 33 → 24 kcal/oz, bacon 43 → 54 kcal/slice, brown rice 216 → 248 kcal/cup.

## Known limitations

- **An RD/CPT review is required before any paid launch.** It needs to cover the activity factor, the deficit cap, the floors, protein and fat ranges, the expectations framing, the prescriptions and the progression rules. Note: the fixture target (~1,705 kcal) sits below the prototype's hand-set 1,700–1,950. That gap is expected and left for the review, not tuned away.
- Restaurant estimates are unverified. AI estimates can be wrong; users can edit them before saving.
- **The spec names Claude; Gemini is an addition** so the app can run free. Gemini's free limits aren't published (check AI Studio) and Google has cut them before.
- **The AI routes are covered only by mocked tests** until a live key is added. With a mocked SDK, unit tests cover output validation, retry, refusal, unknown ops, rate limits and the spend cap; the e2e tests mock the HTTP routes. Run one live request after adding `ANTHROPIC_API_KEY`.
- The PostHog dashboard script follows PostHog's insights API and HogQL but hasn't been run against a live project.
- There is no exercise video yet (placeholder cards). Media licensing is open item §17.2.
- There are no accounts or sync. Data lives in one browser on one device, so use Export for backups.
- **Privacy and legal need owner confirmation** (§14): health data stays on-device and analytics exclude it, but confirm before a public launch, for example against Washington's My Health My Data Act.
- **Lighthouse (mobile, 13.6):** 100 for performance, accessibility and best practices on Train, Eat, Plan, Settings and Privacy. Setup scores 94 for performance (LCP on the display font). Lighthouse 13 has no PWA category; installability comes from the manifest (192/512 + maskable icons), the service worker and the iOS meta tags.
- **Open owner items (§17):** the domain, the media source, accounts (Anthropic, Upstash, PostHog) and the daily budget value.
