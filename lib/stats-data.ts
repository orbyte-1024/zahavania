import agendaRaw from "@/data/agenda.json";
import raw from "@/data/stats.json";
import { parseAgenda, parseStats, type AgendaData, type StatsData } from "@/lib/stats";

export const STATS: StatsData = parseStats(raw);
export const AGENDA: AgendaData = parseAgenda(agendaRaw);
