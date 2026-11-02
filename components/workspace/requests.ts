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

export type LegacyResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string | null; retryAfter: number | null };

export async function callLegacy<T>(path: string, init: RequestInit): Promise<LegacyResult<T>> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    return { ok: false, code: "network_error", message: null, retryAfter: null };
  }
  const retry = Number(response.headers.get("Retry-After"));
  const retryAfter = Number.isFinite(retry) && retry > 0 ? retry : null;
  const data: unknown = await response.json().catch(() => null);
  if (response.ok && typeof data === "object" && data !== null && (data as { ok?: unknown }).ok === true) {
    return { ok: true, data: data as T };
  }
  if (response.status === 429) return { ok: false, code: "rate_limited", message: null, retryAfter };
  const message = typeof data === "object" && data !== null && typeof (data as { erreur?: unknown }).erreur === "string" ? (data as { erreur: string }).erreur : null;
  return { ok: false, code: "request_failed", message, retryAfter };
}

export const CLAIMS_HANDOFF_KEY = "checkeko:claims";
