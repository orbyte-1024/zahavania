import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { checkResponse, rehearsalRow, SCENARIOS } from "./real-mode/checks.mjs";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://localhost:3000" },
    suite: { type: "string", default: "routes" },
    runs: { type: "string", default: "1" },
    url: { type: "string" },
    "max-requests": { type: "string", default: "8" },
  },
});

const base = values.base.replace(/\/+$/, "");
const maxRequests = Number(values["max-requests"]);
let sent = 0;

async function anonymousToken() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`anonymous sign-in failed: HTTP ${response.status} (enable anonymous sign-ins in Supabase)`);
  return (await response.json()).access_token ?? null;
}

const token = await anonymousToken();

async function call(path, body) {
  if (sent >= maxRequests) throw new Error(`request budget of ${maxRequests} reached`);
  sent += 1;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const init = body instanceof FormData ? { body } : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } };
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { method: "POST", ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(320_000) });
  const json = await response.json().catch(() => null);
  return { status: response.status, body: json, durationMs: performance.now() - started };
}

async function imageForm(field, files) {
  const form = new FormData();
  for (const file of files) form.append(field, new Blob([await readFile(file)], { type: "image/jpeg" }), "frame.jpg");
  return form;
}

const ROUTES = [
  ["verify-text", () => call("/api/verify/text", SCENARIOS[1])],
  ["translate", () => call("/api/translate", { sourceLang: "fr", targetLang: "mg", text: "L'Assemblée nationale a adopté la loi de finances 2025." })],
  ["sources-suggest", () => call("/api/sources/suggest", { topic: "Prix du riz à Antananarivo", lang: "fr" })],
  ["angles", () => call("/api/editorial/angles", { subject: "Prix du riz à Antananarivo", lang: "fr" })],
  ["verify-image", async () => {
    const form = await imageForm("image", ["public/images/landing/f02.jpg"]);
    form.append("lang", "fr");
    return call("/api/verify/image", form);
  }],
  ["verify-video", async () => {
    const form = await imageForm("frame", ["public/images/landing/f01.jpg", "public/images/landing/f02.jpg"]);
    form.append("duration", "20");
    form.append("timestamps", "[2, 12]");
    form.append("lang", "fr");
    return call("/api/verify/video", form);
  }],
];

const date = new Date().toISOString().slice(0, 10);
let failures = 0;

if (values.suite === "routes") {
  for (const [route, run] of ROUTES) {
    try {
      const { status, body, durationMs } = await run();
      const result = checkResponse(route, status, body);
      if (!result.ok) failures += 1;
      process.stdout.write(`${result.ok ? "OK    " : "FAILED"} ${route.padEnd(16)} ${(durationMs / 1000).toFixed(1)} s  ${JSON.stringify(result)}\n`);
    } catch (error) {
      failures += 1;
      process.stdout.write(`FAILED ${route.padEnd(16)} ${error.message}\n`);
      if (error.message.includes("budget")) break;
    }
  }
} else if (values.suite === "demo") {
  const scenarios = { ...SCENARIOS, ...(values.url ? { 3: { type: "url", lang: "fr", content: values.url } } : {}) };
  process.stdout.write("| Date | Scenario | Run | Status | Global index | Duration | Notes |\n|---|---|---|---|---|---|---|\n");
  for (const [scenario, input] of Object.entries(scenarios)) {
    for (let run = 1; run <= Number(values.runs); run += 1) {
      try {
        const { status, body, durationMs } = await call("/api/verify/text", input);
        const result = checkResponse("verify-text", status, body);
        if (!result.ok) failures += 1;
        process.stdout.write(`${rehearsalRow({ date, scenario, run, result, durationMs })}\n`);
      } catch (error) {
        failures += 1;
        process.stdout.write(`${rehearsalRow({ date, scenario, run, result: { ok: false, reason: error.message }, durationMs: 0 })}\n`);
        if (error.message.includes("budget")) break;
      }
    }
  }
} else {
  throw new Error(`unknown suite ${values.suite}`);
}

process.stdout.write(`\n${sent} request(s) sent, ${failures} failure(s)\n`);
process.exitCode = failures === 0 ? 0 : 1;
