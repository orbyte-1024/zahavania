# Deploying Zahavan'Ia on Vercel

This guide prepares a production deployment. Nothing here deploys automatically: an owner of the Vercel project runs the import and fills in the values.

## 1. Project settings

- **Framework preset**: Next.js. Keep the default build command (`next build`) and the default output.
  - `output: "standalone"` in `next.config.ts` is there for the Docker image. Vercel builds Next.js natively.
- **Node.js version**: the one in `.nvmrc` (24), the same as CI.
- **Fluid compute**: keep it on (the default for new projects). The AI routes declare a `maxDuration` of up to 300 s. Without Fluid compute, the Hobby plan stops functions at 60 s.
- **Region**: one close to the AI provider and Supabase. Every function runs in the same region.

## 2. Environment variables

Set them in **Project → Settings → Environment Variables** for *Production* (and *Preview* if previews should work). Never prefix a secret with `NEXT_PUBLIC_`.

| Name | Secret | Production value |
| --- | --- | --- |
| `LLM_BASE_URL` | no | `https://openrouter.ai/api/v1` |
| `LLM_API_KEY` | **yes** | OpenRouter key with a spending limit |
| `AI_MODEL` | no | default model for every task |
| `AI_MODEL_VERIFY`, `AI_MODEL_TRANSLATE`, `AI_MODEL_VISION`, `AI_MODEL_EXPERTS`, `AI_MODEL_ANGLES` | no | optional, one model per task (see `README_AI.md`) |
| `AI_FALLBACK_MODEL` | no | optional, used once when the main model fails |
| `AI_MAX_TOKENS`, `AI_REASONING_TOKENS`, `AI_WEB_MAX_RESULTS` | no | optional tuning, defaults are in `.env.example` |
| `AI_DAILY_LIMIT_PER_USER` | no | daily AI requests per user and route |
| `AI_CACHE_TTL_SECONDS` | no | how long an identical request is served from cache |
| `URL_FETCH_TIMEOUT_MS` | no | timeout when reading a submitted link |
| `NEXT_PUBLIC_SUPABASE_URL` | no (public by design) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public by design) | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | only needed by demo mode; leave it unset in production if possible |
| `USE_MOCK` | no | **`false`**. It is ignored in production anyway |
| `DEMO_MODE` | no | **`false`**. It skips sign-in and is ignored in production anyway |
| `DEMO_RECORD` | no | **`false`**. The deployed file system is read-only |
| `DEMO_FALLBACK` | no | `off`, `on_error` (replay a recorded result when the provider fails) or `always` (replay first, rehearsal only) |

`NODE_ENV` is set by Vercel. Do not set it.

## 3. Supabase

1. **Authentication → Sign In / Providers**: enable **anonymous sign-ins**. Every visitor gets an anonymous session, which the API requires.
2. **Authentication → URL Configuration**:
   - set **Site URL** to the production domain (for example `https://zahavania.vercel.app`);
   - add the production domain to **Redirect URLs**, plus `https://*-<team>.vercel.app/**` if previews must sign in.
3. **Database**: run `supabase/migrations/*.sql`, then `supabase/seed.sql` only for a demo directory. The seed profiles are fictional and marked as such.
4. **Rate limits**: under Authentication → Rate Limits, raise the anonymous sign-in limit if a whole room will open the app at once.

## 4. Limits that behave differently on Vercel

- **Request bodies over 4.5 MB are rejected by Vercel** before the code runs. The app stays below that limit:
  - images are compressed in the browser to 3.8 MB at most, and the API refuses more than 4 MB;
  - videos never leave the device: at most 6 JPEG key frames, 3.8 MB in total, are sent;
  - JSON routes accept at most 128 KB.

  `tests/deploy-limits.test.mjs` checks these values.
- **No ffmpeg**: video frames are extracted in the browser.
- **The rate limiters and the response cache live in memory, per instance.**
  - Each serverless instance has its own counters and its own cache.
  - Under load, Vercel starts several instances, so the real limit is "N requests per instance", and a cold start resets them.
  - The daily AI quota is therefore a soft limit. Keep a spending limit on the OpenRouter key as the hard limit.
  - For strict limits, move the counters to a shared store (a Supabase table with an atomic increment, or a hosted Redis).
- **Demo recordings**:
  - `DEMO_FALLBACK` can only replay the files committed in `data/demo/` (bundled through `outputFileTracingIncludes`);
  - recording (`DEMO_RECORD`) only works locally.
- **Logs**: they contain codes, statuses, durations and token usage, never submitted content. Vercel keeps them according to the plan's retention.

## 5. Smoke test after each deployment

Run these on the production URL, in a private window, on a phone and on a laptop:

1. `/` loads with no console error. The 3D scene scrolls, and the theme follows the system with no flash.
2. `/app/verify`: paste a short claim, and get claims with sources, an index and statuses. No "Demonstration" badge is shown.
3. `/app/verify` with a news link: the page is read and sources are listed.
4. `/app/image`:
   - a 5 to 10 MB phone photo returns observations and metadata;
   - the request in the network tab is under 4 MB.
5. `/app/image` with an MP4: 6 frames are listed with their times. An iPhone `.mov` in Chrome shows the "export as MP4" message.
6. `/app/translate`, fr → mg: a translation with the "to be reviewed" badge.
7. `/app/experts`: suggestions come from the directory, with fictional profiles marked.
8. `/app/angles` from a verification: angles are based on confirmed claims only.
9. Language switch mg / fr / en and theme switch light / dark on every screen.
10. Send 11 requests in a minute on one screen: the 11th shows the "too many requests" message.
11. In the Vercel logs, failed calls show only `code` and `providerStatus`, never the submitted text, image or link.
