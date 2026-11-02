export const DOMAINS = [
  "health",
  "justice_law",
  "economy_finance",
  "education",
  "agriculture_food",
  "environment_climate",
  "infrastructure_transport",
  "energy",
  "statistics_demography",
  "governance_politics",
  "security",
  "human_rights_gender",
  "media_communication",
  "technology_digital",
  "culture_society",
  "mining_extractives",
  "disaster_risk",
] as const;

export type Domain = (typeof DOMAINS)[number];

const DOMAIN_SET: ReadonlySet<string> = new Set(DOMAINS);

export function isDomain(value: string): value is Domain {
  return DOMAIN_SET.has(value);
}

export function filterDomains(values: readonly string[]): Domain[] {
  const seen = new Set<Domain>();
  for (const value of values) {
    if (isDomain(value)) seen.add(value);
  }
  return [...seen];
}
