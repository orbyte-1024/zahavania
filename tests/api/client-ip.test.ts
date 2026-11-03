import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp } from "@/lib/security/ratelimit";

function request(headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/verify/text", { method: "POST", headers });
}

describe("clientIp", () => {
  it("prefers the address set by the platform over anything the client sends", () => {
    expect(clientIp(request({ "x-vercel-forwarded-for": "41.188.1.1", "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.2.3.4" }))).toBe("41.188.1.1");
    expect(clientIp(request({ "x-real-ip": "41.188.1.2", "x-forwarded-for": "1.2.3.4" }))).toBe("41.188.1.2");
  });

  it("takes the last forwarded hop, added by the proxy, not a value the client can spoof", () => {
    expect(clientIp(request({ "x-forwarded-for": "6.6.6.6, 41.188.1.3" }))).toBe("41.188.1.3");
    expect(clientIp(request({}))).toBe("unknown");
  });
});
