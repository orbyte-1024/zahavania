import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    url: { type: "string" },
    session: { type: "boolean", default: false },
  },
});

if (!values.url) {
  console.error("Usage: npm run demo:path -- --url <article URL> [--base http://localhost:3000] [--session]");
  process.exit(2);
}

const SCENARIOS = [
  { id: 1, verify: { type: "text", content: "Selon l'INSTAT, plus de 75 % des Malgaches vivaient sous le seuil de pauvreté en 2022." } },
  { id: 2, verify: { type: "text", content: "Nambaran'ny CENI fa i Andry Rajoelina no nandresy tamin'ny fifidianana filoham-pirenena 2023." } },
  { id: 3, verify: { type: "url", content: values.url } },
];

async function anonymousToken() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required with --session");
  const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error("anonymous sign-in failed");
  return body.access_token;
}

const token = values.session ? await anonymousToken() : null;
let failures = 0;

async function post(route, body) {
  const started = Date.now();
  try {
    const response = await fetch(`${values.base}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    const json = await response.json().catch(() => null);
    if (!json?.ok) failures += 1;
    return { status: response.status, json, seconds: ((Date.now() - started) / 1000).toFixed(1) };
  } catch (error) {
    failures += 1;
    return { status: 0, json: null, seconds: ((Date.now() - started) / 1000).toFixed(1), error: error instanceof Error ? error.message : "error" };
  }
}

function origin(json) {
  if (json?.mock) return "MOCK";
  const recordedAt = json?.meta?.recordedAt ?? json?.recordedAt;
  return recordedAt ? `replayed (${recordedAt.slice(0, 10)})` : "live";
}

for (const scenario of SCENARIOS) {
  const verify = await post("/api/verify/text", scenario.verify);
  const claims = verify.json?.result?.claims ?? [];
  console.log(`scenario ${scenario.id} · verify  ${verify.status} ${verify.seconds} s · ${origin(verify.json)} · ${claims.length} claim(s), index ${verify.json?.result?.globalIndex ?? "-"}`);
  if (!verify.json?.ok || claims.length === 0) continue;

  for (const lang of ["fr", "mg"]) {
    const experts = await post("/api/sources/suggest", { topic: claims[0].text.slice(0, 300).trim(), lang, limit: 5 });
    console.log(`  ${lang} · experts ${experts.status} ${experts.seconds} s · ${origin(experts.json)} · ${experts.json?.suggestions?.length ?? experts.json?.error?.code ?? experts.error}`);
    if (!claims.some((claim) => claim.status === "confirmed")) {
      console.log(`  ${lang} · angles  skipped: no confirmed claim, the screen asks for a subject`);
      continue;
    }
    const angles = await post("/api/editorial/angles", { lang, claims: claims.map((claim) => ({ text: claim.text.slice(0, 1000), status: claim.status })) });
    console.log(`  ${lang} · angles  ${angles.status} ${angles.seconds} s · ${origin(angles.json)} · ${angles.json?.angles?.length ?? angles.json?.error?.code ?? angles.error}`);
  }
}

console.log(failures === 0 ? "Demo path OK." : `${failures} request(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
