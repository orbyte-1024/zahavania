import "server-only";
import { askJson, isMockMode, type AiUsage } from "@/lib/ai/client";
import { ANGLES_SYSTEM_PROMPT, buildAnglesUserMessage } from "@/lib/ai/prompts/angles";
import {
  anglesOutputSchema,
  type Angle,
  type AnglesInput,
  type AnglesOutput,
} from "@/lib/ai/schemas";
import { readIntEnv } from "@/lib/env";

const ANGLES_TIMEOUT_MS = 45_000;

export type AnglesResult = {
  output: AnglesOutput;
  mock: boolean;
  usage: AiUsage | null;
  attempts: number;
};

// Honest demo output: never presented as a real editorial analysis.
function mockAngles(input: AnglesInput): AnglesResult {
  const confirmed = (input.claims ?? []).filter((claim) => claim.status === "confirmed");
  const toVerifyFirst = (input.claims ?? [])
    .filter((claim) => claim.status !== "confirmed")
    .map((claim) => claim.text);

  const makeAngle = (index: number, format: Angle["format"]): Angle => ({
    title: `Demonstration angle ${index} (USE_MOCK=true)`,
    premise: "Simulated response: no model was called.",
    interviewQuestions: ["Simulated interview question."],
    actorTypes: ["Simulated actor type."],
    dataToFind: ["Simulated data to find."],
    format,
    basedOn: confirmed.slice(0, 1).map((claim) => claim.text),
    toVerifyFirst,
  });

  return {
    output: {
      lang: input.lang,
      angles: [makeAngle(1, "brief"), makeAngle(2, "investigation"), makeAngle(3, "radio_report")],
      limitations: ["Simulated response: not a real editorial analysis."],
    },
    mock: true,
    usage: null,
    attempts: 0,
  };
}

export async function generateAngles(input: AnglesInput): Promise<AnglesResult> {
  if (isMockMode()) return mockAngles(input);

  const { data, usage, attempts } = await askJson({
    system: ANGLES_SYSTEM_PROMPT,
    user: buildAnglesUserMessage(input),
    schema: anglesOutputSchema,
    maxTokens: readIntEnv("AI_MAX_TOKENS", 4_000, 500, 8_000),
    timeoutMs: ANGLES_TIMEOUT_MS,
    outputRetries: 1,
  });

  return { output: data, mock: false, usage, attempts };
}
