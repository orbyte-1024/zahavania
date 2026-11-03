import test from "node:test";
import assert from "node:assert/strict";

const { SORT_END, SORT_START, paperCues } = await import("../lib/browser/paper-cues.ts");

const kinds = (cues) => cues.map((cue) => cue.kind);

test("no sound while the page stands still", () => {
  assert.deepEqual(paperCues(0.2, 0.2), []);
  assert.deepEqual(paperCues(0.2, 0.2005), []);
});

test("scrolling through the scattered papers makes them flutter, louder when faster", () => {
  const slow = paperCues(0.1, 0.105);
  const fast = paperCues(0.1, 0.13);
  assert.deepEqual(kinds(slow), ["flutter"]);
  assert.ok(fast[0].intensity > slow[0].intensity);
  assert.ok(fast[0].intensity <= 1);
});

test("while they sort, papers land one after another, then the stack settles once", () => {
  assert.deepEqual(kinds(paperCues(SORT_START + 0.1, SORT_START + 0.12)), ["land"]);
  assert.deepEqual(kinds(paperCues(SORT_END - 0.01, SORT_END + 0.01)), ["land", "settle"]);
  assert.deepEqual(kinds(paperCues(SORT_END + 0.01, SORT_END + 0.05)), []);
});

test("scrolling back up scatters them again", () => {
  assert.deepEqual(kinds(paperCues(SORT_END + 0.02, SORT_END - 0.02)), ["flutter"]);
  assert.deepEqual(kinds(paperCues(SORT_START + 0.1, SORT_START + 0.05)), ["flutter"]);
});
