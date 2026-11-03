import { postApi, type ApiPath, type ApiResult, type ApiRoutes } from "@/lib/api/fetcher";
import { getAccessToken } from "@/lib/supabase/browser";

export type Phase<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: T }
  | { kind: "error"; code: string; retryAfter: number | null };

export async function callApi<P extends ApiPath>(path: P, body: ApiRoutes[P]["request"]): Promise<ApiResult<P>> {
  const accessToken = await getAccessToken();
  return postApi(path, body, { accessToken });
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; code: string; retryAfter: number | null };

export async function callForm<T>(path: string, form: FormData): Promise<FormResult<T>> {
  const accessToken = await getAccessToken();
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", body: form, headers, credentials: "same-origin" });
  } catch {
    return { ok: false, code: "network_error", retryAfter: null };
  }
  const retry = Number(response.headers.get("Retry-After"));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  const data: unknown = await response.json().catch(() => null);
  const record = typeof data === "object" && data !== null ? (data as { ok?: unknown; error?: { code?: unknown } }) : null;
  if (response.ok && record?.ok === true) return { ok: true, data: data as T };
  if (record?.ok === false && typeof record.error?.code === "string") return { ok: false, code: record.error.code, retryAfter };
  if (response.status === 429) return { ok: false, code: "rate_limited", retryAfter };
  return { ok: false, code: response.ok ? "unexpected_response" : "request_failed", retryAfter };
}

export const CLAIMS_HANDOFF_KEY = "zahavania:claims";
