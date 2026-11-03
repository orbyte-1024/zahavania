import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const { MAX_IMAGE_BYTES } = await import("../lib/image-intake.ts");
const { FRAMES_MAX_TOTAL_BYTES } = await import("../lib/video-frames.ts");
const { UPLOAD_MAX_BYTES } = await import("../lib/browser/image-prep.ts");

const VERCEL_BODY_LIMIT = 4_500_000;
const MULTIPART_MARGIN = 64 * 1024;
const VERCEL_MAX_DURATION = 300;

function routeFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

const routes = routeFiles(new URL("../app/api", import.meta.url).pathname).map((path) => ({ path, source: readFileSync(path, "utf8") }));

test("every API route declares a maxDuration Vercel accepts", () => {
  assert.ok(routes.length >= 6);
  for (const { path, source } of routes) {
    const match = /export const maxDuration = (\d+);/.exec(source);
    assert.ok(match, `${path} has no maxDuration`);
    const seconds = Number(match[1]);
    assert.ok(seconds >= 60 && seconds <= VERCEL_MAX_DURATION, `${path}: ${seconds}s`);
  }
});

test("JSON routes cap their body far below the Vercel request limit", () => {
  for (const { path, source } of routes) {
    const match = /const MAX_BODY_BYTES = ([\d_ *]+);/.exec(source);
    if (!match) continue;
    const bytes = match[1].replace(/_/g, "").split("*").reduce((product, factor) => product * Number(factor.trim()), 1);
    assert.ok(bytes > 0 && bytes < VERCEL_BODY_LIMIT, `${path}: ${bytes}`);
  }
});

test("image and video uploads stay under the Vercel request limit", () => {
  assert.ok(MAX_IMAGE_BYTES + MULTIPART_MARGIN < VERCEL_BODY_LIMIT);
  assert.ok(FRAMES_MAX_TOTAL_BYTES + MULTIPART_MARGIN < VERCEL_BODY_LIMIT);
});

test("the browser compresses images to a size the server accepts", () => {
  assert.ok(UPLOAD_MAX_BYTES <= MAX_IMAGE_BYTES);
});
