import credits from "@/data/image-credits.json";

export type LandingImage = (typeof credits.images)[number];

export const IMAGE_CREDITS = credits;

export const FLOATER_IMAGES: LandingImage[] = credits.images.filter((image) => image.file.includes("/f"));

export const TRAIL_IMAGES: LandingImage[] = credits.images.filter((image) => image.file.includes("/t"));
