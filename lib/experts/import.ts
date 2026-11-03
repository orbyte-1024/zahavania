import { createHash } from "node:crypto";
import { z } from "zod";
import { DOMAINS } from "@/lib/constants/domains";
import { REGIONS } from "@/lib/constants/regions";

export const IMPORT_COLUMNS = [
  "full_name",
  "title",
  "organization",
  "org_type",
  "domains",
  "languages",
  "regions",
  "bio",
  "contact_email",
  "contact_phone",
  "consent_status",
  "consent_date",
  "info_source",
  "last_verified_at",
] as const;

const ORG_TYPES = ["public_institution", "ngo", "academic", "private", "association", "independent", "media"] as const;
const CONSENT_STATUSES = ["granted", "public_info", "pending", "revoked"] as const;
const LANGUAGES = ["mg", "fr", "en"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

const list = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform((raw) => raw.split("|").map((item) => item.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.enum(values)));

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(value)), "invalid date")
  .refine((value) => value <= new Date().toISOString().slice(0, 10), "in the future");

const rowSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120),
    title: optionalText(160),
    organization: optionalText(160),
    org_type: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(z.enum(ORG_TYPES).nullable()),
    domains: list(DOMAINS).pipe(z.array(z.enum(DOMAINS)).min(1, "at least one domain")),
    languages: list(LANGUAGES).pipe(z.array(z.enum(LANGUAGES)).min(1, "at least one language")),
    regions: list(REGIONS),
    bio: optionalText(300),
    contact_email: optionalText(200).pipe(z.email().nullable()),
    contact_phone: optionalText(40),
    consent_status: z.enum(CONSENT_STATUSES),
    consent_date: z
      .string()
      .trim()
      .transform((value) => (value === "" ? null : value))
      .pipe(isoDate.nullable()),
    info_source: z.string().trim().min(2, "say where the information comes from").max(200),
    last_verified_at: isoDate,
  })
  .strict();

export type ImportedExpert = z.infer<typeof rowSchema> & { id: string; is_fictional: false };

export type ImportIssue = { line: number; field: string; message: string };

export type ImportResult = { experts: ImportedExpert[]; issues: ImportIssue[] };

function detectDelimiter(source: string): "," | ";" {
  const header = source.split(/\r?\n/, 1)[0] ?? "";
  return (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ";" : ",";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(source);
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export function expertId(fullName: string, organization: string | null): string {
  const key = `${fullName}|${organization ?? ""}`.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const hex = createHash("sha256").update(key).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function validateExperts(text: string): ImportResult {
  const [header, ...lines] = parseCsv(text);
  const issues: ImportIssue[] = [];
  const columns = (header ?? []).map((name) => name.trim().toLowerCase());
  const missing = IMPORT_COLUMNS.filter((name) => !columns.includes(name));
  const unknown = columns.filter((name) => !(IMPORT_COLUMNS as readonly string[]).includes(name));
  for (const name of missing) issues.push({ line: 1, field: name, message: "missing column" });
  for (const name of unknown) issues.push({ line: 1, field: name, message: "unknown column" });
  if (issues.length > 0) return { experts: [], issues };

  const experts: ImportedExpert[] = [];
  const seen = new Map<string, number>();
  lines.forEach((cells, index) => {
    const line = index + 2;
    const raw = Object.fromEntries(columns.map((name, i) => [name, cells[i] ?? ""]));
    const parsed = rowSchema.safeParse(raw);
    const rowIssues: ImportIssue[] = parsed.success
      ? []
      : parsed.error.issues.map((issue) => ({ line, field: issue.path.join(".") || "(row)", message: issue.message }));
    if (raw.consent_status?.trim() === "granted" && !raw.consent_date?.trim()) {
      rowIssues.push({ line, field: "consent_date", message: "required when consent_status is granted" });
    }
    if (!parsed.success || rowIssues.length > 0) {
      issues.push(...rowIssues);
      return;
    }
    const id = expertId(parsed.data.full_name, parsed.data.organization);
    const first = seen.get(id);
    if (first !== undefined) {
      issues.push({ line, field: "full_name", message: `duplicate of line ${first}` });
      return;
    }
    seen.set(id, line);
    experts.push({ ...parsed.data, id, is_fictional: false });
  });
  return { experts, issues };
}
