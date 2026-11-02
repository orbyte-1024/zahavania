// Slugs for Madagascar's regions. The team must check this list against the
// current official administrative list before production use.
export const REGIONS = [
  "diana",
  "sava",
  "itasy",
  "analamanga",
  "vakinankaratra",
  "bongolava",
  "sofia",
  "boeny",
  "betsiboka",
  "melaky",
  "alaotra_mangoro",
  "atsinanana",
  "analanjirofo",
  "amoron_i_mania",
  "haute_matsiatra",
  "vatovavy",
  "fitovinany",
  "atsimo_atsinanana",
  "ihorombe",
  "menabe",
  "atsimo_andrefana",
  "androy",
  "anosy",
] as const;

export type Region = (typeof REGIONS)[number];

const REGION_SET: ReadonlySet<string> = new Set(REGIONS);

export function isRegion(value: string): value is Region {
  return REGION_SET.has(value);
}
