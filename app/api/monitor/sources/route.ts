import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/security/request";

export const maxDuration = 60;

const MONITOR_SOURCES = {
  auditedAt: "2026-11-03T00:00:00Z",
  policy: "title link excerpt only, no full article, no verdict",
  sources: [
    { id: "midi", name: "Midi Madagasikara", homepage: "https://www.midimadagasikara.mg", lang: "fr", scope: "national" },
    { id: "tribune", name: "Madagascar Tribune", homepage: "https://www.madagastribune.com", lang: "fr", scope: "national" },
    { id: "newsmada", name: "Newsmada", homepage: "https://newsmada.com", lang: "mg", scope: "national" },
    { id: "rfi", name: "RFI", homepage: "https://www.rfi.fr", lang: "fr", scope: "international" },
    { id: "allafrica", name: "AllAfrica", homepage: "https://allafrica.com", lang: "en", scope: "international" },
  ],
  regions: [
    { id: "analamanga", name: "Analamanga", districts: ["Antananarivo", "Antsirabe"] },
    { id: "ava", name: "Atsimo-Andrefana", districts: ["Toliara"] },
    { id: "boeny", name: "Boeny", districts: ["Mahajanga"] },
    { id: "diana", name: "Diana", districts: ["Antsiranana"] },
  ],
  themes: ["politics", "economy", "agriculture", "health", "education", "security_justice", "infrastructure", "energy_mining", "society", "sport", "general"],
  limitations: ["feed_availability_changes", "location_inferred_from_text", "lexical_event_grouping"],
};

export async function GET() {
  return jsonResponse(MONITOR_SOURCES);
}
