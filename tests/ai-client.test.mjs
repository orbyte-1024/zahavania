import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";

Object.assign(process.env, {
  LLM_API_KEY: "test-key",
  LLM_BASE_URL: "https://provider.test/api/v1",
  AI_MODEL: "base/model",
  AI_MODEL_VERIFY: "verify/model",
  AI_MODEL_VISION: "vision/model",
  AI_FALLBACK_MODEL: "fallback/model",
  AI_REASONING_TOKENS: "2000",
  USE_MOCK: "false",
});

const requests = [];
let respond = () => reply({ ok: true });

function reply(content, { status = 200, finish = "stop" } = {}) {
  if (status !== 200) {
    return new Response(JSON.stringify({ error: { message: "provider refused", code: status } }), {
      status,
      headers: { "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      id: "cmpl-test",
      object: "chat.completion",
      created: 0,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) }, finish_reason: finish }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push({ url: String(url), body });
  return respond(body, requests.length);
};

const { AiError, askJson, askText, buildChatParams } = await import("../lib/ai/client.ts");

const schema = z.object({ ok: z.boolean() });

test("json requests carry JSON mode, reasoning headroom and the image parts untouched", () => {
  const dataUrl = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
  const params = buildChatParams(
    {
      task: "vision",
      system: "sys",
      user: [
        { type: "text", text: "Describe" },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
      maxTokens: 1000,
    },
    "vision/model",
    "json",
  );
  assert.equal(params.model, "vision/model");
  assert.deepEqual(params.response_format, { type: "json_object" });
  assert.equal(params.max_tokens, 3000);
  assert.deepEqual(params.reasoning, { effort: "low", exclude: true });
  assert.deepEqual(params.messages[1].content, [
    { type: "text", text: "Describe" },
    { type: "image_url", image_url: { url: dataUrl, detail: "auto" } },
  ]);
});

test("text requests have no JSON mode and web search is opt-in", () => {
  const text = buildChatParams({ task: "translate", system: "s", user: "u" }, "m", "text");
  assert.equal(text.response_format, undefined);
  assert.equal(text.plugins, undefined);
  const web = buildChatParams({ task: "verify", system: "s", user: "u", webSearch: { maxResults: 4 } }, "m", "json");
  assert.deepEqual(web.plugins, [{ id: "web", max_results: 4 }]);
});

test("askJson sends the task's model and returns validated data", async () => {
  requests.length = 0;
  respond = () => reply({ ok: true });
  const result = await askJson({ task: "verify", system: "s", user: "u", schema });
  assert.deepEqual(result.data, { ok: true });
  assert.equal(result.model, "verify/model");
  assert.equal(requests[0].body.model, "verify/model");
  assert.match(requests[0].url, /^https:\/\/provider\.test\/api\/v1\/chat\/completions/);
});

test("a task without its own variable uses AI_MODEL", async () => {
  requests.length = 0;
  respond = () => reply({ ok: true });
  const result = await askJson({ task: "angles", system: "s", user: "u", schema });
  assert.equal(result.model, "base/model");
});

test("a provider error switches to the shared fallback for that task", async () => {
  requests.length = 0;
  respond = (body) => (body.model === "verify/model" ? reply(null, { status: 400 }) : reply({ ok: true }));
  const result = await askJson({ task: "verify", system: "s", user: "u", schema, outputRetries: 1 });
  assert.equal(result.model, "fallback/model");
  assert.deepEqual(requests.map((r) => r.body.model), ["verify/model", "fallback/model"]);
  assert.equal(result.attempts, 3);
});

test("invalid output is retried once, then falls back", async () => {
  requests.length = 0;
  respond = (body) => (body.model === "verify/model" ? reply({ wrong: 1 }) : reply({ ok: false }));
  const result = await askJson({ task: "verify", system: "s", user: "u", schema });
  assert.deepEqual(requests.map((r) => r.body.model), ["verify/model", "verify/model", "fallback/model"]);
  assert.deepEqual(result.data, { ok: false });
});

test("errors keep the provider status when no fallback can help", async () => {
  delete process.env.AI_FALLBACK_MODEL;
  respond = () => reply(null, { status: 402 });
  await assert.rejects(askJson({ task: "verify", system: "s", user: "u", schema }), (error) => {
    assert.ok(error instanceof AiError);
    assert.equal(error.code, "provider_error");
    assert.equal(error.providerStatus, 402);
    return true;
  });
  process.env.AI_FALLBACK_MODEL = "fallback/model";
});

test("askText returns plain text, retries rejected output and never wraps it in JSON", async () => {
  requests.length = 0;
  let call = 0;
  respond = () => reply(call++ === 0 ? "Bonjour" : "Manao ahoana");
  const result = await askText({ task: "translate", system: "s", user: "Bonjour", accept: (text) => text !== "Bonjour" });
  assert.equal(result.text, "Manao ahoana");
  assert.equal(result.attempts, 2);
  assert.equal(requests[0].body.response_format, undefined);
});

test("askText treats empty and truncated answers as invalid output", async () => {
  delete process.env.AI_FALLBACK_MODEL;
  respond = () => reply("   ");
  await assert.rejects(askText({ task: "translate", system: "s", user: "u", outputRetries: 0 }), /empty text/);
  respond = () => reply("partial", { finish: "length" });
  await assert.rejects(askText({ task: "translate", system: "s", user: "u", outputRetries: 0 }), /truncated/);
  process.env.AI_FALLBACK_MODEL = "fallback/model";
});

test("a missing model fails clearly before any request", async () => {
  const saved = process.env.AI_MODEL;
  delete process.env.AI_MODEL;
  requests.length = 0;
  await assert.rejects(askJson({ task: "experts", system: "s", user: "u", schema }), (error) => error.code === "config_missing");
  assert.equal(requests.length, 0);
  process.env.AI_MODEL = saved;
});
