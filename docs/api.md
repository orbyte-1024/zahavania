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

`postApi` never throws for HTTP or network errors (only when its `signal` is aborted). It returns either the success body plus `status`, or `{ ok: false, status, error: { code, message, fields? }, retryAfterSeconds }`. Client-side codes: `network_error` (status 0) and `unexpected_response`.

## Common rules

- All routes are `POST`. Text routes take `Content-Type: application/json`; `/api/verify/image` and `/api/verify/video` take `multipart/form-data`. Other methods return 405.
- Authentication: Supabase session cookie, or `Authorization: Bearer <access token>`. Anonymous Supabase sessions are accepted. `DEMO_MODE=true` skips this check outside production.
- Responses carry `Cache-Control: no-store` and no CORS headers: call the API from the same origin.
- Every response with `mock: true` is demonstration data and must be shown with a "Demonstration" badge.
- `meta.cached: true` means the same user sent the same request a few minutes ago and the stored answer was returned. `meta.replayed: true` means the model or network was unavailable and a result recorded on `meta.recordedAt` was replayed: show it as a recorded result with its date.
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
  "meta": { "analyzedUrl": "https://..." | null, "droppedSources": 0, "durationMs": 0,
            "cached": false, "replayed": false, "recordedAt": "2026-11-02T10:00:00.000Z" | null }
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
  "notice": { "code": "topic_not_identified" | "no_matching_experts", "message": "..." },
  "meta": { "durationMs": 0, "cached": false, "replayed": false, "recordedAt": null }
}
```

- Experts come only from the directory; contact details always come from the database row. `isStale` is true after 180 days without verification. Show a "fictional" badge when `isFictional` is true.
- `notice` is present (with HTTP 200 and no suggestions) when the topic has no identifiable domain or no expert matches.
- `regionBroadened` is true when fewer than 3 experts matched the region and the search was widened to the whole country.

Route-specific error: `directory_unavailable` (503).

Mock mode: topic domains are detected by keywords and the ranking is deterministic. Without Supabase, the 16 fictional seed profiles in `lib/experts/fixtures.ts` are used, with the same consent filter.

## POST /api/translate

Request (`TranslateRequest`), max body 24 KB, unknown keys rejected: `{ "sourceLang": "mg" | "fr" | "en", "targetLang": "mg" | "fr" | "en", "text": string }`. The two languages must differ; `text` is 1 to 5,000 characters.

Success (`TranslateSuccess`): `{ ok: true, mock, translatedText, sourceLang, targetLang, needsReview }`. `needsReview` is true when Malagasy is the source or the target: show "to be reviewed by a speaker".

Long texts are translated paragraph by paragraph. Each output is checked by code: an output equal to the input, or detected as another language than the target, is retried once.

Errors: the common codes above, plus `translation_unreliable` (502) when the output still fails the check. Provider details are never returned.

## POST /api/editorial/angles

Request (`EditorialAnglesRequest`): `{ "subject"?: string, "verificationId"?: string, "claims"?: [{ "text", "status" }], "lang": "mg" | "fr" | "en" }`. A subject or at least one confirmed claim is required.

Success (`EditorialAnglesSuccess`): `{ ok: true, mock, verificationId, lang, angles: [{ title, premise, interviewQuestions, actorTypes, dataToFind, format, basedOn, toVerifyFirst }], limitations, usage, attempts }`.

Max body 128 KB. Same chain as the other routes: IP limit, session, per-user limit, Zod, daily quota. Errors: the common codes above.

## POST /api/verify/image

Multipart fields:

- `image`: one JPEG, PNG or WebP file, 4 MB max. The app compresses photos in the browser first.
- `lang`: `mg`, `fr` or `en`.
- `exif`, optional: a JSON string `{ dateTaken?, creationDate?, camera?, software?, hasGPS? }` read on the device before compression. Coordinates are refused.

Success (`VerifyImageSuccess`): `{ ok: true, mock, file, metadata, metadataSource: "file" | "device" | "none", warnings, reverseSearch, analysis, verification, meta }`. `verification.status` is always one of the hint statuses, never a true/false verdict.

Extra error codes: `image_missing`, `image_too_large` (413), `unsupported_media` (415), `invalid_image`. Error bodies also carry `reverseSearch`.

## POST /api/verify/video

The browser extracts the key frames; the video itself is never uploaded.

Multipart fields:

- `frame`: 1 to 6 JPEG files, 900 KB each and 3.8 MB in total.
- `timestamps`: a JSON array, one increasing number of seconds per frame.
- `duration`: in seconds, 4 hours max.
- `lang`.

Success (`VerifyVideoSuccess`): `{ ok: true, mock, video, frames: [{ timestamp, status: "analysed" | "failed", analysis }], analysedCount, failedCount, observations, warnings, reverseSearch, verification, meta }`. Each entry of `observations` lists the `timestamps` where it was seen.

Extra error codes: `frames_missing`, `frames_too_large` (413), `unsupported_media` (415), `invalid_image`.
