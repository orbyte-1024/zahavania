import type { NextRequest } from "next/server";
import type { MonitorMetadataSuccess } from "@/lib/api/contract";
import { monitorRegionsWithDistricts } from "@/lib/monitor/districts";
import { MONITOR_DATA } from "@/lib/monitor/run";
import { MONITOR_THEMES } from "@/lib/monitor/taxonomy";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { jsonResponse, tooManyRequests } from "@/lib/security/request";

export const maxDuration = 60;

const MINUTE_MS = 60_000;
const ipLimiter = createRateLimiter({ name: "monitor-sources:ip", limit: 60, windowMs: MINUTE_MS });

export async function GET(req: NextRequest) {
  const ipCheck = await ipLimiter.check(clientIp(req));
  if (!ipCheck.allowed) return tooManyRequests(ipCheck.retryAfterSeconds);

  const response: MonitorMetadataSuccess = {
    ok: true,
    auditedAt: MONITOR_DATA.auditedAt,
    policy: MONITOR_DATA.policy,
    sources: MONITOR_DATA.sources
      .filter((source) => source.enabled)
      .map((source) => ({
        id: source.id,
        name: source.name,
        homepage: source.homepage,
        lang: source.lang,
        scope: source.scope,
        checkedAt: source.checkedAt,
      })),
    regions: monitorRegionsWithDistricts().map((region) => ({
      id: region.id,
      name: region.name,
      districts: region.districts.map((district) => ({ id: district.id, name: district.name })),
    })),
    themes: [...MONITOR_THEMES],
    limitations: ["feed_availability_changes", "location_inferred_from_text", "lexical_event_grouping"],
  };

  return jsonResponse(response);
}
