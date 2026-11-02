# AI features

All AI calls go through `lib/ai/client.ts` (`askJson`), which is server-only and talks to OpenRouter through the `openai` SDK. Every route applies, in this order: IP rate limit, Supabase session check, per-user rate limit, body size limit, strict Zod input validation, daily quota, then Zod validation of the model output. Clients only receive generic error codes.

## Environment

Copy `.env.example` to `.env.local` (never commit it) and fill in:

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL`, `LLM_API_KEY`, `AI_MODEL` | OpenRouter endpoint, key and model. Server-only, never prefixed `NEXT_PUBLIC_`. |
| `USE_MOCK` | `true` returns deterministic demo data with `mock: true` and never calls the model. |
| `AI_MAX_TOKENS`, `AI_WEB_MAX_RESULTS`, `AI_DAILY_LIMIT_PER_USER` | Cost caps: output tokens, web results per verification, calls per user per day and per route. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project. The anon key is public by design. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Used only by local demo mode to read the seeded directory. |
| `DEMO_MODE` | `true` skips authentication in local development. Ignored when `NODE_ENV=production`. |

Requests are authenticated with `Authorization: Bearer <supabase access token>` or the Supabase session cookie. Anonymous Supabase sessions (`signInAnonymously`) count as authenticated users.

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
