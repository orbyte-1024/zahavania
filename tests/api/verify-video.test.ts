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

async function generateVideoBytes(): Promise<Uint8Array<ArrayBuffer>> {
  const { readFileSync } = await import("node:fs");
  const file = readFileSync(new URL("../fixtures/video-valid.mp4", import.meta.url));
  return new Uint8Array(file) as Uint8Array<ArrayBuffer>;
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
    const bytes = await generateVideoBytes();
    const form = new FormData();
    form.append("video", new File([bytes], "sample.mp4", { type: "video/mp4" }));

    const { status, body } = await postFormVideo(form);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mediaType).toBe("video");
    expect(body.file).toMatchObject({ format: "video/mp4", size: bytes.byteLength });
    expect(body.framesAnalyzed).toBeGreaterThanOrEqual(0);
    if (body.framesAnalyzed > 0) {
      expect(body.analysis).not.toBeNull();
    }
  });

  it("rejects a request without the video field", async () => {
    const form = new FormData();
    form.append("image", new File(["not a video"], "image.png", { type: "image/png" }));

    const { status, body } = await postFormVideo(form);

    expect(status).toBe(400);
    expect(body.ok).toBe(false);
  });
});
