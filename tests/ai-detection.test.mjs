import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

Object.assign(process.env, { USE_MOCK: "false", SIGHTENGINE_API_USER: "user-test", SIGHTENGINE_API_SECRET: "secret-test" });

const calls = [];
let respond = () => success(0.12);

function success(score) {
  return new Response(JSON.stringify({ status: "success", request: { id: "req_1", operations: 1 }, type: { ai_generated: score } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), form: init.body });
  return respond();
};

const { aiSignalLevel, detectionFromScore, toAiIndex } = await import("../lib/ai-detection.ts");
const { detectAiGeneration, AI_DETECTION_WARNING_CODE } = await import("../lib/sightengine.ts");
const { buildVerification } = await import("../lib/verification-summary.ts");

async function photoWithGps() {
  const jpeg = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 90, g: 60, b: 40 } } })
    .jpeg()
    .withExif({ IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "18/1 54/1 0/1" } })
    .toBuffer();
  return new Uint8Array(jpeg);
}

const links = { googleLens: { name: "Google Lens", url: "https://lens.google.com/" }, tineye: { name: "TinEye", url: "https://tineye.com/" } };

test("the detector score becomes a 0-100 index with explicit bands", () => {
  assert.equal(toAiIndex(0), 0);
  assert.equal(toAiIndex(0.004), 0);
  assert.equal(toAiIndex(0.875), 88);
  assert.equal(toAiIndex(1.4), 100);
  assert.equal(toAiIndex(-0.2), 0);
  assert.throws(() => toAiIndex(Number.NaN));
  assert.equal(aiSignalLevel(29), "low");
  assert.equal(aiSignalLevel(30), "uncertain");
  assert.equal(aiSignalLevel(69), "uncertain");
  assert.equal(aiSignalLevel(70), "high");
  const detection = detectionFromScore(0.91, new Date("2026-11-03T10:00:00Z"));
  assert.deepEqual(detection, { status: "ok", index: 91, level: "high", provider: "Sightengine", checkedAt: "2026-11-03T10:00:00.000Z" });
});

test("a successful check sends a reduced JPEG without metadata and the genai model", async () => {
  calls.length = 0;
  respond = () => success(0.83);
  const outcome = await detectAiGeneration(await photoWithGps(), "en");
  assert.equal(outcome.detection.status, "ok");
  assert.equal(outcome.detection.index, 83);
  assert.equal(outcome.detection.level, "high");
  assert.deepEqual(outcome.warnings, []);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.sightengine.com/1.0/check.json");
  const form = calls[0].form;
  assert.equal(form.get("models"), "genai");
  assert.equal(form.get("api_user"), "user-test");
  const sent = Buffer.from(await form.get("media").arrayBuffer());
  const meta = await sharp(sent).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok(Math.max(meta.width, meta.height) <= 1600);
  assert.equal(meta.exif, undefined);
});

test("provider errors, refusals and malformed answers never produce an index", async () => {
  const cases = [
    () => new Response("{}", { status: 429 }),
    () => new Response(JSON.stringify({ status: "failure", error: { type: "usage_limit", message: "limit" } }), { status: 200 }),
    () => new Response(JSON.stringify({ status: "success", type: { ai_generated: 7 } }), { status: 200 }),
    () => new Response("not json", { status: 200 }),
    () => {
      throw new TypeError("network down");
    },
  ];
  for (const failure of cases) {
    respond = failure;
    const outcome = await detectAiGeneration(await photoWithGps(), "fr");
    assert.deepEqual(outcome.detection, { status: "unavailable", reason: "failed" });
    assert.equal(outcome.warnings[0].code, AI_DETECTION_WARNING_CODE);
    assert.doesNotMatch(outcome.warnings[0].message, /secret|429|limit/i);
  }
});

test("without credentials the detector is not called and says it is not configured", async () => {
  calls.length = 0;
  const saved = process.env.SIGHTENGINE_API_SECRET;
  delete process.env.SIGHTENGINE_API_SECRET;
  try {
    const outcome = await detectAiGeneration(await photoWithGps(), "mg");
    assert.deepEqual(outcome.detection, { status: "unavailable", reason: "not_configured" });
    assert.deepEqual(outcome.warnings, []);
    assert.equal(calls.length, 0);
  } finally {
    process.env.SIGHTENGINE_API_SECRET = saved;
  }
});

test("a high index stays a hint: the image status remains inconclusive and the limits are stated", () => {
  const report = buildVerification(null, [], null, [], links, detectionFromScore(0.99));
  assert.equal(report.status, "non concluant");
  assert.equal(report.contradictoryEvidence.length, 0);
  assert.match(report.summary, /indice 99\/100, signal élevé/);
  assert.ok(report.limitations.some((l) => /pas une probabilité/.test(l)));
  assert.ok(report.limitations.some((l) => /ne prouve pas que l'image est authentique/.test(l)));

  const down = buildVerification(null, [], null, [], links, { status: "unavailable", reason: "failed" });
  assert.equal(down.status, "non concluant");
  assert.doesNotMatch(down.summary, /\/100/);
  assert.ok(down.limitations.some((l) => /indisponible/.test(l)));
});
