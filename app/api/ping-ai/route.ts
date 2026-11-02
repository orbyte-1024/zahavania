import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { askJson, useMock as isMockMode } from "@/lib/llm";

const PingSchema = z.object({ reponse: z.string().min(1) });

const SYSTEM =
  'Réponds uniquement par un objet JSON valide de la forme {"reponse":"..."}.';
const USER =
  "Dis bonjour en malagasy, en français et en anglais, en une seule phrase.";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const hits = new Map<string, { count: number; start: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  for (const [key, entry] of hits) {
    if (now - entry.start >= WINDOW_MS) hits.delete(key);
  }
  const entry = hits.get(ip);
  if (!entry) {
    hits.set(ip, { count: 1, start: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

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
    const { reponse } = await askJson({
      system: SYSTEM,
      user: USER,
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
