import type { VerifyTextSuccess } from "@/lib/api/contract";

export type Decision = "validate" | "complete" | "reject";

export type SavedReport = {
  id: string;
  savedAt: string;
  title: string;
  mode: "text" | "url";
  mock: boolean;
  result: VerifyTextSuccess["result"];
  meta: VerifyTextSuccess["meta"];
  decisions: Record<string, Decision>;
};

export const DOSSIERS_KEY = "checkeko:dossiers:v1";
const CHANGE_EVENT = "checkeko:dossiers";
const MAX_REPORTS = 50;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRaw(): string | null {
  try {
    return storage()?.getItem(DOSSIERS_KEY) ?? null;
  } catch {
    return null;
  }
}

export function parseReports(raw: string | null): SavedReport[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (r): r is SavedReport =>
        typeof r === "object" && r !== null && typeof r.id === "string" && typeof r.savedAt === "string" && typeof r.result === "object",
    );
  } catch {
    return [];
  }
}

function write(reports: SavedReport[]): boolean {
  try {
    storage()?.setItem(DOSSIERS_KEY, JSON.stringify(reports.slice(0, MAX_REPORTS)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function subscribeReports(notify: () => void): () => void {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
  };
}

export function reportTitle(result: VerifyTextSuccess["result"]): string {
  const base = result.claims[0]?.text || result.summary;
  return base.length > 120 ? `${base.slice(0, 117)}…` : base;
}

export function saveReport(report: Omit<SavedReport, "id" | "savedAt">): SavedReport | null {
  const saved: SavedReport = { ...report, id: crypto.randomUUID(), savedAt: new Date().toISOString() };
  return write([saved, ...parseReports(readRaw())]) ? saved : null;
}

export function updateDecisions(id: string, decisions: Record<string, Decision>): void {
  write(parseReports(readRaw()).map((r) => (r.id === id ? { ...r, decisions } : r)));
}

export function removeReport(id: string): void {
  write(parseReports(readRaw()).filter((r) => r.id !== id));
}

export type ReportLabels = {
  status: (status: string) => string;
  decision: (decision: Decision) => string;
  globalIndex: string;
  sources: string;
  limitations: string;
  savedOn: string;
};

export function reportToText(report: SavedReport, labels: ReportLabels): string {
  const lines: string[] = [];
  lines.push(`CHECKEKO — ${labels.savedOn} ${report.savedAt.slice(0, 10)}`);
  if (report.meta.analyzedUrl) lines.push(report.meta.analyzedUrl);
  lines.push("", report.result.summary, "", `${labels.globalIndex}: ${report.result.globalIndex}/100`, "");
  report.result.claims.forEach((claim, i) => {
    const decision = report.decisions[String(i)];
    lines.push(`${i + 1}. [${labels.status(claim.status)}] ${claim.confidenceIndex}/100${decision ? ` — ${labels.decision(decision)}` : ""}`);
    lines.push(`   ${claim.text}`);
    lines.push(`   ${claim.rationale}`);
    if (claim.sources.length) {
      lines.push(`   ${labels.sources}:`);
      claim.sources.forEach((s) => lines.push(`   - ${s.title} (${s.publisher}${s.date ? `, ${s.date}` : ""}) ${s.url}`));
    }
    lines.push("");
  });
  if (report.result.limitations.length) {
    lines.push(`${labels.limitations}:`);
    report.result.limitations.forEach((l) => lines.push(`- ${l}`));
  }
  return lines.join("\n");
}
