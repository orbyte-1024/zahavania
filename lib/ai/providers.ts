import { resolveFallbacks, resolveModel, type AiTask } from "@/lib/ai/models";

export const PROVIDERS = ["openrouter", "groq", "ollama", "opencode", "cloudflare"] as const;

export type ProviderId = (typeof PROVIDERS)[number];

type Env = Readonly<Record<string, string | undefined>>;

type ProviderSpec = {
  baseUrl: (env: Env) => string | null;
  textModel: string | null;
  visionModel: string | null;
  webPlugin: boolean;
  reasoningParam: boolean;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function read(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

const SPECS: Readonly<Record<ProviderId, ProviderSpec>> = {
  openrouter: { baseUrl: (env) => read(env, "LLM_BASE_URL") ?? OPENROUTER_BASE_URL, textModel: null, visionModel: null, webPlugin: true, reasoningParam: true },
  groq: { baseUrl: () => "https://api.groq.com/openai/v1", textModel: "openai/gpt-oss-120b", visionModel: null, webPlugin: false, reasoningParam: false },
  ollama: { baseUrl: () => "https://ollama.com/v1", textModel: "gpt-oss:120b", visionModel: "gemma4:31b", webPlugin: false, reasoningParam: false },
  opencode: { baseUrl: () => "https://opencode.ai/zen/v1", textModel: "big-pickle", visionModel: "nemotron-3.5-super-vl-free", webPlugin: false, reasoningParam: false },
  cloudflare: {
    baseUrl: (env) => {
      const account = read(env, "CLOUDFLARE_ACCOUNT_ID");
      return account ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/v1` : null;
    },
    textModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    visionModel: "@cf/meta/llama-4-scout-17b-16e-instruct",
    webPlugin: false,
    reasoningParam: false,
  },
};

const KEY_PATTERNS: ReadonlyArray<readonly [RegExp, ProviderId]> = [
  [/^sk-or-/, "openrouter"],
  [/^gsk_/, "groq"],
  [/^oc_sk_/, "opencode"],
  [/^cfut_/, "cloudflare"],
  [/^[0-9a-f]{32}\.[A-Za-z0-9_-]+$/, "ollama"],
];

export type ProviderKey = { provider: ProviderId; key: string };

function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

function classify(entry: string): ProviderKey {
  const explicit = /^([a-z]+)[:=](.+)$/.exec(entry);
  if (explicit && isProvider(explicit[1])) return { provider: explicit[1], key: explicit[2].trim() };
  const match = KEY_PATTERNS.find(([pattern]) => pattern.test(entry));
  return { provider: match ? match[1] : "openrouter", key: entry };
}

export function parseProviderKeys(env: Env = process.env): ProviderKey[] {
  const entries = (read(env, "LLM_API_KEY") ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const keys: ProviderKey[] = [];
  for (const entry of entries.map(classify)) {
    if (entry.key === "" || keys.some(({ key }) => key === entry.key)) continue;
    keys.push(entry);
  }
  return keys;
}

export type ModelTarget = {
  id: string;
  provider: ProviderId;
  apiKey: string;
  baseUrl: string;
  model: string;
  webPlugin: boolean;
  reasoningParam: boolean;
};

function providerModel(provider: ProviderId, task: AiTask, env: Env): string | null {
  const prefix = provider.toUpperCase();
  const spec = SPECS[provider];
  if (task === "vision") return read(env, `${prefix}_MODEL_VISION`) ?? spec.visionModel;
  return read(env, `${prefix}_MODEL`) ?? spec.textModel;
}

function modelsFor(provider: ProviderId, task: AiTask, env: Env): string[] {
  if (provider !== "openrouter") {
    const model = providerModel(provider, task, env);
    return model ? [model] : [];
  }
  const primary = resolveModel(task, env);
  return [...(primary ? [primary] : []), ...resolveFallbacks(task, env)];
}

export function resolveTargets(task: AiTask, env: Env = process.env): ModelTarget[] {
  const targets: ModelTarget[] = [];
  parseProviderKeys(env).forEach(({ provider, key }, index) => {
    const spec = SPECS[provider];
    const baseUrl = spec.baseUrl(env);
    if (!baseUrl) return;
    for (const model of modelsFor(provider, task, env)) {
      targets.push({
        id: `${provider}#${index}|${model}`,
        provider,
        apiKey: key,
        baseUrl,
        model,
        webPlugin: spec.webPlugin,
        reasoningParam: spec.reasoningParam,
      });
    }
  });
  return targets;
}

export function webSearchKey(env: Env = process.env): string | null {
  return parseProviderKeys(env).find(({ provider }) => provider === "ollama")?.key ?? null;
}
