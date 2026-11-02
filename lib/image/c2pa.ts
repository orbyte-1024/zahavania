export type C2paResult = {
  manifestPresent: boolean;
  reason?: string;
};

export async function checkC2pa(bytes: Uint8Array): Promise<C2paResult> {
  try {
    const c2pa = await import("c2pa-node");
    const result = await c2pa.read(bytes);
    return {
      manifestPresent: !!(result?.manifest),
    };
  } catch (e: unknown) {
    return {
      manifestPresent: false,
      reason:
        e instanceof Error ? e.message : "Module C2PA indisponible ou erreur",
    };
  }
}
