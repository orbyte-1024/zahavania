import type { Claim, ClaimStatus, Source, SourceKind, VerifyOutput } from "@/lib/ai/schemas";

export const NO_SOURCE_MAX_CONFIDENCE = 25;
export const NEEDS_VERIFICATION_MAX_CONFIDENCE = 70;

const ALIGNED_POINTS: Record<SourceKind, number> = { official: 35, independent: 25, other: 10 };
const OPPOSING_POINTS: Record<SourceKind, number> = { official: -30, independent: -20, other: -10 };
const KIND_RANK: Record<SourceKind, number> = { official: 3, independent: 2, other: 1 };
const MAX_ALIGNED_POINTS = 70;
const TWO_DOMAINS_BONUS = 10;
const THREE_DOMAINS_BONUS = 15;
const RECENT_BONUS = 10;
const STALE_PENALTY = -15;
const CONTEXT_BONUS = 5;
const CONTRADICTION_PENALTY = -5;
const MAX_CONTRADICTION_PENALTY = -15;
const RECENT_MAX_DAYS = 2 * 365;
const STALE_MIN_DAYS = 5 * 365;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type ScoreCode =
  | "official_source"
  | "independent_source"
  | "other_source"
  | "independent_domains"
  | "recent_source"
  | "stale_sources"
  | "context_source"
  | "opposing_official_source"
  | "opposing_independent_source"
  | "opposing_other_source"
  | "reported_contradictions"
  | "aligned_points_cap"
  | "no_usable_source"
  | "status_cap"
  | "floor_at_zero"
  | "status_lowered"
  | "claim_contribution"
  | "no_claims";

export type ScoreItem = { code: ScoreCode; label: string; points: number };

export type ScoredClaim = Claim & { confidenceIndex: number; breakdown: ScoreItem[] };

export type ScoredVerification = Omit<VerifyOutput, "claims"> & {
  claims: ScoredClaim[];
  globalIndex: number;
  globalBreakdown: ScoreItem[];
};

export function sourceDomain(url: string): string | null {
  if (!URL.canParse(url)) return null;
  return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
}

function bestKindByDomain(sources: readonly Source[]): Map<string, SourceKind> {
  const byDomain = new Map<string, SourceKind>();
  for (const source of sources) {
    const domain = sourceDomain(source.url);
    if (!domain) continue;
    const current = byDomain.get(domain);
    if (!current || KIND_RANK[source.kind] > KIND_RANK[current]) byDomain.set(domain, source.kind);
  }
  return byDomain;
}

function ageInDays(date: string | null, now: number): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  if (Number.isNaN(time)) return null;
  return Math.max(0, (now - time) / DAY_MS);
}

function alignedStance(status: ClaimStatus): Source["stance"] {
  return status === "contradicted" ? "contradicts" : "supports";
}

function opposingStance(status: ClaimStatus): Source["stance"] {
  return status === "contradicted" ? "supports" : "contradicts";
}

function countKinds(byDomain: Map<string, SourceKind>): Record<SourceKind, number> {
  const counts: Record<SourceKind, number> = { official: 0, independent: 0, other: 0 };
  for (const kind of byDomain.values()) counts[kind] += 1;
  return counts;
}

function reliableDomainCount(byDomain: Map<string, SourceKind>): number {
  return [...byDomain.values()].filter((kind) => kind !== "other").length;
}

function adjustStatus(claim: Claim, aligned: Map<string, SourceKind>): { status: ClaimStatus; reason: string | null } {
  if (claim.sources.length === 0) {
    return { status: "insufficient", reason: claim.status === "insufficient" ? null : "no usable source" };
  }
  if (claim.status === "confirmed" && reliableDomainCount(aligned) < 2) {
    return { status: "needs_verification", reason: "confirmation requires at least 2 independent reliable domains" };
  }
  if (claim.status === "contradicted" && reliableDomainCount(aligned) < 1) {
    return { status: "needs_verification", reason: "no reliable source contradicts the claim" };
  }
  return { status: claim.status, reason: null };
}

export function scoreClaim(claim: Claim, now: number = Date.now()): ScoredClaim {
  const initialAligned = bestKindByDomain(claim.sources.filter((s) => s.stance === alignedStance(claim.status)));
  const { status, reason } = adjustStatus(claim, initialAligned);
  const alignedSources = claim.sources.filter((s) => s.stance === alignedStance(status));
  const aligned = bestKindByDomain(alignedSources);
  const opposing = bestKindByDomain(claim.sources.filter((s) => s.stance === opposingStance(status)));
  const breakdown: ScoreItem[] = [];

  if (reason) {
    breakdown.push({ code: "status_lowered", label: `Status lowered to ${status}: ${reason}`, points: 0 });
  }

  if (claim.sources.length === 0) {
    breakdown.push({ code: "no_usable_source", label: "No source found by web search", points: 0 });
    return { ...claim, status, confidenceIndex: 0, breakdown };
  }

  const kinds = countKinds(aligned);
  let alignedTotal = 0;
  for (const kind of ["official", "independent", "other"] as const) {
    if (kinds[kind] === 0) continue;
    const points = kinds[kind] * ALIGNED_POINTS[kind];
    alignedTotal += points;
    breakdown.push({ code: `${kind}_source`, label: `${kinds[kind]} ${kind} source domain(s)`, points });
  }
  if (alignedTotal > MAX_ALIGNED_POINTS) {
    breakdown.push({
      code: "aligned_points_cap",
      label: `Source points capped at ${MAX_ALIGNED_POINTS}`,
      points: MAX_ALIGNED_POINTS - alignedTotal,
    });
  }

  if (aligned.size >= 3) {
    breakdown.push({ code: "independent_domains", label: `${aligned.size} distinct domains`, points: THREE_DOMAINS_BONUS });
  } else if (aligned.size === 2) {
    breakdown.push({ code: "independent_domains", label: "2 distinct domains", points: TWO_DOMAINS_BONUS });
  }

  const ages = alignedSources.map((s) => ageInDays(s.date, now)).filter((age): age is number => age !== null);
  if (ages.length > 0) {
    const newest = Math.min(...ages);
    if (newest <= RECENT_MAX_DAYS) {
      breakdown.push({ code: "recent_source", label: "Source published within 2 years", points: RECENT_BONUS });
    } else if (newest >= STALE_MIN_DAYS) {
      breakdown.push({ code: "stale_sources", label: "Newest source is over 5 years old", points: STALE_PENALTY });
    }
  }

  if (claim.sources.some((s) => s.stance === "context")) {
    breakdown.push({ code: "context_source", label: "Background source available", points: CONTEXT_BONUS });
  }

  const opposingKinds = countKinds(opposing);
  for (const kind of ["official", "independent", "other"] as const) {
    if (opposingKinds[kind] === 0) continue;
    breakdown.push({
      code: `opposing_${kind}_source`,
      label: `${opposingKinds[kind]} ${kind} source domain(s) pointing the other way`,
      points: opposingKinds[kind] * OPPOSING_POINTS[kind],
    });
  }

  if (claim.contradictions.length > 0) {
    breakdown.push({
      code: "reported_contradictions",
      label: `${claim.contradictions.length} contradiction(s) noted`,
      points: Math.max(MAX_CONTRADICTION_PENALTY, claim.contradictions.length * CONTRADICTION_PENALTY),
    });
  }

  const raw = breakdown.reduce((sum, item) => sum + item.points, 0);
  if (raw < 0) breakdown.push({ code: "floor_at_zero", label: "Index cannot go below 0", points: -raw });
  let index = clamp(raw);
  const cap = status === "insufficient" ? NO_SOURCE_MAX_CONFIDENCE : status === "needs_verification" ? NEEDS_VERIFICATION_MAX_CONFIDENCE : 100;
  if (index > cap) {
    breakdown.push({ code: "status_cap", label: `Index capped at ${cap} for status ${status}`, points: cap - index });
    index = cap;
  }

  return { ...claim, status, confidenceIndex: index, breakdown };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function scoreVerification(output: VerifyOutput, now: number = Date.now()): ScoredVerification {
  const claims = output.claims.map((claim) => scoreClaim(claim, now));
  if (claims.length === 0) {
    return {
      ...output,
      claims,
      globalIndex: 0,
      globalBreakdown: [{ code: "no_claims", label: "No checkable claim found", points: 0 }],
    };
  }

  const globalBreakdown = claims.map((claim, index): ScoreItem => ({
    code: "claim_contribution",
    label: `Claim ${index + 1} (${claim.status}, index ${claim.confidenceIndex}) / ${claims.length}`,
    points: Math.round(claim.confidenceIndex / claims.length),
  }));
  const globalIndex = clamp(globalBreakdown.reduce((sum, item) => sum + item.points, 0));

  return { ...output, claims, globalIndex, globalBreakdown };
}
