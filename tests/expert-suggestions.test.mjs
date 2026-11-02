import test from "node:test";
import assert from "node:assert/strict";
import { applySuggestionGuard } from "../lib/experts/guard.ts";

const allowedRefs = new Set(["c1", "c2"]);

test("drops refs that were not sent to the model", () => {
  const result = applySuggestionGuard(
    [
      { ref: "c1", relevance: 90, reason: "sent", contributionType: "confirm" },
      { ref: "c99", relevance: 100, reason: "invented", contributionType: "data" },
    ],
    allowedRefs,
    5,
  );

  assert.deepEqual(result.map((suggestion) => suggestion.ref), ["c1"]);
});

test("deduplicates refs and keeps the highest relevance", () => {
  const result = applySuggestionGuard(
    [
      { ref: "c1", relevance: 40, reason: "low", contributionType: "explain" },
      { ref: "c1", relevance: 80, reason: "high", contributionType: "explain" },
      { ref: "c2", relevance: 70, reason: "other", contributionType: "data" },
    ],
    allowedRefs,
    5,
  );

  assert.deepEqual(
    result.map((suggestion) => [suggestion.ref, suggestion.relevance]),
    [
      ["c1", 80],
      ["c2", 70],
    ],
  );
});

test("sorts by relevance and applies the limit after the guard", () => {
  const result = applySuggestionGuard(
    [
      { ref: "c2", relevance: 50, reason: "second", contributionType: "data" },
      { ref: "c1", relevance: 90, reason: "first", contributionType: "confirm" },
    ],
    allowedRefs,
    1,
  );

  assert.deepEqual(result.map((suggestion) => suggestion.ref), ["c1"]);
});
