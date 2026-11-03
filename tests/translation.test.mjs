import test from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  LLM_API_KEY: "test-key",
  LLM_BASE_URL: "https://provider.test/api/v1",
  AI_MODEL: "base/model",
  AI_MODEL_TRANSLATE: "translate/model",
  USE_MOCK: "false",
});
delete process.env.AI_FALLBACK_MODEL;

const requests = [];
let replies = [];

function completion(content) {
  return new Response(
    JSON.stringify({
      id: "c",
      object: "chat.completion",
      created: 0,
      model: "x",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  requests.push(body);
  const next = replies.shift();
  return completion(typeof next === "function" ? next(body) : next);
};

const checks = await import("../lib/translation-checks.ts");
const { translateText } = await import("../lib/ai/translate.ts");

const FR = "Le Président de la République a reçu les députés de l'Assemblée nationale à Iavoloha pour discuter du budget de la commune.";
const MG = "Nandray ny solombavambahoaka avy amin'ny Antenimierampirenena tao Iavoloha ny Filohan'ny Repoblika mba hiresaka momba ny tetibola.";
const EN = "The President of the Republic received the members of the National Assembly at Iavoloha to discuss the budget of the commune.";

test("the stopword detector recognises Malagasy, French and English", () => {
  assert.equal(checks.detectLanguage(FR), "fr");
  assert.equal(checks.detectLanguage(MG), "mg");
  assert.equal(checks.detectLanguage(EN), "en");
  assert.equal(checks.detectLanguage("INSTAT CENI JIRAMA 2024"), null);
  assert.equal(checks.detectLanguage("Ny vola tamin’ny taona 2025 sy ny tetibola dia efa nivoaka"), "mg");
});

test("an unchanged or wrong-language output is rejected, short or name-only text is not judged", () => {
  assert.equal(checks.isUnchangedTranslation(`  ${FR.toUpperCase()} `, FR), true);
  assert.equal(checks.acceptTranslation(FR, FR, "mg"), false);
  assert.equal(checks.acceptTranslation(FR, MG, "en"), false);
  assert.equal(checks.acceptTranslation(MG, FR, "mg"), true);
  assert.equal(checks.acceptTranslation("INSTAT", "INSTAT", "mg"), true);
  assert.equal(checks.acceptTranslation("CENI JIRAMA INSTAT BFM ONE", "CENI JIRAMA INSTAT BFM ONE x", "fr"), true);
});

test("needsReview is set when Malagasy is the source or the target", () => {
  assert.equal(checks.needsReview("mg", "fr"), true);
  assert.equal(checks.needsReview("en", "mg"), true);
  assert.equal(checks.needsReview("fr", "en"), false);
});

test("long texts are split by paragraph without losing or reordering anything", () => {
  const paragraphs = Array.from({ length: 8 }, (_, i) => `Paragraphe ${i}. ${"mot ".repeat(90).trim()}.`);
  const chunks = checks.splitIntoChunks(paragraphs.join("\n\n"), 1_000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_000));
  assert.deepEqual(chunks.join("\n\n").split("\n\n"), paragraphs);
  assert.deepEqual(checks.splitIntoChunks("Court.\n\n\n\nAutre."), ["Court.\n\nAutre."]);
});

test("a paragraph longer than a chunk is cut at sentence ends", () => {
  const long = Array.from({ length: 30 }, (_, i) => `Phrase numéro ${i} avec quelques mots de plus.`).join(" ");
  const chunks = checks.splitIntoChunks(long, 300);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 300 && /\.$/.test(chunk)));
  assert.equal(chunks.join(" "), long);
});

test("translation runs as plain text with the glossary and the official Malagasy register", async () => {
  requests.length = 0;
  replies = [MG];
  const result = await translateText({ sourceLang: "fr", targetLang: "mg", text: FR });
  assert.equal(result.translatedText, MG);
  assert.equal(result.needsReview, true);
  assert.equal(requests.length, 1);
  const body = requests[0];
  assert.equal(body.model, "translate/model");
  assert.equal(body.response_format, undefined);
  const user = body.messages[1].content;
  assert.match(user, /Assemblée nationale → Antenimierampirenena/);
  assert.match(user, /Banque centrale de Madagascar → Banky Foiben'i Madagasikara/);
  assert.match(user, /official written Malagasy/);
});

test("an output identical to the input is retried once, then reported as an error", async () => {
  requests.length = 0;
  replies = [FR, FR];
  await assert.rejects(translateText({ sourceLang: "fr", targetLang: "en", text: FR }), (error) => error.code === "invalid_output");
  assert.equal(requests.length, 2);
});

test("a wrong-language output is retried and the second answer is kept", async () => {
  requests.length = 0;
  replies = [FR, EN];
  const result = await translateText({ sourceLang: "fr", targetLang: "en", text: FR });
  assert.equal(result.translatedText, EN);
  assert.equal(result.needsReview, false);
  assert.equal(requests.length, 2);
});

test("each paragraph chunk is translated separately and joined back in order", async () => {
  requests.length = 0;
  const paragraphs = Array.from({ length: 6 }, (_, i) => `${FR} (${i}) ${"Le budget de la commune est en hausse. ".repeat(8)}`);
  replies = paragraphs.map(() => (body) => {
    const index = /\((\d)\)/.exec(body.messages[1].content)?.[1];
    return `${EN} [${index}]`;
  });
  const result = await translateText({ sourceLang: "fr", targetLang: "en", text: paragraphs.join("\n\n") });
  assert.ok(requests.length > 1);
  const order = [...result.translatedText.matchAll(/\[(\d)\]/g)].map((m) => m[1]);
  assert.deepEqual(order, [...new Set(order)].sort());
  assert.equal(result.usage.totalTokens, 15 * requests.length);
});
