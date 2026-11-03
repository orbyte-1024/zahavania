export type ImageMetadata = {
  available: boolean;
  dateTaken: string | null;
  creationDate: string | null;
  camera: string | null;
  software: string | null;
  hasGPS: boolean;
};

export const EXIF_PICKED_TAGS = ["DateTimeOriginal", "CreateDate", "Make", "Model", "Software", "GPSLatitude", "GPSLongitude"];

export const EXIF_PARSE_OPTIONS = { pick: EXIF_PICKED_TAGS, reviveValues: false, translateValues: false } as const;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cameraName(make: string | null, model: string | null): string | null {
  if (!make) return model;
  if (!model) return make;
  return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
}

export function emptyMetadata(): ImageMetadata {
  return { available: false, dateTaken: null, creationDate: null, camera: null, software: null, hasGPS: false };
}

export function summarizeExifTags(parsed: Readonly<Record<string, unknown>>): ImageMetadata {
  const metadata: ImageMetadata = {
    available: false,
    dateTaken: text(parsed.DateTimeOriginal),
    creationDate: text(parsed.CreateDate),
    camera: cameraName(text(parsed.Make), text(parsed.Model)),
    software: text(parsed.Software),
    hasGPS:
      parsed.GPSLatitude !== undefined ||
      parsed.GPSLongitude !== undefined ||
      parsed.latitude !== undefined ||
      parsed.longitude !== undefined,
  };
  metadata.available =
    metadata.dateTaken !== null || metadata.creationDate !== null || metadata.camera !== null || metadata.software !== null || metadata.hasGPS;
  return metadata;
}
