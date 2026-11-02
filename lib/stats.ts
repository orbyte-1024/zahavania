import { z } from "zod";

export const STALE_AFTER_YEARS = 3;

const localized = z.object({ mg: z.string().min(1), fr: z.string().min(1), en: z.string().min(1) });

const indicatorSchema = z.object({
  id: z.string().min(1),
  label: localized,
  sourceName: z.string().min(1),
  unit: z.enum(["people", "%", "USD"]),
  decimals: z.number().int().min(0).max(3),
  value: z.number().finite(),
  period: z.string().regex(/^\d{4}$/),
  series: z.array(z.object({ year: z.number().int(), value: z.number().finite() })).min(1),
  source: z.object({ publisher: z.string().min(1), url: z.url({ protocol: /^https$/ }), apiUrl: z.url({ protocol: /^https$/ }) }),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const agendaSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: localized,
  organizer: z.string().min(1),
  source: z.object({ url: z.url({ protocol: /^https?$/ }) }),
});

const fileSchema = z.object({
  retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  indicators: z.array(z.unknown()),
  agenda: z.array(z.unknown()),
});

export type Indicator = z.infer<typeof indicatorSchema> & { stale: boolean };
export type AgendaItem = z.infer<typeof agendaSchema>;
export type StatsData = { retrievedAt: string; indicators: Indicator[]; agenda: AgendaItem[] };

export function parseStats(input: unknown): StatsData {
  const file = fileSchema.parse(input);
  const referenceYear = Number(file.retrievedAt.slice(0, 4));
  const indicators = file.indicators.flatMap((entry) => {
    const parsed = indicatorSchema.safeParse(entry);
    if (!parsed.success) return [];
    return [{ ...parsed.data, stale: referenceYear - Number(parsed.data.period) > STALE_AFTER_YEARS }];
  });
  const agenda = file.agenda.flatMap((entry) => {
    const parsed = agendaSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return { retrievedAt: file.retrievedAt, indicators, agenda };
}
