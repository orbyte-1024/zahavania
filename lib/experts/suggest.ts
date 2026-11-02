import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { askJson, isMockMode, type AiUsage } from "@/lib/ai/client";
import {
  expertRankingSchema,
  topicClassificationSchema,
  type ContributionType,
  type ExpertRanking,
  type RankedSuggestion,
  type SuggestInput,
} from "@/lib/ai/expert-schemas";
import {
  buildClassifyTopicUserMessage,
  CLASSIFY_TOPIC_SYSTEM_PROMPT,
} from "@/lib/ai/prompts/classify-topic";
import {
  buildRankExpertsUserMessage,
  RANK_EXPERTS_SYSTEM_PROMPT,
  type RankCandidate,
} from "@/lib/ai/prompts/rank-experts";
import type { Language } from "@/lib/ai/schemas";
import { filterDomains, type Domain } from "@/lib/constants/domains";
import { findExpertCandidates, type ExpertRow, type OrgType } from "@/lib/db/experts";
import { applySuggestionGuard } from "@/lib/experts/guard";
import { buildMockRanking, detectMockDomains } from "@/lib/experts/mock";

const CLASSIFY_MAX_TOKENS = 200;
const CLASSIFY_TIMEOUT_MS = 20_000;
const RANK_MAX_TOKENS = 1_500;
const RANK_TIMEOUT_MS = 30_000;
const STALE_AFTER_DAYS = 180;
const MAX_MISSING_PROFILES = 5;
const MAX_REASON_LENGTH = 600;

const EMAIL_PATTERN = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const PHONE_PATTERN = /(?:\+261|0\d)[\d\s().-]{6,}/;
const CAPITALIZED_WORD_PATTERN = /[A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'’-]+/g;
const GENERIC_PROFILE_WORD_PATTERN =
  /(?:expert|specialist|spécialiste|researcher|chercheur|analyst|analyste|journalist|journaliste|doctor|médecin|lawyer|avocat|professor|professeur|engineer|ingénieur|anthropologist|anthropologue|economist|économiste|agronomist|agronome|geologist|géologue|consultant|consultante|sociologist|sociologue|statistician|statisticien|scientist|scientifique|teacher|enseignant|nurse|infirmier|midwife|sage-femme)/i;

export type ExpertSuggestion = {
  id: string;
  fullName: string;
  title: string | null;
  organization: string | null;
  orgType: OrgType | null;
  domains: string[];
  languages: Language[];
  regions: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  lastVerifiedAt: string;
  isStale: boolean;
  isFictional: boolean;
  relevance: number;
  reason: string;
  contributionType: ContributionType;
};

export type SuggestNoticeCode = "topic_not_identified" | "no_matching_experts";

export type SuggestNotice = {
  code: SuggestNoticeCode;
  message: string;
};

export type SuggestExpertsResult = {
  suggestions: ExpertSuggestion[];
  detectedDomains: Domain[];
  missingProfiles: string[];
  regionBroadened: boolean;
  mock: boolean;
  usage: AiUsage | null;
  attempts: number;
  candidateCount: number;
  suggestionCount: number;
  notice?: SuggestNotice;
};

type CandidateEntry = {
  ref: string;
  expert: ExpertRow;
};

const NOTICE_MESSAGES: Record<Language, Record<SuggestNoticeCode, string>> = {
  mg: {
    topic_not_identified:
      "Tsy afaka namantatra ny sehatra resahina ity lohahevitra ity. Ampidiro fanazavana bebe kokoa.",
    no_matching_experts:
      "Tsy misy manam-pahaizana mifanaraka amin'ity lohahevitra ity ao amin'ny tahiry.",
  },
  fr: {
    topic_not_identified:
      "Impossible d'identifier un domaine pour ce sujet. Ajoutez des précisions et réessayez.",
    no_matching_experts:
      "Aucun expert de l'annuaire ne correspond à ce sujet avec les filtres demandés.",
  },
  en: {
    topic_not_identified:
      "Could not identify a subject domain for this topic. Add more detail and try again.",
    no_matching_experts:
      "No expert in the directory matches this topic with the requested filters.",
  },
};

function noticeFor(code: SuggestNoticeCode, lang?: Language): SuggestNotice {
  return { code, message: NOTICE_MESSAGES[lang ?? "fr"][code] };
}

function addUsage(current: AiUsage | null, next: AiUsage): AiUsage {
  if (!current) return next;
  return {
    promptTokens: current.promptTokens + next.promptTokens,
    completionTokens: current.completionTokens + next.completionTokens,
    totalTokens: current.totalTokens + next.totalTokens,
  };
}

async function classifyTopic(input: SuggestInput): Promise<{
  domains: string[];
  usage: AiUsage;
  attempts: number;
}> {
  const { data, usage, attempts } = await askJson({
    system: CLASSIFY_TOPIC_SYSTEM_PROMPT,
    user: buildClassifyTopicUserMessage({ topic: input.topic, context: input.context }),
    schema: topicClassificationSchema,
    maxTokens: CLASSIFY_MAX_TOKENS,
    timeoutMs: CLASSIFY_TIMEOUT_MS,
    outputRetries: 1,
  });
  return { domains: data.domains, usage, attempts };
}

function toRankCandidate(entry: CandidateEntry): RankCandidate {
  const { ref, expert } = entry;
  return {
    ref,
    full_name: expert.full_name,
    title: expert.title,
    organization: expert.organization,
    org_type: expert.org_type,
    domains: expert.domains,
    languages: expert.languages,
    regions: expert.regions,
    bio: expert.bio,
  };
}

async function rankExperts(
  input: SuggestInput,
  entries: CandidateEntry[],
): Promise<{ ranking: ExpertRanking; usage: AiUsage; attempts: number }> {
  const { data, usage, attempts } = await askJson({
    system: RANK_EXPERTS_SYSTEM_PROMPT,
    user: buildRankExpertsUserMessage({
      topic: input.topic,
      context: input.context,
      candidates: entries.map(toRankCandidate),
      lang: input.lang,
    }),
    schema: expertRankingSchema,
    maxTokens: RANK_MAX_TOKENS,
    timeoutMs: RANK_TIMEOUT_MS,
    outputRetries: 1,
  });
  return { ranking: data, usage, attempts };
}

function isStale(lastVerifiedAt: string): boolean {
  const verifiedAt = Date.parse(lastVerifiedAt);
  if (Number.isNaN(verifiedAt)) return true;
  return Date.now() - verifiedAt > STALE_AFTER_DAYS * 24 * 60 * 60 * 1_000;
}

function sanitizeReason(reason: string): string {
  return reason
    .replace(EMAIL_PATTERN, "[contact removed]")
    .replace(PHONE_PATTERN, "[contact removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REASON_LENGTH);
}

function looksLikeProperName(value: string): boolean {
  const capitalizedWords = value.match(CAPITALIZED_WORD_PATTERN) ?? [];
  if (capitalizedWords.length < 2) return false;
  return !GENERIC_PROFILE_WORD_PATTERN.test(value);
}

function sanitizeMissingProfiles(profiles: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const profile of profiles) {
    const value = profile.replace(/\s+/g, " ").trim();
    if (value.length < 3 || value.length > 160) continue;
    if (EMAIL_PATTERN.test(value) || PHONE_PATTERN.test(value)) continue;
    if (looksLikeProperName(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= MAX_MISSING_PROFILES) break;
  }

  return result;
}

function toSuggestion(expert: ExpertRow, ranked: RankedSuggestion): ExpertSuggestion {
  return {
    id: expert.id,
    fullName: expert.full_name,
    title: expert.title,
    organization: expert.organization,
    orgType: expert.org_type,
    domains: expert.domains,
    languages: expert.languages,
    regions: expert.regions,
    contactEmail: expert.contact_email,
    contactPhone: expert.contact_phone,
    lastVerifiedAt: expert.last_verified_at,
    isStale: isStale(expert.last_verified_at),
    isFictional: expert.is_fictional,
    relevance: ranked.relevance,
    reason: sanitizeReason(ranked.reason),
    contributionType: ranked.contributionType,
  };
}

export async function suggestExperts(
  supabase: SupabaseClient,
  input: SuggestInput,
): Promise<SuggestExpertsResult> {
  const mock = isMockMode();
  let usage: AiUsage | null = null;
  let attempts = 0;
  let detectedDomains: Domain[];

  if (mock) {
    detectedDomains = detectMockDomains(input.topic, input.context);
  } else {
    const classification = await classifyTopic(input);
    detectedDomains = filterDomains(classification.domains);
    usage = classification.usage;
    attempts = classification.attempts;
  }

  if (detectedDomains.length === 0) {
    return {
      suggestions: [],
      detectedDomains,
      missingProfiles: [],
      regionBroadened: false,
      mock,
      usage,
      attempts,
      candidateCount: 0,
      suggestionCount: 0,
      notice: noticeFor("topic_not_identified", input.lang),
    };
  }

  const { experts, regionBroadened } = await findExpertCandidates(supabase, {
    domains: detectedDomains,
    region: input.region,
    languages: input.languages,
  });

  if (experts.length === 0) {
    return {
      suggestions: [],
      detectedDomains,
      missingProfiles: [],
      regionBroadened,
      mock,
      usage,
      attempts,
      candidateCount: 0,
      suggestionCount: 0,
      notice: noticeFor("no_matching_experts", input.lang),
    };
  }

  const entries: CandidateEntry[] = experts.map((expert, index) => ({
    ref: `c${index + 1}`,
    expert,
  }));

  let ranking: ExpertRanking;
  if (mock) {
    ranking = buildMockRanking(
      entries.map(({ ref, expert }) => ({
        ref,
        domains: expert.domains,
        lastVerifiedAt: expert.last_verified_at,
      })),
      detectedDomains,
      input.limit,
      input.lang,
    );
  } else {
    const ranked = await rankExperts(input, entries);
    ranking = ranked.ranking;
    usage = addUsage(usage, ranked.usage);
    attempts += ranked.attempts;
  }

  const kept = applySuggestionGuard(
    ranking.suggestions,
    new Set(entries.map((entry) => entry.ref)),
    input.limit,
  );
  const expertsByRef = new Map(entries.map((entry) => [entry.ref, entry.expert]));
  const suggestions = kept.flatMap((ranked) => {
    const expert = expertsByRef.get(ranked.ref);
    return expert ? [toSuggestion(expert, ranked)] : [];
  });

  return {
    suggestions,
    detectedDomains,
    missingProfiles: sanitizeMissingProfiles(ranking.missingProfiles),
    regionBroadened,
    mock,
    usage,
    attempts,
    candidateCount: experts.length,
    suggestionCount: suggestions.length,
  };
}
