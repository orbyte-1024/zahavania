import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "assets/zahavania.png";
const BROWN = { r: 57, g: 35, b: 26, alpha: 1 };
const MONOGRAM = { left: 162, top: 704, width: 224, height: 270 };

async function fullLogo(size) {
  return sharp(SOURCE).resize(size, size).flatten({ background: BROWN }).png({ compressionLevel: 9 }).toBuffer();
}

async function paddedLogo(size, scale) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SOURCE).resize(inner, inner).flatten({ background: BROWN }).png().toBuffer();
  const offset = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: BROWN } })
    .composite([{ input: logo, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function monogram(size) {
  const side = Math.max(MONOGRAM.width, MONOGRAM.height);
  const padX = Math.floor((side - MONOGRAM.width) / 2);
  const padY = Math.floor((side - MONOGRAM.height) / 2);
  const margin = Math.round(side * 0.18);
  const glyph = await sharp(SOURCE)
    .extract(MONOGRAM)
    .flatten({ background: BROWN })
    .extend({ top: padY + margin, bottom: side - MONOGRAM.height - padY + margin, left: padX + margin, right: side - MONOGRAM.width - padX + margin, background: BROWN })
    .png()
    .toBuffer();
  return sharp(glyph).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
}

const outputs = [
  ["public/icons/icon-192.png", () => fullLogo(192)],
  ["public/icons/icon-512.png", () => fullLogo(512)],
  ["public/icons/maskable-512.png", () => paddedLogo(512, 0.78)],
  ["public/icons/apple-touch-icon.png", () => fullLogo(180)],
  ["public/icons/favicon-32.png", () => monogram(32)],
  ["public/icons/favicon-48.png", () => monogram(48)],
];

await mkdir("public/icons", { recursive: true });
for (const [file, render] of outputs) await writeFile(file, await render());
