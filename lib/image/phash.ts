import sharp from "sharp";

export type PhashResult = {
  hash: string;
  distance?: number;
};

export async function computePhash(bytes: Uint8Array): Promise<PhashResult> {
  const buffer = Buffer.from(bytes);
  const resized = await sharp(buffer).greyscale().resize(32, 32, { fit: "fill" }).raw().toBuffer();
  const avg = resized.reduce((s, x) => s + x, 0) / resized.length;
  let bits = 0n;
  for (let i = 0; i < Math.min(resized.length, 64); i++) {
    if (resized[i] >= avg) bits |= 1n << BigInt(i);
  }
  return { hash: bits.toString(16).padStart(16, "0") };
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 999;
  const x = BigInt("0x" + a) ^ BigInt("0x" + b);
  return x.toString(2).split("1").length - 1;
}
