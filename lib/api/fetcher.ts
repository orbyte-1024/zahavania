import type {
  EditorialAnglesErrorCode,
  EditorialAnglesRequest,
  EditorialAnglesSuccess,
  SuggestExpertsErrorCode,
  SuggestExpertsRequest,
  SuggestExpertsSuccess,
  TranslateErrorCode,
  TranslateRequest,
  TranslateSuccess,
  VerifyTextErrorCode,
  VerifyTextRequest,
  VerifyTextSuccess,
} from "@/lib/api/contract";

export type ApiRoutes = {
  "/api/verify/text": { request: VerifyTextRequest; success: VerifyTextSuccess; errorCode: VerifyTextErrorCode };
  "/api/sources/suggest": {
    request: SuggestExpertsRequest;
    success: SuggestExpertsSuccess;
    errorCode: SuggestExpertsErrorCode;
  };
  "/api/translate": { request: TranslateRequest; success: TranslateSuccess; errorCode: TranslateErrorCode };
  "/api/editorial/angles": { request: EditorialAnglesRequest; success: EditorialAnglesSuccess; errorCode: EditorialAnglesErrorCode };
};

export type ApiPath = keyof ApiRoutes;

export type ClientErrorCode = "network_error" | "unexpected_response";

export type ApiFailure<Code extends string> = {
  ok: false;
  status: number;
  error: { code: Code | ClientErrorCode; message: string; fields?: string[] };
  retryAfterSeconds: number | null;
};

export type ApiResult<P extends ApiPath> =
  | (ApiRoutes[P]["success"] & { status: number })
  | ApiFailure<ApiRoutes[P]["errorCode"]>;

export type PostApiOptions = {
  accessToken?: string;
  signal?: AbortSignal;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRetryAfter(header: string | null): number | null {
  const seconds = Number(header);
  return header !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export async function postApi<P extends ApiPath>(
  path: P,
  body: ApiRoutes[P]["request"],
  options: PostApiOptions = {},
): Promise<ApiResult<P>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${options.baseUrl ?? ""}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
      credentials: "same-origin",
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return {
      ok: false,
      status: 0,
      error: { code: "network_error", message: "The server could not be reached." },
      retryAfterSeconds: null,
    };
  }

  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"));
  const data: unknown = await response.json().catch(() => null);

  if (response.ok && isRecord(data) && data.ok === true) {
    return { ...(data as ApiRoutes[P]["success"]), status: response.status };
  }
  if (isRecord(data) && data.ok === false && isRecord(data.error) && typeof data.error.code === "string") {
    const error = data.error as ApiFailure<ApiRoutes[P]["errorCode"]>["error"];
    return { ok: false, status: response.status, error, retryAfterSeconds };
  }
  return {
    ok: false,
    status: response.status,
    error: { code: "unexpected_response", message: "Unexpected response from the server." },
    retryAfterSeconds,
  };
}
