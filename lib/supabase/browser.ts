import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SESSION_TIMEOUT_MS = 8000;

let client: SupabaseClient | null = null;
let pending: Promise<string | undefined> | null = null;

function browserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  client ??= createBrowserClient(url, anonKey);
  return client;
}

async function resolveToken(): Promise<string | undefined> {
  const supabase = browserClient();
  if (!supabase) return undefined;

  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;

  const { data: signedIn, error } = await supabase.auth.signInAnonymously();
  if (error) return undefined;
  return signedIn.session?.access_token;
}

function withTimeout(promise: Promise<string | undefined>): Promise<string | undefined> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), SESSION_TIMEOUT_MS);
    promise
      .then(resolve, () => resolve(undefined))
      .finally(() => clearTimeout(timer));
  });
}

export function getAccessToken(): Promise<string | undefined> {
  pending ??= withTimeout(resolveToken()).finally(() => {
    pending = null;
  });
  return pending;
}
