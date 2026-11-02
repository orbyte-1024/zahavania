import "server-only";
import { createHash } from "node:crypto";

export type TtlCache<T> = {
  get: (key: string) => T | undefined;
  set: (key: string, value: T) => void;
  size: () => number;
};

export function createTtlCache<T>(options: { ttlMs: number; maxEntries: number }): TtlCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();

  function purgeExpired(now: number) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
  }

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (options.ttlMs <= 0 || options.maxEntries <= 0) return;
      const now = Date.now();
      purgeExpired(now);
      entries.delete(key);
      while (entries.size >= options.maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: now + options.ttlMs });
    },
    size() {
      purgeExpired(Date.now());
      return entries.size;
    },
  };
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function hashKey(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
