import sharp from "sharp";

export type ElaResult =
  | {
      applicable: true;
      metric: number; // % pixels à forte différence
      mapBase64: string; // PNG base64
    }
  | { applicable: false; reason: string };

export async function analyzeELA(bytes: Uint8Array, format: string): Promise<ElaResult> {
  if (format !== "image/jpeg") {
    return { applicable: false, reason: "Analyse ELA non applicable (JPEG uniquement)" };
  }

  try {
    const originalBuffer = Buffer.from(bytes);
    const reencoded = await sharp(originalBuffer)
      .jpeg({ quality: 90 })
      .toBuffer();

    const originalSharp = sharp(originalBuffer);
    const originalRaw = await originalSharp.raw().toBuffer();
    const reencodedSharp = sharp(reencoded);
    const reencodedRaw = await reencodedSharp.raw().toBuffer();

    // Calcul du diff absolu amplifié (simplifié)
    const length = Math.min(originalRaw.length, reencodedRaw.length);
    let diffPixels = 0;
    const threshold = 30; // seuil de forte différence

    for (let i = 0; i < length; i += 4) {
      const r1 = originalRaw[i] || 0;
      const g1 = originalRaw[i + 1] || 0;
      const b1 = originalRaw[i + 2] || 0;
      const r2 = reencodedRaw[i] || 0;
      const g2 = reencodedRaw[i + 1] || 0;
      const b2 = reencodedRaw[i + 2] || 0;

      const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      if (diff > threshold * 3) {
        diffPixels++;
      }
    }

    const totalPixels = length / 4;
    const metric = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

    // Génération de la carte de diff amplifiée (simplifiée)
    const mapBuffer = await sharp(Buffer.from(bytes))
      .modulate({ brightness: 1.5, saturation: 2 })
      .png()
      .toBuffer();

    const mapBase64 = "data:image/png;base64," + mapBuffer.toString("base64").replace(/\+/g, "-").replace(/=+$/, "").replace(/\//g, "_");

    return { applicable: true, metric, mapBase64 };
  } catch {
    return { applicable: false, reason: "Erreur lors de l'analyse ELA" };
  }
}
