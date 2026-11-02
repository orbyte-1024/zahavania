import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTtlCache, hashKey, normalizeText } from "../lib/cache.ts";
import {
  demoFallbackMode,
  isDemoRecording,
  readDemoRecording,
  writeDemoRecording,
} from "../lib/demo/replay.ts";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("cache returns values until they expire", async () => {
  const cache = createTtlCache({ ttlMs: 20, maxEntries: 10 });
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);
  await sleep(30);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size(), 0);
});

test("cache evicts the oldest entry and can be disabled", () => {
  const cache = createTtlCache({ ttlMs: 60_000, maxEntries: 2 });
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), 3);

  const disabled = createTtlCache({ ttlMs: 0, maxEntries: 10 });
  disabled.set("a", 1);
  assert.equal(disabled.get("a"), undefined);
});

test("cache keys are per user and ignore case and spacing", () => {
  const input = normalizeText("  Le prix du RIZ\n a doublé ");
  assert.equal(input, "le prix du riz a doublé");
  assert.equal(hashKey(["verify", "user-a", input]), hashKey(["verify", "user-a", normalizeText("le prix du riz a doublé")]));
  assert.notEqual(hashKey(["verify", "user-a", input]), hashKey(["verify", "user-b", input]));
  assert.match(hashKey(["x"]), /^[a-f0-9]{64}$/);
});

test("demo recordings round-trip and reject bad files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "checkeko-demo-"));
  try {
    const key = hashKey(["verify-text", "scenario"]);
    assert.equal(await readDemoRecording("verify-text", key, dir), null);

    await writeDemoRecording("verify-text", key, { result: { globalIndex: 80 } }, dir);
    const recording = await readDemoRecording("verify-text", key, dir);
    assert.equal(recording.route, "verify-text");
    assert.deepEqual(recording.payload, { result: { globalIndex: 80 } });
    assert.ok(!Number.isNaN(Date.parse(recording.recordedAt)));
    assert.deepEqual(await readdir(dir), [`verify-text-${key}.json`]);

    assert.equal(await readDemoRecording("sources-suggest", key, dir), null);
    await writeFile(path.join(dir, `sources-suggest-${key}.json`), "{ not json", "utf8");
    assert.equal(await readDemoRecording("sources-suggest", key, dir), null);
    assert.equal(await readDemoRecording("verify-text", "../../etc/passwd", dir), null);
    await assert.rejects(writeDemoRecording("verify-text", "../escape", {}, dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("demo modes are opt-in and recording is disabled in production", async () => {
  await withEnv({ DEMO_FALLBACK: "", DEMO_RECORD: "true", NODE_ENV: "development" }, () => {
    assert.equal(demoFallbackMode(), "off");
    assert.equal(isDemoRecording(), true);
  });
  await withEnv({ DEMO_FALLBACK: "always", DEMO_RECORD: "true", NODE_ENV: "production" }, () => {
    assert.equal(demoFallbackMode(), "always");
    assert.equal(isDemoRecording(), false);
  });
  await withEnv({ DEMO_FALLBACK: "yes" }, () => assert.equal(demoFallbackMode(), "off"));
});
