import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

const saved = { USE_MOCK: process.env.USE_MOCK, DEMO_MODE: process.env.DEMO_MODE };
let calls = 0;

async function post(body: unknown, contentType = "application/json") {
  calls += 1;
  const request = new NextRequest("http://localhost/api/monitor", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": contentType, "x-forwarded-for": `10.9.0.${calls}` },
  });
  const { POST } = await import("@/app/api/monitor/route");
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

async function getMetadata() {
  calls += 1;
  const request = new NextRequest("http://localhost/api/monitor/sources", {
    method: "GET",
    headers: { "x-forwarded-for": `10.8.0.${calls}` },
  });
  const { GET } = await import("@/app/api/monitor/sources/route");
  const response = await GET(request);
  return { status: response.status, body: await response.json() };
}

describe("POST /api/monitor — national monitoring backend", () => {
  beforeEach(() => {
    process.env.USE_MOCK = "true";
    process.env.DEMO_MODE = "true";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("refuses to run without a session when auth is not configured", async () => {
    process.env.DEMO_MODE = "false";
    const { status, body } = await post({ lang: "fr" });
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, error: { code: "auth_unavailable" } });
  });

  it("returns a complete demonstration monitor with events, versions and alerts", async () => {
    const { status, body } = await post({ lang: "fr" });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mock).toBe(true);
    expect(body.filters.sinceHours).toBe(72);
    expect(body.articles).toHaveLength(9);
    expect(body.events).toHaveLength(3);
    expect(body.coverage.sourcesFetched).toBe(4);
    expect(body.alerts.map((alert: { kind: string }) => alert.kind)).toEqual(
      expect.arrayContaining(["rising_event", "contradictory_versions"]),
    );
    expect(body.limitations).toContain("mock_demo_data");
    const cyclone = body.events.find((event: { title: string }) => event.title.includes("Cyclone"));
    expect(cyclone.versions.coverage).toBe("divergent");
    expect(cyclone.versions.divergences[0].positions).toHaveLength(2);
    expect(cyclone.momentum.level).toBe("surge");
  });

  it("filters by region, district and theme", async () => {
    const { status, body } = await post({ lang: "fr", region: "vatovavy", district: "mananjary" });
    expect(status).toBe(200);
    expect(body.articles).toHaveLength(3);
    expect(body.articles.every((article: { region: string }) => article.region === "vatovavy")).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].themes).toContain("environment");
    expect(body.alerts.some((alert: { kind: string }) => alert.kind === "contradictory_versions")).toBe(true);
  });

  it("rejects invalid filters and bodies with the standard envelope", async () => {
    expect((await post({ lang: "fr", district: "inconnu" })).body.error).toMatchObject({
      code: "invalid_input",
      fields: expect.arrayContaining(["district"]),
    });
    expect((await post({ lang: "fr", region: "diana", district: "mananjary" })).status).toBe(400);
    expect((await post({ lang: "fr", theme: "meteo" })).status).toBe(400);
    expect((await post({ lang: "fr", sinceHours: 2 })).status).toBe(400);
    expect((await post({ lang: "fr", extra: true })).status).toBe(400);
    expect((await post("{", "application/json")).body.error.code).toBe("invalid_body");
    expect((await post("x", "text/plain")).status).toBe(415);
  });
});

describe("GET /api/monitor/sources", () => {
  it("lists the audited feeds and the region/district taxonomy", async () => {
    const { status, body } = await getMetadata();
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sources).toHaveLength(7);
    expect(body.regions).toHaveLength(23);
    expect(body.regions.reduce((total: number, region: { districts: unknown[] }) => total + region.districts.length, 0)).toBe(114);
    expect(body.themes).toContain("politics");
    expect(body.themes).toContain("general");
    expect(body.policy).toMatch(/RSS/);
  });
});
