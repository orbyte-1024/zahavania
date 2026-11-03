import test from "node:test";
import assert from "node:assert/strict";

const { aggregateFrames, combinedAnalysis, formatTimestamp, frameTimestamps, mapWithConcurrency, FRAME_COUNT } = await import("../lib/video-frames.ts");

const obs = (text, confidence = "low") => ({ text, confidence });
const analysis = (overrides = {}) => ({
  description: obs("A street"),
  visualInconsistencies: [],
  possibleAIGenerationIndicators: [],
  locationClues: [],
  limitations: obs("Compressed frame"),
  ...overrides,
});

test("six timestamps skip the first and last 2% and are evenly spaced", () => {
  const stamps = frameTimestamps(100);
  assert.equal(stamps.length, FRAME_COUNT);
  assert.equal(stamps[0], 2);
  assert.equal(stamps.at(-1), 98);
  const gaps = stamps.slice(1).map((t, i) => Math.round((t - stamps[i]) * 1000) / 1000);
  assert.ok(gaps.every((g) => g === gaps[0]));
});

test("timestamps are strictly increasing, even for very short clips", () => {
  for (const duration of [0.01, 0.2, 1, 7.5, 3600]) {
    const stamps = frameTimestamps(duration);
    assert.ok(stamps.length >= 1);
    assert.ok(stamps.every((t, i) => t >= 0 && t <= duration && (i === 0 || t > stamps[i - 1])));
  }
});

test("an unknown or invalid duration gives no timestamp", () => {
  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.deepEqual(frameTimestamps(duration), []);
});

test("aggregation sorts frames, counts failures and merges repeated observations", () => {
  const result = aggregateFrames([
    { timestamp: 30, analysis: analysis({ visualInconsistencies: [obs("Shadow points the wrong way", "high")] }) },
    { timestamp: 10, analysis: analysis({ visualInconsistencies: [obs("shadow  points the wrong way")], locationClues: [obs("Red earth road")] }) },
    { timestamp: 20, analysis: null },
  ]);
  assert.deepEqual(result.frames.map((f) => [f.timestamp, f.status]), [[10, "analysed"], [20, "failed"], [30, "analysed"]]);
  assert.equal(result.analysedCount, 2);
  assert.equal(result.failedCount, 1);
  assert.equal(result.visualInconsistencies.length, 1);
  assert.deepEqual(result.visualInconsistencies[0].timestamps, [10, 30]);
  assert.equal(result.visualInconsistencies[0].confidence, "high");
  assert.deepEqual(result.locationClues[0].timestamps, [10]);
});

test("the combined analysis is null when every frame failed", () => {
  const result = aggregateFrames([{ timestamp: 1, analysis: null }, { timestamp: 2, analysis: null }]);
  assert.equal(result.failedCount, 2);
  assert.equal(combinedAnalysis(result), null);
});

test("the combined analysis tags each observation with where it was seen", () => {
  const merged = combinedAnalysis(aggregateFrames([{ timestamp: 75, analysis: analysis({ possibleAIGenerationIndicators: [obs("Warped text")] }) }]));
  assert.equal(merged.description.text, "[1:15] A street");
  assert.equal(merged.possibleAIGenerationIndicators[0].text, "[1:15] Warped text");
  assert.equal(formatTimestamp(3725), "1:02:05");
});

test("frames are analysed two at a time and results keep their order", async () => {
  let running = 0;
  let peak = 0;
  const results = await mapWithConcurrency([30, 10, 20, 5, 15, 1], 2, async (delay, index) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, delay));
    running -= 1;
    return index;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
});
