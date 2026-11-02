import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/lib/ai/schemas";
import type { Domain } from "@/lib/constants/domains";

export const MAX_CANDIDATES = 20;
const MAX_CANDIDATE_ROWS = 100;
const CONSENTED_STATUSES = ["granted", "public_info"] as const;

export type OrgType =
  | "public_institution"
  | "ngo"
  | "academic"
  | "private"
  | "association"
  | "independent"
  | "media";

export type ExpertRow = {
  id: string;
  full_name: string;
  title: string | null;
  organization: string | null;
  org_type: OrgType | null;
  domains: string[];
  languages: Language[];
  regions: string[];
  bio: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  consent_status: string;
  last_verified_at: string;
  is_fictional: boolean;
};

export type ExpertCandidateSearch = {
  domains: Domain[];
  region?: string;
  languages?: Language[];
};

export type ExpertCandidateResult = {
  experts: ExpertRow[];
  regionBroadened: boolean;
};

export class ExpertDirectoryError extends Error {
  readonly code = "directory_unavailable";

  constructor(detail: string) {
    super(detail);
    this.name = "ExpertDirectoryError";
  }
}

const EXPERT_COLUMNS = [
  "id",
  "full_name",
  "title",
  "organization",
  "org_type",
  "domains",
  "languages",
  "regions",
  "bio",
  "contact_email",
  "contact_phone",
  "consent_status",
  "last_verified_at",
  "is_fictional",
].join(", ");

function isConsented(status: string): boolean {
  return (CONSENTED_STATUSES as readonly string[]).includes(status);
}

async function queryExperts(
  supabase: SupabaseClient,
  search: ExpertCandidateSearch,
  region: string | undefined,
): Promise<ExpertRow[]> {
  let query = supabase
    .from("experts")
    .select(EXPERT_COLUMNS)
    .in("consent_status", CONSENTED_STATUSES)
    .overlaps("domains", [...search.domains])
    .order("last_verified_at", { ascending: false })
    .limit(MAX_CANDIDATE_ROWS);

  if (region) {
    query = query.or(`regions.cs.{${region}},regions.eq.{}`);
  }
  if (search.languages?.length) {
    query = query.overlaps("languages", [...search.languages]);
  }

  const { data, error } = await query;
  if (error) throw new ExpertDirectoryError(error.message);

  return ((data ?? []) as unknown as ExpertRow[]).filter((row) => isConsented(row.consent_status));
}

function rankCandidates(experts: ExpertRow[], domains: Domain[]): ExpertRow[] {
  const domainSet = new Set(domains);

  return [...experts]
    .sort((a, b) => {
      const matchesA = a.domains.filter((domain) => domainSet.has(domain as Domain)).length;
      const matchesB = b.domains.filter((domain) => domainSet.has(domain as Domain)).length;
      if (matchesA !== matchesB) return matchesB - matchesA;
      return b.last_verified_at.localeCompare(a.last_verified_at);
    })
    .slice(0, MAX_CANDIDATES);
}

function filterRows(
  rows: readonly ExpertRow[],
  search: ExpertCandidateSearch,
  region: string | undefined,
): ExpertRow[] {
  const domains = new Set<string>(search.domains);
  const languages = new Set<string>(search.languages ?? []);
  return rows.filter(
    (row) =>
      isConsented(row.consent_status) &&
      row.domains.some((domain) => domains.has(domain)) &&
      (!region || row.regions.length === 0 || row.regions.includes(region)) &&
      (languages.size === 0 || row.languages.some((language) => languages.has(language))),
  );
}

async function findCandidates(
  query: (region: string | undefined) => Promise<ExpertRow[]>,
  search: ExpertCandidateSearch,
): Promise<ExpertCandidateResult> {
  const ranked = rankCandidates(await query(search.region), search.domains);

  if (ranked.length >= 3 || !search.region) {
    return { experts: ranked, regionBroadened: false };
  }

  return {
    experts: rankCandidates(await query(undefined), search.domains),
    regionBroadened: true,
  };
}

export function findExpertCandidates(
  supabase: SupabaseClient,
  search: ExpertCandidateSearch,
): Promise<ExpertCandidateResult> {
  return findCandidates((region) => queryExperts(supabase, search, region), search);
}

export function findFixtureCandidates(
  rows: readonly ExpertRow[],
  search: ExpertCandidateSearch,
): Promise<ExpertCandidateResult> {
  return findCandidates(async (region) => filterRows(rows, search, region), search);
}
