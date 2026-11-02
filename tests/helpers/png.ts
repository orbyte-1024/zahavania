import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let c = -1;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Builds a valid 1×1 PNG whose total size is exactly `totalBytes`, by sizing a
 * tEXt chunk. Real encoders decode it, unlike a fake header followed by junk,
 * so size boundaries are tested on a file that is genuinely an image.
 */
export function pngOfSize(totalBytes: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // true colour (RGB)
  const idat = deflateSync(Buffer.from([0, 0xff, 0x00, 0x00]));

  const fixed =
    SIGNATURE.length +
    chunk("IHDR", ihdr).length +
    chunk("IDAT", idat).length +
    chunk("IEND", Buffer.alloc(0)).length;
  const textDataBytes = totalBytes - fixed - 12; // chunk overhead: length + type + crc
  if (textDataBytes < 16) throw new Error("pngOfSize: target size too small");

  const text = Buffer.concat([
    Buffer.from("Comment\0", "latin1"),
    Buffer.alloc(textDataBytes - 8, 0x41),
  ]);

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("tEXt", text),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
