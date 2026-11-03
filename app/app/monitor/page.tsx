import feeds from "@/data/monitor-sources.json";
import { MonitorScreen, type MonitorSetup } from "@/components/workspace/MonitorScreen";
import type { Language } from "@/lib/ai/schemas";
import { monitorRegionsWithDistricts } from "@/lib/monitor/districts";
import { MONITOR_THEMES } from "@/lib/monitor/taxonomy";

function monitorSetup(): MonitorSetup {
  return {
    auditedAt: feeds.auditedAt,
    sources: feeds.sources
      .filter((source) => source.enabled)
      .map((source) => ({ id: source.id, name: source.name, homepage: source.homepage, lang: source.lang as Language })),
    regions: monitorRegionsWithDistricts().map((region) => ({
      id: region.id,
      name: region.name,
      districts: region.districts.map((district) => ({ id: district.id, name: district.name })),
    })),
    themes: [...MONITOR_THEMES],
  };
}

export default function MonitorPage() {
  return <MonitorScreen setup={monitorSetup()} />;
}
