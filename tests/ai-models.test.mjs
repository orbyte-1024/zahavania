import test from "node:test";
import assert from "node:assert/strict";
import { AI_TASKS, TASK_MODEL_ENV, isAiTask, resolveFallback, resolveFallbacks, resolveModel } from "../lib/ai/models.ts";

test("each task uses its own model when its variable is set", () => {
  const env = {
    AI_MODEL: "base/model",
    AI_MODEL_VERIFY: "google/gemini-3.5-flash",
    AI_MODEL_VISION: "google/gemini-3.5-flash-lite",
  };
  assert.equal(resolveModel("verify", env), "google/gemini-3.5-flash");
  assert.equal(resolveModel("vision", env), "google/gemini-3.5-flash-lite");
});

test("tasks without their own variable fall back to AI_MODEL", () => {
  const env = { AI_MODEL: "base/model", AI_MODEL_VERIFY: "verify/model" };
  for (const task of ["translate", "experts", "angles"]) assert.equal(resolveModel(task, env), "base/model");
});

test("blank values are ignored and no model at all resolves to null", () => {
  assert.equal(resolveModel("angles", { AI_MODEL: "base/model", AI_MODEL_ANGLES: "   " }), "base/model");
  assert.equal(resolveModel("angles", {}), null);
  assert.equal(resolveModel("angles", { AI_MODEL: "" }), null);
});

test("the shared fallback is used per task unless it equals that task's model", () => {
  const env = { AI_MODEL: "base/model", AI_MODEL_VERIFY: "free/model:free", AI_FALLBACK_MODEL: "free/model:free" };
  assert.equal(resolveFallback("verify", env), null);
  assert.equal(resolveFallback("translate", env), "free/model:free");
  assert.equal(resolveFallback("translate", { AI_MODEL: "base/model" }), null);
});

test("every task has a distinct environment variable", () => {
  const names = AI_TASKS.map((task) => TASK_MODEL_ENV[task]);
  assert.equal(new Set(names).size, AI_TASKS.length);
  assert.ok(names.every((name) => /^AI_MODEL_[A-Z]+$/.test(name)));
  assert.equal(isAiTask("vision"), true);
  assert.equal(isAiTask("chat"), false);
});

test("the fallback list keeps its order, drops blanks, duplicates and the task's own model", () => {
  const env = { AI_MODEL: "base/model", AI_FALLBACK_MODELS: " b/one , ,base/model, c/two,b/one", AI_FALLBACK_MODEL: "d/three" };
  assert.deepEqual(resolveFallbacks("verify", env), ["b/one", "c/two", "d/three"]);
  assert.deepEqual(resolveFallbacks("verify", { AI_MODEL: "base/model", AI_FALLBACK_MODEL: "base/model" }), []);
});
