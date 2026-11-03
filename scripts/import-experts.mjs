import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const { validateExperts } = await import("../lib/experts/import.ts");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const file = args.find((arg) => !arg.startsWith("--"));

if (!file) {
  console.error("Usage: npm run experts:import -- <file.csv> [--apply]");
  process.exit(2);
}

const { experts, issues } = validateExperts(readFileSync(file, "utf8"));

for (const issue of issues) console.error(`line ${issue.line} · ${issue.field}: ${issue.message}`);
if (issues.length > 0) {
  console.error(`${issues.length} problem(s): nothing was imported. Fix the file and run again.`);
  process.exit(1);
}

const consented = experts.filter((expert) => expert.consent_status === "granted" || expert.consent_status === "public_info").length;
console.log(`${experts.length} valid row(s), ${consented} visible in suggestions (granted or public_info).`);

if (!apply) {
  console.log("Dry run: nothing written. Add --apply to import.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }) },
});

try {
  const { error } = await supabase.from("experts").upsert(experts, { onConflict: "id" });
  if (error) throw new Error(error.message);
} catch (error) {
  console.error(`Import failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}

console.log(`${experts.length} expert(s) imported or updated.`);
