export const MODULE_IDS = ["verify", "image", "monitor", "translate", "experts", "stats", "angles"] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const LIVE_MODULES: ReadonlySet<ModuleId> = new Set(["verify", "image", "translate", "experts", "stats", "angles"]);

export function modulePath(id: ModuleId): string {
  return `/app/${id}`;
}
