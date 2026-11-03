import raw from "@/data/stats.json";
import { parseStats, type StatsData } from "@/lib/stats";

export const STATS: StatsData = parseStats(raw);
