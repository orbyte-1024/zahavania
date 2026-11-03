import { z } from "zod";
import { languageSchema } from "@/lib/ai/schemas";
import { REGIONS } from "@/lib/constants/regions";
import { MONITOR_THEMES } from "@/lib/monitor/taxonomy";
import { isValidDistrictForRegion, resolveDistrict } from "@/lib/monitor/districts";

export const MONITOR_DEFAULT_SINCE_HOURS = 72;
export const MONITOR_MAX_SINCE_HOURS = 168;
export const MONITOR_DEFAULT_MAX_ARTICLES = 60;
export const MONITOR_MAX_ARTICLES = 120;

export const monitorInputSchema = z
  .object({
    lang: languageSchema.default("mg"),
    articleLang: languageSchema.optional(),
    sourceId: z.string().trim().min(1).max(80).optional(),
    region: z.enum(REGIONS).optional(),
    district: z.string().trim().min(1).max(80).optional(),
    theme: z.enum(MONITOR_THEMES).optional(),
    query: z.string().trim().min(2).max(80).optional(),
    sinceHours: z.number().int().min(6).max(MONITOR_MAX_SINCE_HOURS).default(MONITOR_DEFAULT_SINCE_HOURS),
    maxArticles: z.number().int().min(10).max(MONITOR_MAX_ARTICLES).default(MONITOR_DEFAULT_MAX_ARTICLES),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (!input.district) return;
    if (!resolveDistrict(input.district)) {
      ctx.addIssue({ code: "custom", path: ["district"], message: "unknown district" });
      return;
    }
    if (!isValidDistrictForRegion(input.district, input.region ?? null)) {
      ctx.addIssue({ code: "custom", path: ["district"], message: "district does not belong to the region" });
    }
  });

export type MonitorInput = z.infer<typeof monitorInputSchema>;
export type MonitorInputRaw = z.input<typeof monitorInputSchema>;
