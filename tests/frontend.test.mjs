import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clamp, easeInOut, easeOut, mix, pinnedProgress, relayOpacity, seededRandom, seg } from "../lib/motion/scroll.ts";
import { LIVE_MODULES, MODULE_IDS, modulePath } from "../lib/modules.ts";

const load = (locale) => JSON.parse(readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));

function keys(value, prefix = "") {
  if (Array.isArray(value)) return [`${prefix}[${value.length}]`, ...value.flatMap((item, i) => keys(item, `${prefix}[${i}]`))];
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

test("scroll helpers clamp, mix and segment progress", () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(mix(10, 20, 0.5), 15);
  assert.equal(seg(0.5, 0.4, 0.6), 0.5);
  assert.equal(seg(0.1, 0.4, 0.6), 0);
  assert.equal(seg(0.9, 0.4, 0.6), 1);
  assert.equal(easeOut(1), 1);
  assert.equal(easeInOut(0), 0);
  assert.equal(easeInOut(1), 1);
});

test("pinned progress follows the sticky section", () => {
  assert.equal(pinnedProgress(0, 500, 100), 0);
  assert.equal(pinnedProgress(-200, 500, 100), 0.5);
  assert.equal(pinnedProgress(-900, 500, 100), 1);
  assert.equal(pinnedProgress(50, 100, 100), 0);
});

test("step relay never shows two steps fully and never leaves a gap", () => {
  assert.equal(relayOpacity(0), 1);
  assert.equal(relayOpacity(0.5), 0);
  assert.equal(relayOpacity(-1), 0);
  for (let cont = 0; cont <= 2; cont += 0.05) {
    const visible = [0, 1, 2].map((i) => relayOpacity(cont - i));
    assert.ok(visible.filter((v) => v > 0.99).length <= 1, `two full steps at ${cont}`);
    assert.ok(visible.reduce((sum, v) => sum + v, 0) >= 0.24, `gap at ${cont}`);
  }
});

test("seeded random is deterministic", () => {
  const a = seededRandom(7);
  const b = seededRandom(7);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.ok(first.every((v) => v >= 0 && v < 1));
});

test("every locale has exactly the same message keys", () => {
  const fr = keys(load("fr")).sort();
  for (const locale of ["mg", "en"]) {
    assert.deepEqual(keys(load(locale)).sort(), fr, `${locale} differs from fr`);
  }
});

test("message keys never contain dots, which next-intl rejects", () => {
  const check = (value, path) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of Object.entries(value)) {
        const isStatusLabel = path === "image.verdict";
        assert.ok(isStatusLabel || !k.includes("."), `dot in key ${path}.${k}`);
        check(v, path ? `${path}.${k}` : k);
      }
    }
  };
  for (const locale of ["fr", "mg", "en"]) check(load(locale), "");
});

test("every module has messages and a route", () => {
  const fr = load("fr");
  for (const id of MODULE_IDS) {
    assert.ok(fr.modules[id]?.name, `missing name for ${id}`);
    assert.equal(modulePath(id), `/app/${id}`);
  }
  assert.ok([...LIVE_MODULES].every((id) => MODULE_IDS.includes(id)));
});
