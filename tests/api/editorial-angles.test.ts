import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const saved = { USE_MOCK: process.env.USE_MOCK, DEMO_MODE: process.env.DEMO_MODE };
let calls = 0;

async function post(body: unknown, contentType = "application/json") {
  calls += 1;
  const request = new NextRequest("http://localhost/api/editorial/angles", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": contentType, "x-forwarded-for": `10.7.0.${calls}` },
  });
  const { POST } = await import("@/app/api/editorial/angles/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/editorial/angles — same chain as the other AI routes", () => {
  beforeEach(() => {
    process.env.USE_MOCK = "true";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("refuses to run without a session when auth is not configured", async () => {
    process.env.DEMO_MODE = "false";
    const { status, body } = await post({ subject: "Prix du riz", lang: "fr" });
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: { code: "auth_unavailable" } });
  });

  it("validates the body with the standard error envelope", async () => {
    const missing = await post({ lang: "fr" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("invalid_input");
    expect(missing.body.error.fields).toContain("claims");
    expect((await post("{", "application/json")).body.error.code).toBe("invalid_body");
    expect((await post("x", "text/plain")).status).toBe(415);
  });

  it("returns angles flagged as a demonstration in mock mode", async () => {
    const { status, body } = await post({ subject: "Prix du riz à Antananarivo", lang: "fr" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mock).toBe(true);
    expect(body).not.toHaveProperty("erreur");
  });
});
