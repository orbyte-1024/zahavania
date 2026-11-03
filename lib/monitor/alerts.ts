import type { MonitorAlert, MonitorAlertKind, MonitorAlertReasonCode, MonitorEvent } from "@/lib/monitor/types";

const ALERT_LIMIT = 20;
const NEW_EVENT_WINDOW_MS = 6 * 60 * 60 * 1_000;

const SEVERITY_ORDER: Record<MonitorAlert["severity"], number> = { urgent: 0, attention: 1, info: 2 };

function makeAlert(
  event: MonitorEvent,
  kind: MonitorAlertKind,
  severity: MonitorAlert["severity"],
  reason: MonitorAlertReasonCode,
  now: Date,
): MonitorAlert {
  return {
    id: `alert-${kind}-${event.id}`,
    kind,
    severity,
    eventId: event.id,
    title: event.title,
    articleIds: event.articleIds.slice(0, 5),
    createdAt: now.toISOString(),
    reason: { code: reason, articleCount: event.articleCount, sourceCount: event.sourceCount },
  };
}

export function buildAlerts(events: MonitorEvent[], now: Date = new Date()): MonitorAlert[] {
  const alerts: MonitorAlert[] = [];

  for (const event of events) {
    const firstSeen = Date.parse(event.firstSeenAt);
    if (event.articleCount >= 3 && event.sourceCount >= 2 && now.getTime() - firstSeen <= NEW_EVENT_WINDOW_MS) {
      alerts.push(makeAlert(event, "new_event", "attention", "new_event", now));
    }

    if (event.momentum.level === "rising" || event.momentum.level === "surge") {
      const severity = event.momentum.level === "surge" && event.momentum.recentSources >= 2 ? "urgent" : "attention";
      const reason: MonitorAlertReasonCode =
        event.momentum.factors.find((factor) => factor.code === "acceleration") !== undefined
          ? "acceleration"
          : event.momentum.recentSources >= 2
            ? "multiple_sources"
            : "recent_articles";
      alerts.push(makeAlert(event, "rising_event", severity, reason, now));
    }

    if (event.versions.coverage === "divergent") {
      alerts.push(makeAlert(event, "contradictory_versions", "attention", "contradictory_versions", now));
    }
  }

  const unique = new Map<string, MonitorAlert>();
  for (const alert of alerts) if (!unique.has(alert.id)) unique.set(alert.id, alert);

  return [...unique.values()]
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        b.reason.articleCount - a.reason.articleCount ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, ALERT_LIMIT);
}
