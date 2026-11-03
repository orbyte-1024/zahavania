import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BONE = "#15130f";
const INK = "#f0ebe3";
const ACCENT = "#996e52";

function mark(size, safeZone) {
  const inset = size * safeZone;
  const span = size - inset * 2;
  const x = (f) => (inset + span * f).toFixed(1);
  const stroke = (size * 0.075).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BONE}"/>
  <path d="M${x(0.18)} ${x(0.22)} H${x(0.82)} L${x(0.18)} ${x(0.78)} H${x(0.82)}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="bevel" stroke-linecap="butt"/>
  <ellipse cx="${x(0.5)}" cy="${x(0.5)}" rx="${(span * 0.47).toFixed(1)}" ry="${(span * 0.36).toFixed(1)}" fill="none" stroke="${ACCENT}" stroke-width="${(size * 0.022).toFixed(1)}" transform="rotate(-8 ${x(0.5)} ${x(0.5)})"/>
</svg>`;
}

const outputs = [
  { file: "public/icons/icon-192.png", size: 192, safeZone: 0.08 },
  { file: "public/icons/icon-512.png", size: 512, safeZone: 0.08 },
  { file: "public/icons/maskable-512.png", size: 512, safeZone: 0.2 },
  { file: "public/icons/apple-touch-icon.png", size: 180, safeZone: 0.12 },
];

await mkdir("public/icons", { recursive: true });
for (const { file, size, safeZone } of outputs) {
  await writeFile(file, await sharp(Buffer.from(mark(size, safeZone))).png({ compressionLevel: 9 }).toBuffer());
}
