declare module "exifr/dist/lite.esm.mjs" {
  const exifr: { parse: (input: Blob | ArrayBuffer | Uint8Array, options?: Record<string, unknown>) => Promise<Record<string, unknown> | undefined> };
  export default exifr;
}
