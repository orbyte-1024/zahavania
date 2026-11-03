export type ModelFailure = { code: string; providerStatus: number | null; message: string };

const FREE_POOL = "*:free";
const SHARED_FREE_QUOTA = /free-models-per-day/i;
const ACCOUNT_QUOTA = /usage limit|quota|credits/i;

export const COOLDOWN_MS = {
  timeout: 60_000,
  rateLimited: 30_000,
  serverError: 60_000,
  network: 30_000,
  notFound: 5 * 60_000,
  freeQuota: 15 * 60_000,
  accountQuota: 15 * 60_000,
} as const;

const cooldowns = new Map<string, number>();

export function isFreeModel(model: string): boolean {
  return model.endsWith(":free");
}

export function isSharedFreeQuota(failure: ModelFailure): boolean {
  return failure.code === "rate_limited" && SHARED_FREE_QUOTA.test(failure.message);
}

export function cooldownFor(failure: ModelFailure): number | null {
  if (isSharedFreeQuota(failure)) return COOLDOWN_MS.freeQuota;
  if (failure.code === "timeout") return COOLDOWN_MS.timeout;
  if (failure.code === "rate_limited") return ACCOUNT_QUOTA.test(failure.message) ? COOLDOWN_MS.accountQuota : COOLDOWN_MS.rateLimited;
  if (failure.code !== "provider_error") return null;
  if (failure.providerStatus === 402) return COOLDOWN_MS.accountQuota;
  if (failure.providerStatus === null) return COOLDOWN_MS.network;
  if (failure.providerStatus === 404) return COOLDOWN_MS.notFound;
  if (failure.providerStatus >= 500) return COOLDOWN_MS.serverError;
  return null;
}

export function isCoolingDown(model: string, now = Date.now()): boolean {
  const own = cooldowns.get(model) ?? 0;
  const pool = isFreeModel(model) ? (cooldowns.get(FREE_POOL) ?? 0) : 0;
  return Math.max(own, pool) > now;
}

export function recordFailure(model: string, failure: ModelFailure, now = Date.now()): number | null {
  const ms = cooldownFor(failure);
  if (ms === null) return null;
  cooldowns.set(isSharedFreeQuota(failure) ? FREE_POOL : model, now + ms);
  return ms;
}

export function recordSuccess(model: string): void {
  cooldowns.delete(model);
}

export function orderCandidates(models: readonly string[], now = Date.now()): string[] {
  const unique = [...new Set(models)];
  const available = unique.filter((model) => !isCoolingDown(model, now));
  return available.length > 0 ? available : unique.slice(0, 1);
}

export function resetCooldowns(): void {
  cooldowns.clear();
}
