import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export type AuthResult =
  | { ok: true; userId: string; demo: boolean }
  | { ok: false; reason: "missing_session" | "invalid_session" | "config_missing" };

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export async function authenticate(req: NextRequest): Promise<AuthResult> {
  if (isDemoMode()) return { ok: true, userId: "demo-user", demo: true };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { ok: false, reason: "config_missing" };

  const token = getBearerToken(req);
  const hasSessionCookie = req.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-"));
  if (!token && !hasSessionCookie) return { ok: false, reason: "missing_session" };

  const supabase = token
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : createServerClient(url, anonKey, {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: () => {},
        },
      });

  const { data, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, reason: "invalid_session" };
  return { ok: true, userId: data.user.id, demo: false };
}
