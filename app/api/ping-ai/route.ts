import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { askJson, isMockMode } from "@/lib/ai/client";
import { PING_SYSTEM, PING_USER } from "@/lib/prompts";
import { clientIp, isRateLimited } from "@/lib/ratelimit";

const PingSchema = z.object({ reponse: z.string().min(1) });

export async function GET(req: NextRequest) {
  if (isRateLimited(clientIp(req))) {
    return NextResponse.json(
      { ok: false, erreur: "Trop de requêtes, réessayez dans une minute" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  if (isMockMode()) {
    return NextResponse.json({
      ok: true,
      mock: true,
      reponse: "Mode simulé actif",
    });
  }

  try {
    const { data: { reponse } } = await askJson({
      system: PING_SYSTEM,
      user: PING_USER,
      schema: PingSchema,
    });
    return NextResponse.json({ ok: true, mock: false, reponse });
  } catch (e) {
    console.error(
      "ping-ai:",
      e instanceof Error ? e.message : "erreur inconnue",
    );
    return NextResponse.json(
      { ok: false, erreur: "Appel IA échoué" },
      { status: 503 },
    );
  }
}
