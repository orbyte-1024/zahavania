import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isRateLimited } from "@/lib/ratelimit";
import { reverseSearchLinks } from "@/lib/reverse-search";
import { acceptUploadedVideo, extractVideoFrames } from "@/lib/media-intake";
import { analyzeImage } from "@/lib/vision-analyzer";
import { buildVerification } from "@/lib/verification-summary";

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

    const frames = extractVideoFrames(result.bytes, result.format);
    const analyses = await Promise.all(
      frames.map((frame) => analyzeImage(frame, "image/png")),
    );

    const validAnalysis = analyses.find((entry) => entry.analysis !== null)?.analysis ?? null;
    const warnings = analyses.flatMap((entry) => entry.warnings);

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
