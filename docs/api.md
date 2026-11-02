# API contract

All request and response types are exported from `lib/api/contract.ts`. Import them instead of redefining shapes in the frontend:

```ts
import type { VerifyTextSuccess, ScoredClaim } from "@/lib/api/contract";
import { postApi } from "@/lib/api/fetcher";

const result = await postApi("/api/verify/text", { content, type: "text", lang: "mg" });
if (result.ok) {
  result.result.globalIndex;
} else if (result.error.code === "rate_limited") {
  result.retryAfterSeconds;
}
```

`postApi` never throws for HTTP or network errors (only when its `signal` is aborted). It returns either the success body plus `status`, or `{ ok: false, status, error: { code, message, fields? }, retryAfterSeconds }`. Client-side codes: `network_error` (status 0), `unexpected_response`, and `request_failed` (legacy routes).

## Common rules

- All routes are `POST` with `Content-Type: application/json`. Other methods return 405.
- Authentication: Supabase session cookie, or `Authorization: Bearer <access token>`. Anonymous Supabase sessions are accepted. `DEMO_MODE=true` skips this check outside production.
- Responses carry `Cache-Control: no-store` and no CORS headers: call the API from the same origin.
- Every response with `mock: true` is demonstration data and must be shown with a "Demonstration" badge.
- Error body: `{ "ok": false, "error": { "code": string, "message": string, "fields"?: string[] } }`. `message` is generic English; translate from `code` in the UI. `fields` lists invalid input paths for `invalid_input`.

| Code | Status | Meaning |
|---|---|---|
| `rate_limited` | 429 | More than 10 requests per minute per IP or per user. `Retry-After` header is set. |
| `daily_quota_exceeded` | 429 | Daily AI quota for this user and route reached. `Retry-After` header is set. |
| `unauthorized` | 401 | Missing or invalid session. |
| `auth_unavailable` | 503 | Supabase is not configured on the server. |
| `invalid_body` | 400, 413, 415 | Malformed JSON, body too large, or wrong content type. |
| `invalid_input` | 400 | Body does not match the schema. |
| `ai_timeout` | 504 | The model took too long. |
| `ai_unavailable` | 503 | Model provider error or invalid model output after a retry. |
| `internal_error` | 500 | Unexpected server error. |

## POST /api/verify/text

Request (`VerifyTextRequest`), max body 32 KB, unknown keys rejected:

```json
{ "content": "text to verify, or an http(s) URL", "type": "text" | "url", "lang": "mg" | "fr" | "en" }
```

`content` is 1 to 8,000 characters (2,048 for a URL). `lang` is optional; without it the output follows the content language.

Success (`VerifyTextSuccess`):

```json
{
  "ok": true,
  "mock": false,
  "result": {
    "detectedLanguage": "fr",
    "summary": "...",
    "claims": [{
      "text": "...",
      "status": "confirmed" | "contradicted" | "insufficient" | "needs_verification",
      "confidenceIndex": 0,
      "breakdown": [{ "code": "official_source", "label": "1 official source domain(s)", "points": 35 }],
      "rationale": "...",
      "sources": [{ "title": "...", "url": "https://...", "publisher": "...", "date": "2026-10-12" | null,
                    "kind": "official" | "independent" | "other", "stance": "supports" | "contradicts" | "context" }],
      "contradictions": ["..."],
      "recommendedChecks": ["..."]
    }],
    "limitations": ["..."],
    "globalIndex": 0,
    "globalBreakdown": [{ "code": "claim_contribution", "label": "...", "points": 0 }]
  },
  "meta": { "analyzedUrl": "https://..." | null, "droppedSources": 0, "durationMs": 0 }
}
```

- `confidenceIndex` is computed by `lib/score.ts`, never by the model. The `points` of `breakdown` add up to it. Use `breakdown[].code` (type `ScoreCode`) to translate the "Why this index?" panel.
- Every source URL was returned by the web search of this request. `droppedSources` counts sources the model cited that the search did not return.
- An empty `claims` array means no checkable claim was found (`globalIndex` is 0).

Route-specific errors: `url_not_allowed` (400, private, local or non-standard URL), `url_unreachable` (422, page could not be fetched as text), `url_no_content` (422, no readable text on the page).

Mock mode (`USE_MOCK=true`): returns 3 claims (confirmed, contradicted, insufficient) with official, independent and other sources on `example.org` addresses, in the requested `lang` (default `fr`). Content starting with `mock:empty` returns no claims; content starting with `mock:error` returns `ai_unavailable`.

## POST /api/sources/suggest

Request (`SuggestExpertsRequest`), max body 16 KB:

```json
{ "topic": "3 to 500 chars", "context": "optional, up to 2,000 chars", "lang": "mg" | "fr" | "en",
  "region": "analamanga", "languages": ["mg"], "limit": 5 }
```

`region` must be a slug from `lib/constants/regions.ts`. `limit` is 1 to 10 (default 5).

Success (`SuggestExpertsSuccess`):

```json
{
  "ok": true,
  "mock": false,
  "suggestions": [{
    "id": "uuid", "fullName": "...", "title": "...", "organization": "...", "orgType": "academic",
    "domains": ["health"], "languages": ["mg", "fr"], "regions": ["analamanga"],
    "contactEmail": "..." | null, "contactPhone": "..." | null,
    "lastVerifiedAt": "2026-08-15", "isStale": false, "isFictional": true,
    "relevance": 90, "reason": "...", "contributionType": "confirm" | "explain" | "contradict" | "field_testimony" | "data"
  }],
  "detectedDomains": ["health"],
  "missingProfiles": ["generic profile type"],
  "regionBroadened": false,
  "notice": { "code": "topic_not_identified" | "no_matching_experts", "message": "..." }
}
```

- Experts come only from the directory; contact details always come from the database row. `isStale` is true after 180 days without verification. Show a "fictional" badge when `isFictional` is true.
- `notice` is present (with HTTP 200 and no suggestions) when the topic has no identifiable domain or no expert matches.
- `regionBroadened` is true when fewer than 3 experts matched the region and the search was widened to the whole country.

Route-specific error: `directory_unavailable` (503).

Mock mode: topic domains are detected by keywords and the ranking is deterministic. Without Supabase, the 16 fictional seed profiles in `lib/experts/fixtures.ts` are used, with the same consent filter.

## POST /api/editorial/angles

Request (`EditorialAnglesRequest`): `{ "subject"?: string, "verificationId"?: string, "claims"?: [{ "text", "status" }], "lang": "mg" | "fr" | "en" }`. A subject or at least one confirmed claim is required.

Success (`EditorialAnglesSuccess`): `{ ok: true, mock, verificationId, lang, angles: [{ title, premise, interviewQuestions, actorTypes, dataToFind, format, basedOn, toVerifyFirst }], limitations, usage, attempts }`.

This route still uses the legacy error body `{ "ok": false, "erreur": string }` (French message, no code) and only an IP rate limit, without session check or daily quota. `postApi` maps these errors to `request_failed`.

## GET /api/ping-ai

Health check of the model connection: `{ "ok": true, "mock": boolean, "reponse": string }` or the legacy error body.
