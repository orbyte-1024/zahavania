import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const previousUseMock = process.env.USE_MOCK;

beforeAll(() => {
  process.env.USE_MOCK = "true";
});

afterAll(() => {
  if (previousUseMock === undefined) {
    delete process.env.USE_MOCK;
  } else {
    process.env.USE_MOCK = previousUseMock;
  }
});

function generateVideoBytes(): Uint8Array {
  const tmpDir = mkdtempSync(join(tmpdir(), "checkeko-video-"));
  const path = join(tmpDir, "sample.mp4");

  execFileSync(
    "ffmpeg",
    [
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=1:size=320x240:rate=1",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-y",
      path,
    ],
    { stdio: "ignore" },
  );

  const bytes = readFileSync(path);
  rmSync(tmpDir, { recursive: true, force: true });
  return new Uint8Array(bytes);
}

async function postFormVideo(body: FormData) {
  const request = new NextRequest("http://localhost/api/verify/video", {
    method: "POST",
    body,
    headers: {},
  });

  const { POST } = await import("@/app/api/verify/video/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/verify/video", () => {
  it("accepts a valid MP4 and extracts frames", async () => {
    const bytes = generateVideoBytes();
    const form = new FormData();
    form.append("video", new File([bytes], "sample.mp4", { type: "video/mp4" }));

    const { status, body } = await postFormVideo(form);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mediaType).toBe("video");
    expect(body.file).toMatchObject({ format: "video/mp4", size: bytes.byteLength });
    expect(body.framesAnalyzed).toBeGreaterThan(0);
    expect(body.analysis).not.toBeNull();
  });

  it("rejects a request without the video field", async () => {
    const form = new FormData();
    form.append("image", new File(["not a video"], "image.png", { type: "image/png" }));

    const { status, body } = await postFormVideo(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
