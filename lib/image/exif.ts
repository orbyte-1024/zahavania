import exifr from "exifr";

export type ExifData = {
  make?: string;
  model?: string;
  dateTimeOriginal?: string;
  hasGPS: boolean;
  software?: string;
  available: boolean;
};

export async function readExif(bytes: Uint8Array): Promise<ExifData> {
  try {
    const parsed = await exifr.parse(Buffer.from(bytes));
    if (!parsed) {
      return {
        available: false,
        hasGPS: false,
      };
    }
    return {
      available: true,
      make: parsed.Make || undefined,
      model: parsed.Model || undefined,
      dateTimeOriginal: parsed.DateTimeOriginal || undefined,
      hasGPS: !!(parsed.latitude || parsed.longitude),
      software: parsed.Software || undefined,
    };
  } catch {
    return {
      available: false,
      hasGPS: false,
    };
  }
}
