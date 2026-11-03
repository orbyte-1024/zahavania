import districtsFile from "@/data/monitor-districts.json";
import { REGIONS, type Region } from "@/lib/constants/regions";
import { foldText } from "@/lib/monitor/taxonomy";

export type DistrictRecord = {
  id: string;
  name: string;
  aliases: string[];
};

export type RegionRecord = {
  id: Region;
  name: string;
  aliases: string[];
  districts: DistrictRecord[];
};

export type DistrictsData = {
  updatedAt: string;
  source: string;
  sourceUrl: string;
  regions: RegionRecord[];
};

export const MONITOR_DISTRICTS = districtsFile as DistrictsData;

export function districtsForRegion(region: Region): DistrictRecord[] {
  return MONITOR_DISTRICTS.regions.find((entry) => entry.id === region)?.districts ?? [];
}

export type ResolvedDistrict = { region: Region; district: DistrictRecord };

const DISTRICT_INDEX = new Map<string, ResolvedDistrict>();
for (const region of MONITOR_DISTRICTS.regions) {
  for (const district of region.districts) {
    for (const value of [district.id, district.name, ...district.aliases]) {
      DISTRICT_INDEX.set(foldText(value), { region: region.id, district });
    }
  }
}

export function resolveDistrict(value: string): ResolvedDistrict | null {
  return DISTRICT_INDEX.get(foldText(value)) ?? null;
}

type LocationEntry = { term: string; region: Region; district: string | null };

const LOCATION_INDEX: LocationEntry[] = [];
for (const region of MONITOR_DISTRICTS.regions) {
  for (const district of region.districts) {
    for (const value of [district.id, district.name, ...district.aliases]) {
      LOCATION_INDEX.push({ term: foldText(value), region: region.id, district: district.id });
    }
  }
  for (const value of [region.name, ...region.aliases]) {
    LOCATION_INDEX.push({ term: foldText(value), region: region.id, district: null });
  }
}
LOCATION_INDEX.sort((a, b) => b.term.length - a.term.length || (a.district ? -1 : 1));

export function detectLocation(title: string, excerpt: string): { region: Region; district: string | null } | null {
  const text = ` ${foldText(`${title} ${excerpt}`)} `;
  for (const entry of LOCATION_INDEX) {
    if (entry.term.length < 4) continue;
    if (text.includes(` ${entry.term} `)) return { region: entry.region, district: entry.district };
  }
  return null;
}

export function isValidDistrictForRegion(district: string, region: Region | null): boolean {
  const resolved = resolveDistrict(district);
  if (!resolved) return false;
  return region === null || resolved.region === region;
}

export function regionHasDistricts(region: Region): boolean {
  return districtsForRegion(region).length > 0;
}

export function monitorRegionsWithDistricts(): { id: Region; name: string; districts: DistrictRecord[] }[] {
  return REGIONS.map((region) => {
    const record = MONITOR_DISTRICTS.regions.find((entry) => entry.id === region);
    return { id: region, name: record?.name ?? region, districts: record?.districts ?? [] };
  });
}
