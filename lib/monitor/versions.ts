import type { MonitorAnalysis } from "@/lib/ai/schemas";
import type { MonitorArticle, MonitorEvent, MonitorVersions } from "@/lib/monitor/types";

export function pendingVersions(event: Pick<MonitorEvent, "sourceCount">): MonitorVersions {
  return {
    coverage: event.sourceCount === 1 ? "single_source" : "not_analysed",
    summary: null,
    sharedFacts: [],
    divergences: [],
    limitations: [],
  };
}

export type VersionAnalysisResult = {
  versions: Map<string, MonitorVersions>;
  analysedEventIds: string[];
  droppedPositions: number;
};

export function applyVersionAnalysis(
  analysis: MonitorAnalysis,
  events: MonitorEvent[],
  articlesById: ReadonlyMap<string, MonitorArticle>,
): VersionAnalysisResult {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const versions = new Map<string, MonitorVersions>();
  const analysedEventIds: string[] = [];
  let droppedPositions = 0;

  for (const entry of analysis.events) {
    const event = eventsById.get(entry.eventId);
    if (!event || versions.has(event.id)) continue;

    const allowed = new Set(event.articleIds);
    const divergences: MonitorVersions["divergences"] = [];

    for (const divergence of entry.divergences) {
      const seen = new Set<string>();
      const positions: MonitorVersions["divergences"][number]["positions"] = [];

      for (const candidate of divergence.positions) {
        if (!allowed.has(candidate.articleId) || seen.has(candidate.articleId)) {
          droppedPositions += 1;
          continue;
        }
        const article = articlesById.get(candidate.articleId);
        if (!article) {
          droppedPositions += 1;
          continue;
        }
        seen.add(candidate.articleId);
        positions.push({
          articleId: article.id,
          sourceId: article.sourceId,
          sourceName: article.sourceName,
          position: candidate.position,
        });
      }

      const distinctSources = new Set(positions.map((position) => position.sourceId)).size;
      if (positions.length < 2 || distinctSources < 2) continue;
      divergences.push({ point: divergence.point, status: divergence.status, positions });
    }

    versions.set(event.id, {
      coverage: event.sourceCount === 1 ? "single_source" : divergences.length > 0 ? "divergent" : "no_divergence_found",
      summary: entry.summary.trim() || null,
      sharedFacts: entry.sharedFacts.filter((fact) => fact.trim().length > 0),
      divergences,
      limitations: entry.limitations.filter((limitation) => limitation.trim().length > 0),
    });
    analysedEventIds.push(event.id);
  }

  return { versions, analysedEventIds, droppedPositions };
}

export function eligibleEvents(events: MonitorEvent[], limit: number): MonitorEvent[] {
  return events
    .filter((event) => event.articleCount >= 2 && event.sourceCount >= 2)
    .slice(0, limit);
}
