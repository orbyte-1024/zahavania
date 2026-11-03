import test from "node:test";
import assert from "node:assert/strict";

const { DOSSIERS_KEY, LEGACY_DOSSIERS_KEY, migrateLegacyDossiers, reportToText } = await import("../lib/dossiers.ts");
const { BRAND_NAME, BRAND_NAME_UPPER, BRAND_SLUG } = await import("../lib/brand.ts");

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("the brand is defined once with a straight apostrophe", () => {
  assert.equal(BRAND_NAME, "Zahavan'ia");
  assert.equal(BRAND_NAME_UPPER, "ZAHAVAN'IA");
  assert.equal(BRAND_SLUG, "zahavania");
  assert.equal(DOSSIERS_KEY, "zahavania:dossiers:v1");
});

test("saved dossiers move from the old key to the new one, once", () => {
  const store = memoryStorage({ [LEGACY_DOSSIERS_KEY]: '[{"id":"a"}]' });
  migrateLegacyDossiers(store);
  assert.equal(store.getItem(DOSSIERS_KEY), '[{"id":"a"}]');
  assert.equal(store.getItem(LEGACY_DOSSIERS_KEY), null);
  migrateLegacyDossiers(store);
  assert.equal(store.getItem(DOSSIERS_KEY), '[{"id":"a"}]');
});

test("dossiers already under the new key are never overwritten by the old ones", () => {
  const store = memoryStorage({ [LEGACY_DOSSIERS_KEY]: '[{"id":"old"}]', [DOSSIERS_KEY]: '[{"id":"new"}]' });
  migrateLegacyDossiers(store);
  assert.equal(store.getItem(DOSSIERS_KEY), '[{"id":"new"}]');
  assert.equal(store.getItem(LEGACY_DOSSIERS_KEY), null);
});

test("migration is a no-op without storage, without old data, or when storage throws", () => {
  migrateLegacyDossiers(null);
  const empty = memoryStorage();
  migrateLegacyDossiers(empty);
  assert.equal(empty.data.size, 0);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => {}, removeItem: () => {} };
  assert.doesNotThrow(() => migrateLegacyDossiers(broken));
});

test("exported dossiers carry the new name", () => {
  const text = reportToText(
    { id: "a", savedAt: "2026-11-03T10:00:00.000Z", title: "t", mode: "text", mock: false, decisions: {}, meta: { analyzedUrl: null }, result: { summary: "s", globalIndex: 40, claims: [], limitations: [] } },
    { status: (s) => s, decision: (d) => d, globalIndex: "Index", sources: "Sources", limitations: "Limits", savedOn: "Saved on" },
  );
  assert.match(text, /^ZAHAVAN'IA — Saved on 2026-11-03/);
});
