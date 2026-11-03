export const AI_TASKS = ["verify", "translate", "vision", "experts", "angles"] as const;

export type AiTask = (typeof AI_TASKS)[number];

export const TASK_MODEL_ENV: Readonly<Record<AiTask, string>> = {
  verify: "AI_MODEL_VERIFY",
  translate: "AI_MODEL_TRANSLATE",
  vision: "AI_MODEL_VISION",
  experts: "AI_MODEL_EXPERTS",
  angles: "AI_MODEL_ANGLES",
};

type Env = Readonly<Record<string, string | undefined>>;

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

export function isAiTask(value: string): value is AiTask {
  return (AI_TASKS as readonly string[]).includes(value);
}

export function resolveModel(task: AiTask, env: Env = process.env): string | null {
  return read(env, TASK_MODEL_ENV[task]) ?? read(env, "AI_MODEL");
}

export function resolveFallback(task: AiTask, env: Env = process.env): string | null {
  const fallback = read(env, "AI_FALLBACK_MODEL");
  if (!fallback || fallback === resolveModel(task, env)) return null;
  return fallback;
}
