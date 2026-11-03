import type { NextRequest } from "next/server";
import { z } from "zod";
import { isMockMode } from "@/lib/ai/client";
import { languageSchema } from "@/lib/ai/schemas";
import type { VerifyImageSuccess } from "@/lib/api/contract";
import { readIntEnv } from "@/lib/env";
import { EXIF_UNAVAILABLE_WARNING, readImageMetadata, type ImageMetadata } from "@/lib/exif";
import { acceptUploadedImage } from "@/lib/image-intake";
import { clientIp, createRateLimiter } from "@/lib/security/ratelimit";
import { reverseSearchLinks } from "@/lib/reverse-search";
import { detectAiGeneration } from "@/lib/sightengine";
import { authenticate } from "@/lib/security/auth";
import { errorResponse, jsonResponse, startTimer, tooManyRequests } from "@/lib/security/request";
import { buildVerification, type VisionWarning } from "@/lib/verification-summary";
import { analyzeImage } from "@/lib/vision-analyzer";

export const maxDuration = 180;

const MINUTE_MS = 60_000;

const ipLimiter = createRateLimiter({ name: "verify-image:ip", limit: 10, windowMs: MINUTE_MS });
const userLimiter = createRateLimiter({ name: "verify-image:user", limit: 10, windowMs: MINUTE_MS });
const dailyLimiter = createRateLimiter({
  name: "verify-image:daily",
  limit: readIntEnv("AI_DAILY_LIMIT_PER_USER", 50, 1, 10_000),
  windowMs: 24 * 60 * MINUTE_MS,
});

const shortText = z.string().trim().min(1).max(120).nullable().optional();

const deviceExifSchema = z
  .object({
    dateTaken: shortText,
    creationDate: shortText,
    camera: shortText,
    software: shortText,
    hasGPS: z.boolean().optional(),
  })
  .strict();

const fieldsSchema = z.object({
  lang: languageSchema.default("fr"),
  exif: z
    .string()
    .max(2_000)
    .transform((raw, ctx) => {
      try {
        return deviceExifSchema.parse(JSON.parse(raw));
      } catch {
        ctx.addIssue({ code: "custom", message: "invalid exif field" });
        return z.NEVER;
      }
    })
    .optional(),
});

type LogEntry = { userId: string | null; durationMs: number; status: number; code?: string; metadataSource?: string; analysis?: boolean; aiDetection?: string };

function logRequest(entry: LogEntry) {
  const line = JSON.stringify({ route: "POST /api/verify/image", ...entry });
  if (entry.status >= 500) console.error(line);
  else console.info(line);
}

const MESSAGES: Record<number, string> = {
  400: "The image could not be read.",
  413: "The image is too large.",
  415: "Only JPEG, PNG and WebP images are accepted.",
};

function fromDevice(exif: z.infer<typeof deviceExifSchema>): ImageMetadata | null {
  const metadata: ImageMetadata = {
    available: true,
    dateTaken: exif.dateTaken ?? null,
    creationDate: exif.creationDate ?? null,
    camera: exif.camera ?? null,
    software: exif.software ?? null,
    hasGPS: exif.hasGPS ?? false,
  };
  const hasAny = metadata.dateTaken || metadata.creationDate || metadata.camera || metadata.software || metadata.hasGPS;
  return hasAny ? metadata : null;
}

export async function POST(req: NextRequest) {
  const elapsed = startTimer();
  const ip = clientIp(req);

  const ipCheck = await ipLimiter.check(ip);
  if (!ipCheck.allowed) {
    logRequest({ userId: null, durationMs: elapsed(), status: 429, code: "ip_rate_limited" });
    return jsonResponse(
      { ok: false, error: { code: "rate_limited", message: "Too many requests. Please try again later." }, reverseSearch: reverseSearchLinks() },
      429,
      { "Retry-After": String(ipCheck.retryAfterSeconds) },
    );
  }

  const auth = await authenticate(req);
  if (!auth.ok) {
    const status = auth.reason === "config_missing" ? 503 : 401;
    logRequest({ userId: null, durationMs: elapsed(), status, code: auth.reason });
    return status === 503
      ? errorResponse(503, "auth_unavailable", "Authentication is temporarily unavailable.")
      : errorResponse(401, "unauthorized", "You must be signed in to use this feature.");
  }
  const userKey = auth.demo ? `demo:${ip}` : auth.userId;

  const userCheck = await userLimiter.check(userKey);
  if (!userCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "user_rate_limited" });
    return tooManyRequests(userCheck.retryAfterSeconds, "rate_limited");
  }

  const intake = await acceptUploadedImage(req);
  if (!intake.ok) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: intake.status, code: intake.code });
    return jsonResponse(
      { ok: false, error: { code: intake.code, message: MESSAGES[intake.status] }, reverseSearch: reverseSearchLinks() },
      intake.status,
    );
  }

  const fields = fieldsSchema.safeParse({
    lang: intake.fields.get("lang") ?? undefined,
    exif: intake.fields.get("exif") ?? undefined,
  });
  if (!fields.success) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 400, code: "invalid_input" });
    return jsonResponse({ ok: false, error: { code: "invalid_input", message: "Invalid request.", fields: ["lang", "exif"] } }, 400);
  }

  const dailyCheck = await dailyLimiter.check(userKey);
  if (!dailyCheck.allowed) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 429, code: "daily_quota_exceeded" });
    return tooManyRequests(dailyCheck.retryAfterSeconds, "daily_quota_exceeded");
  }

  try {
    const reverseSearch = reverseSearchLinks();
    const fromFile = await readImageMetadata(intake.bytes, intake.format);
    const device = fields.data.exif ? fromDevice(fields.data.exif) : null;
    const useDevice = !fromFile.metadata.available && device !== null;
    const metadata = useDevice && device ? device : fromFile.metadata;
    const exifWarnings = useDevice ? fromFile.warnings.filter((w) => w.code !== EXIF_UNAVAILABLE_WARNING.code) : fromFile.warnings;
    const metadataSource = fromFile.metadata.available ? "file" : useDevice ? "device" : "none";

    const [vision, detector] = await Promise.all([
      analyzeImage(intake.bytes, intake.format, fields.data.lang),
      detectAiGeneration(intake.bytes, fields.data.lang),
    ]);
    const aiDetection = detector.detection;
    const verification = buildVerification(metadata, exifWarnings, vision.analysis, vision.warnings as VisionWarning[], reverseSearch, aiDetection);
    const aiDetectionLog = aiDetection.status === "ok" ? "ok" : aiDetection.reason;

    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 200, metadataSource, analysis: vision.analysis !== null, aiDetection: aiDetectionLog });
    return jsonResponse({
      ok: true,
      mock: isMockMode(),
      file: { format: intake.format, size: intake.size },
      metadata,
      metadataSource,
      warnings: [...exifWarnings, ...vision.warnings, ...detector.warnings],
      reverseSearch,
      analysis: vision.analysis,
      aiDetection,
      verification: {
        status: verification.status,
        summary: verification.summary,
        supportingEvidence: verification.supportingEvidence,
        contradictoryEvidence: verification.contradictoryEvidence,
        limitations: verification.limitations,
      },
      meta: { durationMs: elapsed() },
    } satisfies VerifyImageSuccess);
  } catch (error) {
    logRequest({ userId: auth.userId, durationMs: elapsed(), status: 500, code: error instanceof Error ? error.name : "unknown" });
    return errorResponse(500, "internal_error", "An unexpected error occurred.");
  }
}
