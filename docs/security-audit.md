# Security audit — 2026-11-03

Scope: the repository at `origin/main` (`491b695`) and the deployment at `https://zahavania.vercel.app`.
Method: secret scan of the whole git history, `npm audit`, review of every API route, of outbound requests, of
rendered links, of Supabase policies, of logs and HTTP headers, and live checks against the deployment and the
Supabase project.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | **High** | The expert directory, contacts included, could be downloaded by anyone | Fixed in code; migration to apply |
| 2 | **High** (availability) | Production answers `503 auth_unavailable` on every AI route | Vercel configuration to fix |
| 3 | Medium | No clickjacking protection or basic security headers | Fixed |
| 4 | Medium | Client IP taken from the first `X-Forwarded-For` value, which a client can set | Fixed |
| 5 | Medium | API keys shared in a chat session | Rotate the keys |
| 6 | Low | Rate limits kept in memory on Vercel | Configuration |
| 7 | Low | Content sent to third-party processors | Documented |
| 8 | Info | Firefox warned that an `AudioContext` was blocked | Gone: landing sound removed |

### 1. Expert directory readable through the Supabase REST API (High)

`experts` granted `select` to the `authenticated` role, and anonymous Supabase sessions have that role. With the public
anon key, anyone could open an anonymous session and call `/rest/v1/experts`: the live check returned the 13 consented
profiles **with their 13 emails and 13 phone numbers**. The app itself only shows the experts it suggests, but the
REST API exposed the whole table. Once real experts are imported, their contacts could be bulk-exported.

Fix:
- `lib/supabase/service.ts`: server-only Supabase client with the service role key and a timeout.
- `/api/sources/suggest` reads the directory with it, after the session, the rate limits and the input are checked.
  The query already filters on `consent_status`, so it does not rely on the policy.
- `supabase/migrations/20261103140000_experts_server_only.sql` drops the policy and revokes every privilege from
  `anon` and `authenticated`. RLS stays on with no policy: only the service role can read the table.

To apply, in this order: deploy the code (it works before and after the migration), then run the migration in the
Supabase SQL editor. Check: an anonymous session calling `/rest/v1/experts` must get `401` / `42501`.

### 2. Production cannot authenticate (High, availability)

Every AI route on `zahavania.vercel.app` answers `503 auth_unavailable`, with or without a session. The deployed
JavaScript contains no Supabase URL, and the names `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
are left unreplaced: they were not set in Vercel when the deployment was built. `NEXT_PUBLIC_` values are inlined at
build time, so they must be set **and the project redeployed**.

Variables to set in Vercel (Production and Preview):

| Variable | Note |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only; needed by the expert directory (finding 1) and shared rate limits |
| `LLM_API_KEY` | the comma-separated provider chain (OpenRouter, Groq, Ollama) |
| `SIGHTENGINE_API_USER`, `SIGHTENGINE_API_SECRET` | AI-generated image index |
| `RATE_LIMIT_STORE=supabase` | finding 6 |
| `DEMO_FALLBACK=on_error` | replays the recorded scenarios if AI providers fail |

`USE_MOCK`, `DEMO_MODE` and `EXPERTS_INCLUDE_FICTIONAL` must stay unset or `false` (mock and demo modes are ignored in
production anyway).

### 3. Missing security headers (Medium)

Only HSTS (from Vercel) was sent. The app could be framed by another site (clickjacking on the verification and
decision buttons), and browsers could sniff content types.

Fix (`next.config.ts`, every path): `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none';
base-uri 'self'; form-action 'self'; object-src 'none'`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone, geolocation,
payment and USB, and no `X-Powered-By`. A full `script-src` policy would need nonces for Next.js inline scripts and
is left for later.

### 4. Spoofable client IP in rate limits (Medium)

`clientIp` used the first value of `X-Forwarded-For`, which the client controls behind proxies that append to it
(Docker behind nginx, for instance), so per-IP limits could be bypassed by sending a different value on each request.
Now: `x-vercel-forwarded-for`, then `x-real-ip`, then the **last** `X-Forwarded-For` hop (added by the proxy).
Covered by `tests/api/client-ip.test.ts`.

### 5. API keys shared in a chat session (Medium)

The OpenRouter, Groq, Ollama, OpenCode and Cloudflare keys were pasted into an assistant conversation. They are not
in the repository (history scanned) and live only in `.env.local`, but they should be **regenerated** after the
hackathon, with spending limits where the provider allows it.

### 6. Rate limits in memory on Vercel (Low)

Without `RATE_LIMIT_STORE=supabase`, each serverless instance keeps its own counters, so limits are per instance.
Anonymous accounts are free to create (Supabase limits sign-ups per IP), so the per-IP limits are the real guard;
setting the shared store makes them hold across instances.

### 7. Content sent to third parties (Low, documented)

Submitted text and images go to the AI providers of the chain, images to Sightengine, and the first 300 characters of
a text to Ollama's web search when OpenRouter is not used. Nothing is logged or stored by the app. Journalists should
not submit confidential documents; the image screen already says the image is sent to Sightengine.

### 8. AudioContext warning (Info)

The landing created its audio context on events Firefox does not count as a gesture. The landing sound has since
been removed entirely, so no audio context is created any more.

## Checked, no issue found

- **Secrets**: no API key, JWT or service role key in any commit of any branch; only `.env.example` is tracked.
- **Dependencies**: `npm audit --omit=dev`: 0 vulnerabilities.
- **API routes**: every AI route checks the session, per-IP, per-user and daily limits, body size and a strict zod
  schema, and returns generic errors. `/api/monitor/sources` is public metadata with a per-IP limit.
- **Outbound requests**: user URLs and RSS feeds go through `safe-fetch` (public IPs, standard ports, re-checked
  redirects, size and time limits). Direct `fetch` only targets fixed hosts (Sightengine, Ollama search); model
  providers are fixed per key.
- **Rendered links**: AI sources are validated as `http(s)` and must come from the search; feed links are
  `http(s)` only; Ollama search results with another scheme are dropped. The only `dangerouslySetInnerHTML` is the
  static theme script.
- **Prompt injection**: user content and search results are wrapped in tags, the tags are neutralised inside the
  content, and the model is told to ignore instructions in them.
- **Supabase**: `rate_limit_counters` and `consume_rate_limit` are reachable only with the service role.
- **Logs**: route logs hold metadata only (user id, duration, status, code); error details never include the
  submitted text or URL.
- **Mock and demo modes** are ignored when `NODE_ENV=production`.
