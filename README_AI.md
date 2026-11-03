# AI features

All AI calls go through `lib/ai/client.ts` (`askJson`), which is server-only and talks to OpenRouter through the `openai` SDK. Every route applies, in this order: IP rate limit, Supabase session check, per-user rate limit, body size limit, strict Zod input validation, daily quota, then Zod validation of the model output. Clients only receive generic error codes.

## Environment

Copy `.env.example` to `.env.local` (never commit it) and fill in:

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `AI_MODEL` | OpenRouter endpoint, key and model. Server-only, never prefixed `NEXT_PUBLIC_`. |
| `USE_MOCK` | `false` by default. `true` returns deterministic demo data with `mock: true` and never calls the model, in development only: it is ignored when `NODE_ENV=production`. |
| `AI_REASONING_TOKENS` | Extra token budget for models that reason before answering (default 2000). Reasoning shares the output budget, so without it a long reasoning cuts the JSON answer. |
| `AI_FALLBACK_MODEL` | Optional second model. When the main model hits a rate limit, a provider error or invalid output, the request is retried once with it. |
| `URL_FETCH_TIMEOUT_MS` | Time allowed to fetch a page for link verification (default 12000, between 3000 and 20000). |
| `AI_MAX_TOKENS`, `AI_WEB_MAX_RESULTS`, `AI_DAILY_LIMIT_PER_USER` | Cost caps: output tokens, web results per verification, calls per user per day and per route. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project. The anon key is public by design. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Used only by local demo mode to read the seeded directory. |
| `DEMO_MODE` | `true` skips authentication in local development. Ignored when `NODE_ENV=production`. |
| `AI_CACHE_TTL_SECONDS` | How long a user's identical request is served from memory without calling the model (default 600, `0` disables). |
| `DEMO_FALLBACK` | `off` (default), `on_error` (replay a recording when the model or network fails) or `always` (replay a recording before calling the model). |
| `DEMO_RECORD` | `true` saves successful real results to `data/demo/`. Ignored when `NODE_ENV=production`. |

Requests are authenticated with `Authorization: Bearer <supabase access token>` or the Supabase session cookie. Anonymous Supabase sessions (`signInAnonymously`) count as authenticated users.

## Model per task

Each AI feature reads its own model variable and falls back to `AI_MODEL` when it is empty (`lib/ai/models.ts`). `AI_FALLBACK_MODEL` is shared: when a task's model fails (rate limit, provider error, invalid output), the request is retried once with it, unless it is the same model.

| Task | Variable | Recommended ID to test |
|---|---|---|
| Claim verification | `AI_MODEL_VERIFY` | `google/gemini-3.5-flash` |
| Translation | `AI_MODEL_TRANSLATE` | `google/gemini-3.5-flash` |
| Story angles | `AI_MODEL_ANGLES` | `google/gemini-3.5-flash` |
| Image and video analysis | `AI_MODEL_VISION` | `google/gemini-3.5-flash-lite` |
| Expert classification and ranking | `AI_MODEL_EXPERTS` | `google/gemini-3.5-flash-lite` |
| Shared fallback | `AI_FALLBACK_MODEL` | a free model (`…:free`) |

These IDs were listed in the OpenRouter catalog with image input and JSON mode support; newer Gemini Flash versions also exist there. Set the values in `.env.local` only.

In code, pick the task, never a model id:

```ts
const { data } = await askJson({ task: "verify", system, user, schema });
const { text } = await askText({ task: "translate", system, user, accept: (out) => out !== input });
const vision = await askJson({
  task: "vision",
  system,
  user: [{ type: "text", text: "Describe" }, { type: "image_url", image_url: { url: dataUrl } }],
  schema,
});
```

Both keep the same retry, reasoning budget, timeout and fallback behaviour. `askText` retries once when the answer is empty, truncated or rejected by `accept`. A failed call throws an `AiError` whose `code` and `providerStatus` are safe to log.

Free models are a fallback, not a default. Some free providers may log prompts or use them for training, so never route confidential material to them: a journalist's unpublished document must only reach a paid model whose provider does not train on prompts.

## Cache and demo fallback

- Identical requests from the same user are answered from an in-memory cache for `AI_CACHE_TTL_SECONDS`, without calling the model or using the daily quota (`meta.cached: true`). Keys are SHA-256 hashes that include the user ID, so one user can never learn what another submitted. Entries are kept in memory only and expire after the TTL.
- Demo scenarios can be recorded once in real mode and replayed when the network or the model fails, with `meta.replayed: true` and `meta.recordedAt`. The UI must show them as recorded results.

To record the demo scenarios (each run is a real, paid model call):

```bash
DEMO_RECORD=true USE_MOCK=false DEMO_MODE=true npm run dev
```

Send each scenario once, check the files written to `data/demo/`, review them and commit them. They contain the scenario input and output, so record only public demo content, never confidential material. To replay them, set `DEMO_FALLBACK=on_error` (or `always` to skip the network entirely) and run `npm run build && npm start`. With the network off, Supabase cannot validate sessions, so offline rehearsals need `DEMO_MODE=true` in development.

## Text verification

`POST /api/verify/text` with `{ "content": string, "type": "text" | "url", "lang"?: "mg" | "fr" | "en" }`.

- `type: "url"` fetches the page server-side through `lib/security/safe-fetch.ts` (http/https only, public IPs only, standard ports, 8 s timeout, 2 MB, 3 re-checked redirects) and extracts the main text.
- The model runs with OpenRouter web search. Any source whose URL was not returned by that search is dropped, and a claim left without sources becomes `insufficient`.
- The model never sets the confidence index. `lib/score.ts` computes it per claim from source kind, stance, distinct domains, publication date and contradictions, returns a `breakdown` of `{ code, label, points }` items, and averages the claims into `globalIndex` with a `globalBreakdown`. `insufficient` is capped at 25 and `needs_verification` at 70. A `confirmed` claim needs at least 2 reliable independent domains and a `contradicted` claim needs at least 1 reliable contradicting source, otherwise the status is lowered to `needs_verification`.
- Statuses are `confirmed`, `contradicted`, `insufficient` and `needs_verification`, never "true" or "false".

## Expert suggestions

`POST /api/sources/suggest` ranks experts **from the local directory only**. It never lets the model invent a person, a contact detail or an ID.

Flow:

1. The model classifies the topic into one or more keys from `lib/constants/domains.ts`.
2. The server pre-filters consented experts in Supabase (domains, region, languages).
3. The model ranks the pre-filtered candidates using short refs (`c1`..`c20`). Only `ref`, `full_name`, `title`, `organization`, `org_type`, `domains`, `languages`, `regions` and `bio` are sent.
4. The server drops unknown refs, removes duplicates, sorts by relevance, applies `limit`, and maps refs back to database rows. Contact fields always come from the database row.

### 1. Mock and demo modes

- `USE_MOCK=true` uses a deterministic keyword classifier and ranking.
- With `DEMO_MODE=true` the route reads the directory with the service role key, and the expert query still filters `consent_status`.

### 2. Database

The migration is `supabase/migrations/20261102090000_create_experts.sql`. It creates the `experts` table, GIN indexes, the `updated_at` trigger and the RLS policy. Only authenticated users can select rows whose `consent_status` is `granted` or `public_info`.

The seed is `supabase/seed.sql`. It contains 16 clearly fictional profiles (`is_fictional = true`), with `example.com` emails, fake `+261 00 000 00 00`-style phones, varied domains/regions/languages, stale verification dates, two `pending` rows and one `revoked` row. Pending and revoked rows must never appear in a response.

Local Supabase (recommended for the hackathon):

```bash
npx supabase init          # only once, if supabase/config.toml is absent
npx supabase start
npx supabase db reset      # applies migrations and then supabase/seed.sql
```

Hosted Supabase:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

`supabase db push` does not run the seed automatically, hence the `psql` command. If `psql` is not installed, paste the contents of `supabase/seed.sql` into the Supabase SQL editor.

### 3. Run and test

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

Open `tests/suggest.http` with the VS Code REST Client extension. The file contains:

1. a French topic,
2. a Malagasy topic,
3. a topic with a region and language filter,
4. a topic matching no expert,
5. a prompt-injection attempt.

With `DEMO_MODE=true`, the token in the file can stay `demo`. With `DEMO_MODE=false`, replace it with a valid Supabase access token.

Expected behaviour:

- `pending` and `revoked` experts never appear.
- Unknown refs returned by the model are silently dropped.
- Duplicate refs are reduced to the highest relevance.
- `missingProfiles` contains generic profile types, never names or contact details.
- A topic with no identifiable domain returns HTTP 200 with an empty `suggestions` array and `notice.code = topic_not_identified`.
- A region filter is broadened once when fewer than 3 experts match; the response then has `regionBroadened: true`.

### 4. Privacy and logging

The route logs only the user ID, duration, status, candidate count, suggestion count and token usage. It never logs the topic, the context, bios, emails or phone numbers.

The ranking prompt wraps the topic, context and bios in `<topic>`, `<context>` and `<candidates>` tags and instructs the model to ignore instructions found inside them. The server-side guard is the final defence: a returned `ref` is only accepted if it was actually sent to the model, so an invented expert cannot reach the response.

## Translation

`POST /api/translate` with `{ "sourceLang", "targetLang", "text" }` (mg, fr or en, up to 5,000 characters, languages must differ). It uses the same session check, rate limits and generic errors as the other routes, and returns `needsReview: true` when the target is Malagasy.

## Key figures

`data/stats.json` holds the latest World Bank indicators for Madagascar, each with its year, source link and update date. Refresh it with `npm run stats:update`. Entries without a source are dropped when the file is loaded, and figures older than three years are flagged in the interface.

