# Zahavan'ia

**Journalistic investigation assistant for Madagascar.**

Zahavan'Ia helps journalists transition from receiving raw information to producing verified content. It enables them to check text or links, analyze images or videos, find sourced statistics, identify consenting experts, and identify unique angles for news coverage. The interface is available in Malagasy, French, and English. This is a hackathon project built with Next.js 16.

## Features

- **Verify text or links**: Claims are isolated and cross-checked against web searches. Every conclusion links back to clickable sources.
- **Analyze an image or a video**: Extracts EXIF metadata, visual clues, and anomalies, and provides reverse image search links. Videos are reduced to 6 keyframes extracted directly within the browser.
- **Translate**: Translates between Malagasy, French, and English, with automatic output quality checks and a "needs review" flag triggered for Malagasy.
- **Find an expert**: Search a directory of consenting profiles, filtered by field of expertise, region, and language.
- **Consult statistics**: Access World Bank statistics on Madagascar, complete with the relevant year, source, and last update date.
- **Suggest reporting angles**: Generates news coverage angles based exclusively on confirmed claims.
- **Save a case**: Saves folders locally in the journalist's browser. The monitoring feature (`/app/monitor`) is planned but currently disabled.

## Principles

- **No "true / false" verdicts**: Statuses are strictly limited to `confirmed`, `contradicted`, `insufficient`, or `needs_verification`.
- **Confidence score**: A score (0–100) is computed programmatically with an explainable breakdown. It measures the quality of the evidence found, not the ultimate truth of the fact.
- **Insufficient status**: Any claim without a usable, verifiable source is classified as `insufficient`.
- **No AI hallucinations**: The AI does not invent sources, quotes, or experts. URLs not returned by the web search are discarded, and experts are drawn exclusively from the directory.
- **No absolute authenticity**: An image with no detected anomalies is not certified as "authentic"; the analysis remains an indicator.
- **The journalist decides**: Every report can be validated, completed, or rejected by the user.

## Stack

Next.js 16 (App Router), React 19, strict TypeScript, Tailwind CSS v4, `next-intl`, Supabase (anonymous auth, expert directory, shared rate-limiters), `openai` SDK pointing to OpenRouter, `zod`, `sharp` / `exifr`, `three`, `gsap`, `motion`. Tested with Vitest and `node --test`.

## Getting Started

Prerequisites: Node.js 24 and npm.

```bash
cp .env.example .env.local # at a minimum, fill in the OpenRouter and Supabase keys
npm install
npm run dev
```

The application will be available at <http://localhost:3000>.

### Local Database (Optional)

```bash
npx supabase start
npx supabase db reset # applies migrations and the demonstration seed data
```

The 16 profiles included in the seed data are **fictional** and explicitly marked as such.

### Without an AI Key

Setting `USE_MOCK=true` returns deterministic responses marked with `mock: true` for development purposes only. This mode is ignored in production.

## Configuration

All variables are documented in `.env.example`. The primary ones are:

| Variable | Role |
| --- | --- |
| `LLM_BASE_URL`, `LLM_API_KEY`, `AI_MODEL` | OpenRouter endpoint, API key, and default model |
| `AI_MODEL_VERIFY`, `_TRANSLATE`, `_VISION`, `_EXPERTS`, `_ANGLES` | Per-task models (optional, falls back to `AI_MODEL`) |
| `AI_FALLBACK_MODELS` | Comma-separated fallback models, tried in order when a model fails (see `README_AI.md`) |
| `AI_FALLBACK_MODEL` | Single fallback model, added at the end of the list |
| `AI_DAILY_LIMIT_PER_USER` | Daily quota per user and per route |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project credentials (public key by design) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: local seeding, shared rate-limiters |
| `RATE_LIMIT_STORE=supabase` | Share rate limits between instances instead of using memory |
| `DEMO_MODE` | Bypasses authentication in development mode only |
| `USE_MOCK` | Serves mock demonstration data in development mode only |

No key should be prefixed with `NEXT_PUBLIC_` except for the Supabase anonymous key.

## Scripts

| Command | Effect |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and production server |
| `npm run lint` | ESLint |
| `npm test` | Runs Vitest tests followed by `node --test` |
| `npm run stats:update` | Refreshes `data/stats.json` from the World Bank API |
| `npm run check:real` | Verifies AI routes on a live server (bypassing mocks) |

## Architecture

```text
app/
  page.tsx             # landing page
  app/                 # application core screens
  api/                 # backend routes (verify, sources, editorial, translate)
components/landing/     # 3D scenes and animations
components/workspace/   # main workspace interfaces
lib/ai/                # unified AI client, prompts, schemas, and models
lib/security/          # auth, rate-limiting, and safe-fetch utilities
lib/score.ts           # confidence score calculation logic
i18n/, messages/       # mg / fr / en translation files
data/                  # statistics, agenda, photo credits
supabase/              # database migrations and seed data
tests/, docs/          # test suites and documentation
```

## API

All routes use the `POST` method, require an active Supabase session (anonymous sessions are accepted), and enforce rate limits, daily quotas, and Zod validation. Errors return generic messages. The complete contract is detailed in [`docs/api.md`](docs/api.md).

| Route | Role |
| --- | --- |
| `/api/verify/text` | Verify a block of text or a URL |
| `/api/verify/image` | Analyze an image and its metadata |
| `/api/verify/video` | Analyze keyframes extracted from a video |
| `/api/sources/suggest` | Suggest expert profiles from the directory |
| `/api/editorial/angles` | Propose reporting angles from confirmed facts |
| `/api/translate` | Translate text (5,000 characters maximum) |

## Security and Privacy

- Keys are strictly server-side; no keys are ever exposed to the client, logs, or error messages.
- Provided URLs pass through `lib/security/safe-fetch.ts` (restricts to HTTP/HTTPS, public IPs, standard ports, re-verified redirects, and bounded size and timeouts).
- No submitted content is logged. Folders and cases remain in the journalist's browser `localStorage`.
- Rate limits are enforced per IP and per user, shared via Supabase if `RATE_LIMIT_STORE=supabase`.
- User content is strictly treated as data, never as instructions; hallucinated or untrusted sources are stripped programmatically.

## Tests and CI

`npm test` executes API tests (Vitest) followed by core logic tests (`node --test`). The GitHub Actions CI workflow validates typechecking, linting, tests, and the production build using `USE_MOCK=true`.

## Deployment

- **Vercel**: Detailed guide available in [`docs/deploy-vercel.md`](docs/deploy-vercel.md). AI routes are configured with a `maxDuration` of up to 300 seconds.
- **Docker**: `docker compose up --build` builds the standalone image and exposes the application on port 3000.

## Known Limitations

- Malagasy language proficiency varies across models; any translation to or from Malagasy is automatically flagged as "needs review".
- OpenRouter web search features are billed separately; without active credits, verifications default to `insufficient`.
- The response cache and rate-limit stores run in-memory unless a Supabase backend is configured.
- Offline mode is currently restricted to a static `/offline` page; application data is not cached for offline access.

## Documentation

| File | Content |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Product, technical, and security guidelines |
| [`docs/api.md`](docs/api.md) | API route specifications and contracts |
| [`README_AI.md`](README_AI.md) | AI configuration, models, caching, and demo setups |
| [`docs/demo.md`](docs/demo.md) | Standard 3-minute demonstration script |
| [`docs/deploy-vercel.md`](docs/deploy-vercel.md) | Step-by-step Vercel deployment guide |
| [`docs/reverse-search.md`](docs/reverse-search.md) | Reverse image search implementation details |
