import { writeFile } from "node:fs/promises";

const COUNTRY = "MDG";
const OUTPUT = new URL("../data/stats.json", import.meta.url);

const INDICATORS = [
  { id: "SP.POP.TOTL", unit: "people", decimals: 0, label: { mg: "Isan'ny mponina", fr: "Population totale", en: "Total population" } },
  { id: "SI.POV.DDAY", unit: "%", decimals: 1, label: { mg: "Fahantrana (latsaky ny 3 $ isan'andro)", fr: "Pauvreté (moins de 3 $ par jour)", en: "Poverty (under $3 a day)" } },
  { id: "NY.GDP.PCAP.CD", unit: "USD", decimals: 0, label: { mg: "PIB isan'olona", fr: "PIB par habitant", en: "GDP per capita" } },
  { id: "FP.CPI.TOTL.ZG", unit: "%", decimals: 1, label: { mg: "Fiakaran'ny vidim-piainana", fr: "Inflation annuelle", en: "Annual inflation" } },
  { id: "SP.URB.TOTL.IN.ZS", unit: "%", decimals: 1, label: { mg: "Mponina an-tanàn-dehibe", fr: "Population urbaine", en: "Urban population" } },
  { id: "IT.NET.USER.ZS", unit: "%", decimals: 1, label: { mg: "Mpampiasa Internet", fr: "Utilisateurs d'Internet", en: "Internet users" } },
  { id: "EG.ELC.ACCS.ZS", unit: "%", decimals: 1, label: { mg: "Fahazoana herinaratra", fr: "Accès à l'électricité", en: "Access to electricity" } },
  { id: "SE.ADT.LITR.ZS", unit: "%", decimals: 1, label: { mg: "Mahay mamaky teny sy manoratra (olon-dehibe)", fr: "Alphabétisation des adultes", en: "Adult literacy" } },
];

async function fetchSeries(id) {
  const url = `https://api.worldbank.org/v2/country/${COUNTRY}/indicator/${id}?format=json&per_page=60`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
  const [meta, rows] = await response.json();
  if (!Array.isArray(rows)) throw new Error(`${id}: no rows`);
  const points = rows
    .filter((row) => typeof row.value === "number")
    .map((row) => ({ year: Number(row.date), value: row.value }))
    .sort((a, b) => a.year - b.year)
    .slice(-10);
  if (points.length === 0) throw new Error(`${id}: no value`);
  return { name: rows[0].indicator.value, points, updatedAt: meta.lastupdated, apiUrl: url };
}

const indicators = [];
for (const indicator of INDICATORS) {
  const series = await fetchSeries(indicator.id);
  const latest = series.points[series.points.length - 1];
  indicators.push({
    id: indicator.id,
    label: indicator.label,
    sourceName: series.name,
    unit: indicator.unit,
    decimals: indicator.decimals,
    value: latest.value,
    period: String(latest.year),
    series: series.points,
    source: {
      publisher: "World Bank — World Development Indicators",
      url: `https://data.worldbank.org/indicator/${indicator.id}?locations=MG`,
      apiUrl: series.apiUrl,
    },
    updatedAt: series.updatedAt,
  });
  process.stdout.write(`${indicator.id} ${latest.year} ${latest.value}\n`);
}

const retrievedAt = new Date().toISOString().slice(0, 10);
await writeFile(OUTPUT, `${JSON.stringify({ retrievedAt, indicators }, null, 2)}\n`);
process.stdout.write(`wrote data/stats.json (${indicators.length} indicators)\n`);
