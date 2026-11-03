export const AI_TASKS = ["verify", "translate", "vision", "experts", "angles", "monitor"] as const;

export type AiTask = (typeof AI_TASKS)[number];

export const TASK_MODEL_ENV: Readonly<Record<AiTask, string>> = {
  verify: "AI_MODEL_VERIFY",
  translate: "AI_MODEL_TRANSLATE",
  vision: "AI_MODEL_VISION",
  experts: "AI_MODEL_EXPERTS",
  angles: "AI_MODEL_ANGLES",
  monitor: "AI_MODEL_MONITOR",
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

export function resolveFallbacks(task: AiTask, env: Env = process.env): string[] {
  const primary = resolveModel(task, env);
  const listed = (read(env, "AI_FALLBACK_MODELS") ?? "").split(",").map((model) => model.trim());
  const models = [...listed, read(env, "AI_FALLBACK_MODEL") ?? ""].filter((model) => model !== "" && model !== primary);
  return [...new Set(models)];
}

export function resolveFallback(task: AiTask, env: Env = process.env): string | null {
  const fallback = read(env, "AI_FALLBACK_MODEL");
  if (!fallback || fallback === resolveModel(task, env)) return null;
  return fallback;
}
