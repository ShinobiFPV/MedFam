// Generates build/icon.ico (a placeholder brand-color square + white cross,
// matching pwa/scripts/generate-icons.mjs's design) using only Node's built-in
// zlib for the PNG data — no image-editing dependency. Modern Windows (Vista+)
// accepts PNG-encoded frames inside an .ico container for every size, so this
// avoids hand-rolling BMP/DIB encoding entirely.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'build');
mkdirSync(outDir, { recursive: true });

const BG = [0x18, 0x64, 0xab]; // #1864AB
const FG = [0xff, 0xff, 0xff];

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

function buildPng(size) {
  const crossScale = 0.55;
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const armHalf = (size * crossScale) / 2;
  const armThickness = size * crossScale * 0.32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inHorizontalBar = Math.abs(dy) <= armThickness / 2 && Math.abs(dx) <= armHalf;
      const inVerticalBar = Math.abs(dx) <= armThickness / 2 && Math.abs(dy) <= armHalf;
      const isFg = inHorizontalBar || inVerticalBar;
      const color = isFg ? FG : BG;
      const idx = (y * size + x) * 4;
      pixels[idx] = color[0];
      pixels[idx + 1] = color[1];
      pixels[idx + 2] = color[2];
      pixels[idx + 3] = 255;
    }
  }

  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function buildIco(sizes) {
  const images = sizes.map(buildPng);

  const dirHeader = Buffer.alloc(6);
  dirHeader.writeUInt16LE(0, 0); // reserved
  dirHeader.writeUInt16LE(1, 2); // type: icon
  dirHeader.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = [];
  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const png = images[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height (0 = 256)
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // image offset
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([dirHeader, ...entries, ...images]);
}

const ico = buildIco([16, 32, 48, 256]);
writeFileSync(path.join(outDir, 'icon.ico'), ico);
console.log(`Wrote build/icon.ico (${ico.length} bytes)`);
