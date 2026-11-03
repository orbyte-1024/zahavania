import "server-only";
import { askJson, type AiUsage } from "@/lib/ai/client";
import { buildMonitorUserMessage, MONITOR_SYSTEM_PROMPT } from "@/lib/ai/prompts/monitor";
import { monitorAnalysisSchema, type Language, type MonitorAnalysis } from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";
import type { MonitorArticle, MonitorEvent } from "@/lib/monitor/types";

const MONITOR_TIMEOUT_MS = 60_000;

export type MonitorAiResult = {
  analysis: MonitorAnalysis;
  usage: AiUsage;
  attempts: number;
};

export async function analyseEventVersions(params: {
  events: MonitorEvent[];
  articlesById: ReadonlyMap<string, MonitorArticle>;
  lang: Language;
}): Promise<MonitorAiResult> {
  const { data, usage, attempts } = await askJson({
    task: "monitor",
    system: MONITOR_SYSTEM_PROMPT,
    user: buildMonitorUserMessage(params),
    schema: monitorAnalysisSchema,
    maxTokens: readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000),
    timeoutMs: MONITOR_TIMEOUT_MS,
    outputRetries: 1,
  });

  return { analysis: data, usage, attempts };
}
