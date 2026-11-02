import { NextResponse, type NextRequest } from "next/server";
import type { VideoFormat } from "@/lib/media-intake";
import { acceptUploadedVideo, extractVideoFrames } from "@/lib/media-intake";
import { reverseSearchLinks } from "@/lib/reverse-search";
import { clientIp, isRateLimited } from "@/lib/ratelimit";
import { buildVerification } from "@/lib/verification-summary";
import { analyzeImage } from "@/lib/vision-analyzer";

export async function POST(req: NextRequest) {
  const reverseSearch = reverseSearchLinks();

  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      {
        ok: false,
        erreur: "Trop de requêtes, réessayez dans une minute",
        reverseSearch,
      },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const result = await acceptUploadedVideo(req);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, erreur: result.erreur, reverseSearch },
        { status: result.status },
      );
    }

    if (result.mediaType !== "video") {
      return NextResponse.json(
        { ok: false, erreur: "Format vidéo non pris en charge", reverseSearch },
        { status: 415 },
      );
    }

    const videoFormat = result.format as VideoFormat;
    const frames = extractVideoFrames(result.bytes, videoFormat);
    const analyses = frames.length === 0
      ? []
      : await Promise.all(frames.map((frame) => analyzeImage(frame, "image/png")));

    const warnings = analyses.flatMap((entry) => entry.warnings);
    if (frames.length === 0) {
      warnings.push({
        code: "ANALYSE_IA_NON_DISPONIBLE",
        message: "L’extraction des images-clés de la vidéo est indisponible dans cet environnement. La vérification reste non concluante.",
      });
    }

    const validAnalysis = analyses.find((entry) => entry.analysis !== null)?.analysis ?? null;

    const verification = buildVerification(
      null,
      [],
      validAnalysis,
      warnings,
      reverseSearch,
    );

    return NextResponse.json({
      ok: true,
      file: { format: result.format, size: result.size },
      metadata: null,
      mediaType: "video",
      framesAnalyzed: frames.length,
      warnings,
      reverseSearch,
      analysis: validAnalysis,
      verification,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, erreur: "Vérification impossible", reverseSearch },
      { status: 500 },
    );
  }
}
