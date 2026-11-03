import { EXIF_PARSE_OPTIONS, summarizeExifTags } from "@/lib/exif-summary";

export const UPLOAD_MAX_EDGE = 2000;
export const UPLOAD_MAX_BYTES = 3_800_000;
export const SOURCE_MAX_BYTES = 40 * 1024 * 1024;
const QUALITIES = [0.85, 0.72, 0.6];

export type DeviceExif = {
  dateTaken: string | null;
  creationDate: string | null;
  camera: string | null;
  software: string | null;
  hasGPS: boolean;
};

export class ImageDecodeError extends Error {
  constructor() {
    super("browser_cannot_decode_image");
    this.name = "ImageDecodeError";
  }
}

export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function toDeviceExif(parsed: Readonly<Record<string, unknown>> | null | undefined): DeviceExif | null {
  if (!parsed) return null;
  const summary = summarizeExifTags(parsed);
  if (!summary.available) return null;
  return {
    dateTaken: summary.dateTaken,
    creationDate: summary.creationDate,
    camera: summary.camera,
    software: summary.software,
    hasGPS: summary.hasGPS,
  };
}

export async function readDeviceExif(file: Blob): Promise<DeviceExif | null> {
  try {
    const { default: exifr } = await import("exifr/dist/lite.esm.mjs");
    return toDeviceExif(await exifr.parse(file, { ...EXIF_PARSE_OPTIONS }));
  } catch {
    return null;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ImageDecodeError())), "image/jpeg", quality);
  });
}

export async function compressImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageDecodeError();
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, UPLOAD_MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageDecodeError();
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    let blob: Blob | null = null;
    for (const quality of QUALITIES) {
      blob = await canvasToBlob(canvas, quality);
      if (blob.size <= UPLOAD_MAX_BYTES) return blob;
    }
    if (blob && blob.size <= UPLOAD_MAX_BYTES) return blob;
    throw new ImageDecodeError();
  } finally {
    bitmap.close();
  }
}
