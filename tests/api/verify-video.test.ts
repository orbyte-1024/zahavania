import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { fileOf, fixture } from "../helpers/upload";

const jpeg = fixture("valid.jpg");
const png = fixture("valid.png");
const saved = { USE_MOCK: process.env.USE_MOCK, LLM_API_KEY: process.env.LLM_API_KEY, DEMO_MODE: process.env.DEMO_MODE };

let calls = 0;

function framesForm(count: number, fields: Record<string, string>, bytes: Uint8Array = jpeg) {
  const form = new FormData();
  for (let i = 0; i < count; i += 1) form.append("frame", fileOf(bytes, `frame-${i}.jpg`, "image/jpeg"));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return form;
}

function validFields(count: number) {
  return { duration: "60", timestamps: JSON.stringify(Array.from({ length: count }, (_, i) => 1.2 + i * 10)), lang: "en" };
}

async function post(form: FormData) {
  calls += 1;
  const request = new NextRequest("http://localhost/api/verify/video", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": `10.8.0.${calls}` },
  });
  const { POST } = await import("@/app/api/verify/video/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/verify/video — key frames extracted in the browser", () => {
  beforeEach(() => {
    process.env.USE_MOCK = "true";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("analyses every frame and reports results per timestamp", async () => {
    const { status, body } = await post(framesForm(6, validFields(6)));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mock).toBe(true);
    expect(body.frames.map((f: { timestamp: number }) => f.timestamp)).toEqual([1.2, 11.2, 21.2, 31.2, 41.2, 51.2]);
    expect(body).toMatchObject({ analysedCount: 6, failedCount: 0, video: { duration: 60, framesReceived: 6 } });
    expect(body.verification.status).toBe("non concluant");
  });

  it("counts failed frames honestly when the model is unavailable", async () => {
    process.env.USE_MOCK = "false";
    delete process.env.LLM_API_KEY;
    const { status, body } = await post(framesForm(2, validFields(2)));
    expect(status).toBe(200);
    expect(body).toMatchObject({ analysedCount: 0, failedCount: 2 });
    expect(body.frames.every((f: { status: string; analysis: unknown }) => f.status === "failed" && f.analysis === null)).toBe(true);
    expect(body.warnings[0].code).toBe("ANALYSE_IA_NON_DISPONIBLE");
    expect(body.verification.status).toBe("non concluant");
  });

  it("refuses a request without frames", async () => {
    const { status, body } = await post(framesForm(0, validFields(1)));
    expect(status).toBe(400);
    expect(body.error.code).toBe("frames_missing");
  });

  it("refuses more than six frames", async () => {
    const { status } = await post(framesForm(7, validFields(7)));
    expect(status).toBe(400);
  });

  it("accepts only JPEG frames", async () => {
    const { status, body } = await post(framesForm(1, validFields(1), png));
    expect(status).toBe(415);
    expect(body.error.code).toBe("unsupported_media");
  });

  it("rejects timestamps that do not match the frames", async () => {
    expect((await post(framesForm(2, validFields(3)))).status).toBe(400);
    expect((await post(framesForm(2, { ...validFields(2), timestamps: "[5, 2]" }))).status).toBe(400);
    expect((await post(framesForm(1, { ...validFields(1), timestamps: "[90]" }))).status).toBe(400);
    expect((await post(framesForm(1, { ...validFields(1), timestamps: "not json" }))).status).toBe(400);
  });

  it("rejects a missing or absurd duration and an unknown language", async () => {
    expect((await post(framesForm(1, { timestamps: "[1]" }))).status).toBe(400);
    expect((await post(framesForm(1, { ...validFields(1), duration: "-3" }))).status).toBe(400);
    expect((await post(framesForm(1, { ...validFields(1), duration: String(5 * 3600) }))).status).toBe(400);
    expect((await post(framesForm(1, { ...validFields(1), lang: "de" }))).status).toBe(400);
  });

  it("refuses to run without a session when auth is not configured", async () => {
    process.env.DEMO_MODE = "false";
    const { status, body } = await post(framesForm(1, validFields(1)));
    expect(status).toBe(503);
    expect(body.error.code).toBe("auth_unavailable");
  });
});
