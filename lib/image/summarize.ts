import { z } from "zod";

export const SignalStatusSchema = z.enum([
  "non_concluant",
  "indices_de_modification",
  "aucun_indice_detecte",
]);

export type SignalStatus = z.infer<typeof SignalStatusSchema>;

export type Signal = {
  id: string;
  label: string;
  level: "info" | "low" | "medium" | "high";
  detail: string;
  limit: string;
};

export function summarizeSignals(signals: Signal[]): SignalStatus {
  const hasModification = signals.some(
    (s) =>
      s.id.includes("exif") ||
      s.id.includes("c2pa") ||
      s.id.includes("ela") ||
      s.id.includes("metadata"),
  );

  if (hasModification) return "indices_de_modification";

  const hasInfoOnly = signals.every((s) => s.level === "info");
  if (hasInfoOnly) return "aucun_indice_detecte";

  return "non_concluant";
}
