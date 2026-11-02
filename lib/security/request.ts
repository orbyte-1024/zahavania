import "server-only";
import { NextResponse, type NextRequest } from "next/server";

export const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...SECURITY_HEADERS, ...headers } });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
) {
  return jsonResponse({ ok: false, error: { code, message } }, status, headers);
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function startTimer(): () => number {
  const startedAt = performance.now();
  return () => Math.round(performance.now() - startedAt);
}

export type JsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: 400 | 413 | 415 };

export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<JsonBodyResult> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return { ok: false, status: 415 };

  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400 };
  }
}
