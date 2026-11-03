export const SCENARIOS = {
  1: { type: "text", lang: "fr", content: "Selon l'INSTAT, plus de 75 % des Malgaches vivaient sous le seuil de pauvreté en 2022." },
  2: { type: "text", lang: "mg", content: "Nambaran'ny CENI fa i Andry Rajoelina no nandresy tamin'ny fifidianana filoham-pirenena 2023." },
};

const FORBIDDEN_STATUSES = new Set(["true", "false", "vrai", "faux"]);

function fail(reason) {
  return { ok: false, reason };
}

function passed(detail = {}) {
  return { ok: true, ...detail };
}

export function checkEnvelope(status, body) {
  if (typeof body !== "object" || body === null) return fail(`HTTP ${status}, no JSON body`);
  if (body.ok !== true) return fail(`HTTP ${status}, ${body.error?.code ?? "unknown_error"}`);
  if (body.mock === true) return fail("mock answer: USE_MOCK is on, this is not a real-mode run");
  return passed();
}

const ROUTE_CHECKS = {
  "verify-text": (body) => {
    const claims = body.result?.claims;
    if (!Array.isArray(claims) || claims.length === 0) return fail("no claim returned");
    if (claims.some((claim) => FORBIDDEN_STATUSES.has(String(claim.status).toLowerCase()))) return fail("true/false verdict returned");
    const unsourced = claims.filter((claim) => claim.status !== "insufficient" && (!Array.isArray(claim.sources) || claim.sources.length === 0));
    if (unsourced.length > 0) return fail("a conclusive claim has no source");
    return passed({ globalIndex: body.result.globalIndex, claims: claims.length, replayed: body.meta?.replayed === true });
  },
  translate: (body) => {
    if (typeof body.translatedText !== "string" || body.translatedText.trim() === "") return fail("empty translation");
    if (body.needsReview !== true) return fail("Malagasy output must be flagged for review");
    return passed({ length: body.translatedText.length });
  },
  "sources-suggest": (body) => (Array.isArray(body.suggestions) ? passed({ suggestions: body.suggestions.length }) : fail("no suggestion list")),
  angles: (body) => (Array.isArray(body.angles) && body.angles.length > 0 ? passed({ angles: body.angles.length }) : fail("no angle returned")),
  "verify-image": (body) => {
    if (body.analysis === null) return fail("vision analysis unavailable");
    if (body.verification?.status === undefined) return fail("no verification status");
    return passed({ status: body.verification.status });
  },
  "verify-video": (body) => {
    if (!(body.analysedCount > 0)) return fail(`no frame analysed (${body.failedCount ?? "?"} failed)`);
    return passed({ analysed: body.analysedCount, failed: body.failedCount });
  },
  monitor: (body) => {
    if (!Array.isArray(body.articles) || !Array.isArray(body.events) || !Array.isArray(body.alerts)) {
      return fail("missing monitor lists");
    }
    if (body.articles.length === 0) return fail("no article matched");
    if (body.events.length === 0) return fail("no event grouped");
    const coverages = new Set(["divergent", "no_divergence_found", "single_source", "not_analysed"]);
    for (const event of body.events) {
      if (!coverages.has(event.versions?.coverage)) return fail(`unknown versions coverage ${event.versions?.coverage}`);
      if (!(event.momentum?.score >= 0 && event.momentum?.score <= 100)) return fail("momentum outside 0-100");
      if (!Array.isArray(event.sources) || event.sources.length === 0) return fail("event without source");
    }
    if (!["ok", "skipped", "unavailable"].includes(body.meta?.analysis)) return fail("unknown analysis state");
    return passed({ articles: body.articles.length, events: body.events.length, alerts: body.alerts.length, analysis: body.meta.analysis });
  },
};

export function checkResponse(route, status, body) {
  const envelope = checkEnvelope(status, body);
  if (!envelope.ok) return envelope;
  const check = ROUTE_CHECKS[route];
  return check ? check(body) : fail(`unknown route ${route}`);
}

export function rehearsalRow({ date, scenario, run, result, durationMs }) {
  const status = result.ok ? "OK" : "FAILED";
  const index = result.ok && typeof result.globalIndex === "number" ? `${result.globalIndex}/100` : "";
  const notes = result.ok ? (result.replayed ? "replayed recording" : "") : result.reason;
  return `| ${date} | ${scenario} | ${run} | ${status} | ${index} | ${(durationMs / 1000).toFixed(1)} s | ${notes} |`;
}
