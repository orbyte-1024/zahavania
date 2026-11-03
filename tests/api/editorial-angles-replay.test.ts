import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { hashKey } from "@/lib/cache";
import { DEMO_DIR } from "@/lib/demo/replay";

const saved = { USE_MOCK: process.env.USE_MOCK, DEMO_FALLBACK: process.env.DEMO_FALLBACK, LLM_API_KEY: process.env.LLM_API_KEY };
const claims = [{ text: "Le prix du riz a augmenté en 2026.", status: "confirmed" }];
const key = hashKey(["editorial-angles", null, claims, "fr"]);
const file = path.join(DEMO_DIR, `editorial-angles-${key}.json`);
const output = {
  lang: "fr",
  angles: [
    {
      title: "Recorded angle",
      premise: "P",
      interviewQuestions: ["Q?"],
      actorTypes: ["économiste"],
      dataToFind: ["prix"],
      format: "investigation",
      basedOn: ["Le prix du riz a augmenté en 2026."],
      toVerifyFirst: [],
    },
  ],
  limitations: [],
};

async function post(body: unknown) {
  const request = new NextRequest("http://localhost/api/editorial/angles", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": "10.8.0.1" },
  });
  const { POST } = await import("@/app/api/editorial/angles/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/editorial/angles — demo replay", () => {
  afterEach(async () => {
    await rm(file, { force: true });
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("replays a recording, marked with its date, whatever the verification id", async () => {
    await mkdir(DEMO_DIR, { recursive: true });
    await writeFile(file, JSON.stringify({ route: "editorial-angles", recordedAt: "2026-11-03T10:00:00.000Z", payload: output }), "utf8");
    process.env.USE_MOCK = "false";
    process.env.DEMO_FALLBACK = "always";
    delete process.env.LLM_API_KEY;

    const { status, body } = await post({ claims, lang: "fr", verificationId: "any-id" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, mock: false, recordedAt: "2026-11-03T10:00:00.000Z", verificationId: "any-id", usage: null, attempts: 0 });
    expect(body.angles[0].title).toBe("Recorded angle");
  });

  it("without a recording, a missing provider still fails clearly", async () => {
    process.env.USE_MOCK = "false";
    process.env.DEMO_FALLBACK = "on_error";
    delete process.env.LLM_API_KEY;
    const { status, body } = await post({ claims, lang: "fr" });
    expect(status).toBe(503);
    expect(body.error.code).toBe("ai_unavailable");
  });
});
