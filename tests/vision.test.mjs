import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

Object.assign(process.env, {
  LLM_API_KEY: "test-key",
  LLM_BASE_URL: "https://provider.test/api/v1",
  AI_MODEL: "base/model",
  AI_MODEL_VISION: "vision/model",
  USE_MOCK: "false",
});
delete process.env.AI_FALLBACK_MODEL;

const requests = [];
let respond = () => ok({});

function ok(content) {
  return new Response(
    JSON.stringify({
      id: "c",
      object: "chat.completion",
      created: 0,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(content) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  return respond(body);
};

const { analyzeImage, prepareForVision, toDataUrl, VISION_MAX_EDGE } = await import("../lib/vision-analyzer.ts");

const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeStrict(dataUrl) {
  const match = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl);
  assert.ok(match, "not a JPEG data URL");
  const payload = match[1];
  assert.match(payload, STRICT_BASE64);
  assert.equal(payload.length % 4, 0);
  const bytes = Buffer.from(payload, "base64");
  assert.equal(bytes.toString("base64"), payload);
  return bytes;
}

async function phonePhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

const analysis = {
  description: { text: "Une rue animée", confidence: "medium" },
  visualInconsistencies: [],
  possibleAIGenerationIndicators: null,
  locationClues: [{ text: "Architecture des hautes terres", confidence: "low" }],
  limitations: { text: "Image compressée", confidence: "low" },
};

test("phone photos are rotated, resized to the max edge and stripped of metadata", async () => {
  const prepared = await prepareForVision(new Uint8Array(await phonePhoto()));
  const meta = await sharp(Buffer.from(prepared)).metadata();
  assert.equal(meta.format, "jpeg");
  assert.ok(Math.max(meta.width, meta.height) <= VISION_MAX_EDGE);
  assert.ok(meta.height > meta.width, "EXIF orientation 6 must be applied before re-encoding");
  assert.equal(meta.orientation, undefined);
  assert.equal(meta.exif, undefined);
});

test("the data URL keeps its padding and decodes with a strict base64 decoder", async () => {
  for (const length of [1, 2, 3, 4, 5, 1000, 1001]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 37) % 256);
    const url = toDataUrl(bytes, "image/jpeg");
    assert.deepEqual(new Uint8Array(decodeStrict(url)), bytes);
  }
});

test("the real code path sends the vision model a valid image and the UI language", async () => {
  requests.length = 0;
  respond = () => ok(analysis);
  const result = await analyzeImage(new Uint8Array(await phonePhoto()), "image/jpeg", "mg");

  assert.equal(requests.length, 1);
  const body = requests[0];
  assert.equal(body.model, "vision/model");
  assert.deepEqual(body.response_format, { type: "json_object" });
  const [textPart, imagePart] = body.messages[1].content;
  assert.match(textPart.text, /Output language: Malagasy/);
  const sent = decodeStrict(imagePart.image_url.url);
  const sentMeta = await sharp(sent).metadata();
  assert.equal(sentMeta.format, "jpeg");
  assert.ok(Math.max(sentMeta.width, sentMeta.height) <= VISION_MAX_EDGE);

  assert.equal(result.warnings.length, 0);
  assert.equal(result.analysis.description.text, "Une rue animée");
  assert.deepEqual(result.analysis.possibleAIGenerationIndicators, []);
});

test("a provider failure degrades with a localized warning and logs only code and status", async () => {
  respond = () =>
    new Response(JSON.stringify({ error: { message: "upstream refused" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const result = await analyzeImage(new Uint8Array(await phonePhoto()), "image/jpeg", "en");
    assert.equal(result.analysis, null);
    assert.match(result.warnings[0].message, /temporarily unavailable/);
  } finally {
    console.error = original;
  }
  const line = logs.find((l) => l.includes('"scope":"vision"'));
  assert.ok(line);
  const parsed = JSON.parse(line);
  assert.equal(parsed.providerStatus, 500);
  assert.ok(!line.includes("base64") && !line.includes("upstream refused"));
});

test("undecodable bytes never reach the provider", async () => {
  requests.length = 0;
  const result = await analyzeImage(new TextEncoder().encode("not an image"), "image/jpeg", "fr");
  assert.equal(result.analysis, null);
  assert.equal(requests.length, 0);
});
