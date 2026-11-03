# Zahavan'ia — A journalistic investigation assistant for Madagascar

    **"You look — the AI looks with you."**



*Zahavan'ia* is the translation, in the southern dialect of Madagascar, of the Malagasy
expression meaning "you look" — the gesture of paying attention to something, of looking
together. Within the project's nomenclature, this name carries its full meaning:
*Zahavan'ia: "You look — the AI looks with you."*
The journalist stays in control; the AI helps them see further, faster, and above all
with evidence to back it up.

Zahavan'ia helps journalists go from a raw piece of news they received
(often via WhatsApp or Facebook) to *verified, documented, and usable* content.
This is not a chatbot: it is a pipeline of
*Monitor → Verify (text/link, image) → Contextualize (figures) → Contact an expert → Find an angle*.

---

## Honesty principles (non-negotiable)

- *Never a "true/false" verdict.* Only the statuses confirmed, contradicted,
  insufficient, needs_verification.
- *A 0–100 confidence index*, computed by the code (lib/score.ts), never "decided" by
  the model, fully explained, and presented as indicative — not as a probability.
- *Traceability:* every conclusion links back to clickable sources (title, domain, date, URL).
  No usable source = insufficient status.
- *The AI invents nothing:* no source, no URL, no quote, no figure, no person's name.
- *The journalist decides:* every report offers Validate / Enrich / Reject.
- *Images are clues, never proof.* An image with "no anomaly" is not "authentic".
- *Data is always dated and sourced* (source, reference period, date last updated).

---

## Features

| Screen | What it does |
| --- | --- |
| *Verify* | Breaks a text or link down into individual claims and cross-checks them through web search; per-claim report with status, explainable confidence, and clickable sources. |
| *Image / Video* | EXIF metadata, visual clues, reverse-image search links; for video, *6 key frames extracted in the browser* (no server-side ffmpeg). |
| *Monitor* | Groups articles together and raises alerts (P2). |
| *Translate* | Malagasy ⇄ French ⇄ English, with automatic checks (output language, sentence splitting). |
| *Experts* | Directory of *consenting* people, filterable by field, region, and language (fictional data in demo mode). |
| *Stats* | Dated, sourced World Bank indicators (data/stats.json). |
| *Angles* | Story-angle suggestions based *only* on confirmed claims. |
| *My Dossiers* | Local saving of reports (localStorage) — nothing leaves the device. |

---

## Tech stack

- *Framework*: [Next.js 16](https://nextjs.org) (App Router, cacheComponents) — single repo, with the app/api/* routes acting as the backend.
- *Frontend*: React 19, strict TypeScript, *Tailwind CSS v4*
- *i18n*: next-intl, language selected via the NEXT_LOCALE cookie (mg | fr | en, default mg)
- *AI*: the openai SDK pointed at [OpenRouter](https://openrouter.ai), web search via the web plugin, zod validation on output
- *Data*: [Supabase](https://supabase.com) (anonymous auth + experts directory with RLS), data/stats.json, localStorage
- *Media*: sharp, exifr, image-size; 3D and animations: three + @react-three/fiber, gsap, lenis, motion
- *Tests*: vitest (tests/api/*.test.ts) + node --test (tests/*.test.mjs)
- *Security*: server-side keys only, SSRF protection for submitted URLs (lib/security/safe-fetch.ts), IP + user + day rate limiting, strict zod validation on input/output
- *CI*: GitHub Actions
- *Deployment*: Vercel or Docker

---

## Local installation

### Prerequisites

- *Node.js 24+* (current LTS) and npm
- or *Docker* with Docker Compose v2
- An [OpenRouter](https://openrouter.ai) key for AI calls (optional in demo mode)

### Method 1 — standard Next.js installation

# 1. Clone the repository
git clone <repository-url> zahavania
cd zahavania

# 2. Install dependencies
npm ci

# 3. Configure your environment
cp .env.example .env.local
# then edit .env.local (see "Environment variables" below)

# 4. Run in development
npm run dev
# → http://localhost:3000

In development, you can set 
USE_MOCK=true in .env.local to run *without an API key*
(demo outputs are flagged with a "Demonstration" badge).
This mode is *ignored in production*: npm run build && npm start requires real API calls.

Build and run in real conditions:

npm run build
npm start

### Method 2 — Docker

# 1. Configure your environment (secrets are read at runtime, never at build time)
cp .env.example .env.local

# 2. Build and start (application + PostgreSQL 17)
docker compose up --build

# → http://localhost:3000

The 
Dockerfile is multi-stage: npm ci → npm run build → minimal runtime image
(Node 24 Alpine, standalone output, non-root user, port 3000).
The db service (PostgreSQL) is *not published* on the host by default: the app reaches it
at db:5432 on the Compose network. To access it with an external client, uncomment the
ports block in docker-compose.yml.

Useful commands:

docker compose logs -f app   # application logs
docker compose down           # stop
docker compose down -v        # stop + delete the PostgreSQL data

### Environment variables

Secrets live in 
.env.local (git-ignored); .env.example contains no real values.
The most important ones:

| Variable | Purpose |
| --- | --- |
| LLM_BASE_URL | OpenRouter endpoint (https://openrouter.ai/api/v1) |
| LLM_API_KEY | API key — *server-side only, never exposed to the client* |
| AI_MODEL, AI_MODEL_VERIFY, AI_MODEL_TRANSLATE, AI_MODEL_VISION, AI_MODEL_EXPERTS, AI_MODEL_ANGLES, AI_MODEL_MONITOR | Per-task models (falls back to AI_MODEL) |
| AI_FALLBACK_MODEL | Fallback model after a failure |
| USE_MOCK | true = demo outputs (development only, ignored in production) |
| AI_DAILY_LIMIT_PER_USER, AI_CACHE_TTL_SECONDS | Daily quota and per-user cache |
| URL_FETCH_TIMEOUT_MS | Maximum delay for fetching a submitted URL |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase directory (anon key is public by design) |
| SUPABASE_SERVICE_ROLE_KEY | Service role key — *server-side only* |
| RATE_LIMIT_STORE | supabase (shared) or in-memory (default) |

---

## Tests and quality

npm run lint    # ESLint
npm test        # Vitest (tests/api) then node --test (unit tests)
npm run check:real   # real-mode check (if .env.local is present)

The GitHub Actions CI runs lint, tests, and build on every push/PR.

Update the statistics (World Bank API):

npm run stats:update

---

## Deployment

- 
*Vercel*: guide in [`docs/deploy-vercel.md`](docs/deploy-vercel.md)
- *Docker*: see method 2 above (self-contained image, ready for any orchestrator)

---

## Project structure

app/
  page.tsx                      # immersive landing page (scrubbed 3D scenes)
  app/{verify,image,monitor,translate,experts,stats,angles,files}/page.tsx
  api/verify/{text,image,video}/route.ts   # AI routes = backend
  api/sources/suggest/route.ts
  api/editorial/angles/route.ts
  api/translate/route.ts
components/landing/             # animated scenes, DispatchCloud (3D)
components/workspace/           # application screens
lib/ai/                         # the ONLY entry point to the model + prompts + schemas
lib/security/                   # auth, rate limiting, safe-fetch (SSRF), request handling
lib/score.ts                    # confidence index computed by the code
data/stats.json                 # dated World Bank indicators
messages/{mg,fr,en}.json        # translations (always in all 3 languages)
tests/                          # vitest + node --test

---

## Resources

- [`AGENTS.md`](AGENTS.md) — the project's product and technical rules
- [`LICENSES.md`](LICENSES.md) — dependency licenses (required by the regulations)
- [`docs/api.md`](docs/api.md) — API route reference
- [`docs/demo.md`](docs/demo.md) — demo scenario
- [`docs/malagasy-tests.md`](docs/malagasy-tests.md) — Malagasy-language tests
- [`README_AI.md`](README_AI.md) — detailed AI configuration
# Zahavan'ia — A journalistic investigation assistant for Madagascar

    **"You look — the AI looks with you."**



*Zahavan'ia* is the translation, in the southern dialect of Madagascar, of the Malagasy
expression meaning "you look" — the gesture of paying attention to something, of looking
together. Within the project's nomenclature, this name carries its full meaning:
*Zahavan'ia: "You look — the AI looks with you."*
The journalist stays in control; the AI helps them see further, faster, and above all
with evidence to back it up.

Zahavan'ia helps journalists go from a raw piece of news they received
(often via WhatsApp or Facebook) to *verified, documented, and usable* content.
This is not a chatbot: it is a pipeline of
*Monitor → Verify (text/link, image) → Contextualize (figures) → Contact an expert → Find an angle*.

---

## Honesty principles (non-negotiable)

- *Never a "true/false" verdict.* Only the statuses confirmed, contradicted,
  insufficient, needs_verification.
- *A 0–100 confidence index*, computed by the code (lib/score.ts), never "decided" by
  the model, fully explained, and presented as indicative — not as a probability.
- *Traceability:* every conclusion links back to clickable sources (title, domain, date, URL).
  No usable source = insufficient status.
- *The AI invents nothing:* no source, no URL, no quote, no figure, no person's name.
- *The journalist decides:* every report offers Validate / Enrich / Reject.
- *Images are clues, never proof.* An image with "no anomaly" is not "authentic".
- *Data is always dated and sourced* (source, reference period, date last updated).

---

## Features

| Screen | What it does |
| --- | --- |
| *Verify* | Breaks a text or link down into individual claims and cross-checks them through web search; per-claim report with status, explainable confidence, and clickable sources. |
| *Image / Video* | EXIF metadata, visual clues, reverse-image search links; for video, *6 key frames extracted in the browser* (no server-side ffmpeg). |
| *Monitor* | Groups articles together and raises alerts (P2). |
| *Translate* | Malagasy ⇄ French ⇄ English, with automatic checks (output language, sentence splitting). |
| *Experts* | Directory of *consenting* people, filterable by field, region, and language (fictional data in demo mode). |
| *Stats* | Dated, sourced World Bank indicators (data/stats.json). |
| *Angles* | Story-angle suggestions based *only* on confirmed claims. |
| *My Dossiers* | Local saving of reports (localStorage) — nothing leaves the device. |

---

## Tech stack

- *Framework*: [Next.js 16](https://nextjs.org) (App Router, cacheComponents) — single repo, with the app/api/* routes acting as the backend.
- *Frontend*: React 19, strict TypeScript, *Tailwind CSS v4*
- *i18n*: next-intl, language selected via the NEXT_LOCALE cookie (mg | fr | en, default mg)
- *AI*: the openai SDK pointed at [OpenRouter](https://openrouter.ai), web search via the web plugin, zod validation on output
- *Data*: [Supabase](https://supabase.com) (anonymous auth + experts directory with RLS), data/stats.json, localStorage
- *Media*: sharp, exifr, image-size; 3D and animations: three + @react-three/fiber, gsap, lenis, motion
- *Tests*: vitest (tests/api/*.test.ts) + node --test (tests/*.test.mjs)
- *Security*: server-side keys only, SSRF protection for submitted URLs (lib/security/safe-fetch.ts), IP + user + day rate limiting, strict zod validation on input/output
- *CI*: GitHub Actions
- *Deployment*: Vercel or Docker

---

## Local installation

### Prerequisites

- *Node.js 24+* (current LTS) and npm
- or *Docker* with Docker Compose v2
- An [OpenRouter](https://openrouter.ai) key for AI calls (optional in demo mode)

### Method 1 — standard Next.js installation

# 1. Clone the repository
git clone <repository-url> zahavania
cd zahavania

# 2. Install dependencies
npm ci

# 3. Configure your environment
cp .env.example .env.local
# then edit .env.local (see "Environment variables" below)

# 4. Run in development
npm run dev
# → http://localhost:3000

In development, you can set 
USE_MOCK=true in .env.local to run *without an API key*
(demo outputs are flagged with a "Demonstration" badge).
This mode is *ignored in production*: npm run build && npm start requires real API calls.

Build and run in real conditions:

npm run build
npm start

### Method 2 — Docker

# 1. Configure your environment (secrets are read at runtime, never at build time)
cp .env.example .env.local

# 2. Build and start (application + PostgreSQL 17)
docker compose up --build

# → http://localhost:3000

The 
Dockerfile is multi-stage: npm ci → npm run build → minimal runtime image
(Node 24 Alpine, standalone output, non-root user, port 3000).
The db service (PostgreSQL) is *not published* on the host by default: the app reaches it
at db:5432 on the Compose network. To access it with an external client, uncomment the
ports block in docker-compose.yml.

Useful commands:

docker compose logs -f app   # application logs
docker compose down           # stop
docker compose down -v        # stop + delete the PostgreSQL data

### Environment variables

Secrets live in 
.env.local (git-ignored); .env.example contains no real values.
The most important ones:

| Variable | Purpose |
| --- | --- |
| LLM_BASE_URL | OpenRouter endpoint (https://openrouter.ai/api/v1) |
| LLM_API_KEY | API key — *server-side only, never exposed to the client* |
| AI_MODEL, AI_MODEL_VERIFY, AI_MODEL_TRANSLATE, AI_MODEL_VISION, AI_MODEL_EXPERTS, AI_MODEL_ANGLES, AI_MODEL_MONITOR | Per-task models (falls back to AI_MODEL) |
| AI_FALLBACK_MODEL | Fallback model after a failure |
| USE_MOCK | true = demo outputs (development only, ignored in production) |
| AI_DAILY_LIMIT_PER_USER, AI_CACHE_TTL_SECONDS | Daily quota and per-user cache |
| URL_FETCH_TIMEOUT_MS | Maximum delay for fetching a submitted URL |
| NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase directory (anon key is public by design) |
| SUPABASE_SERVICE_ROLE_KEY | Service role key — *server-side only* |
| RATE_LIMIT_STORE | supabase (shared) or in-memory (default) |

---

## Tests and quality

npm run lint    # ESLint
npm test        # Vitest (tests/api) then node --test (unit tests)
npm run check:real   # real-mode check (if .env.local is present)

The GitHub Actions CI runs lint, tests, and build on every push/PR.

Update the statistics (World Bank API):

npm run stats:update

---

## Deployment

- 
*Vercel*: guide in [`docs/deploy-vercel.md`](docs/deploy-vercel.md)
- *Docker*: see method 2 above (self-contained image, ready for any orchestrator)

---

## Project structure

app/
  page.tsx                      # immersive landing page (scrubbed 3D scenes)
  app/{verify,image,monitor,translate,experts,stats,angles,files}/page.tsx
  api/verify/{text,image,video}/route.ts   # AI routes = backend
  api/sources/suggest/route.ts
  api/editorial/angles/route.ts
  api/translate/route.ts
components/landing/             # animated scenes, DispatchCloud (3D)
components/workspace/           # application screens
lib/ai/                         # the ONLY entry point to the model + prompts + schemas
lib/security/                   # auth, rate limiting, safe-fetch (SSRF), request handling
lib/score.ts                    # confidence index computed by the code
data/stats.json                 # dated World Bank indicators
messages/{mg,fr,en}.json        # translations (always in all 3 languages)
tests/                          # vitest + node --test

---

## Resources

- [`AGENTS.md`](AGENTS.md) — the project's product and technical rules
- [`LICENSES.md`](LICENSES.md) — dependency licenses (required by the regulations)
- [`docs/api.md`](docs/api.md) — API route reference
- [`docs/demo.md`](docs/demo.md) — demo scenario
- [`docs/malagasy-tests.md`](docs/malagasy-tests.md) — Malagasy-language tests
- (README_AI.md) — detailed AI configuration

---

*Zahavan'ia* — hackathon, Madagascar. You look — the AI looks with you.
