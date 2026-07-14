// Generates placeholder PWA icons (solid brand-color square + white cross
// mark) as real PNGs, using only Node's built-in zlib (no image-lib
// dependency). Swap these for real branded artwork before shipping publicly
// — see README "Icons" note.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
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

function buildPng(size, crossScale) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const armHalf = (size * crossScale) / 2; // half-length of each cross arm
  const armThickness = size * crossScale * 0.32; // thickness of the cross bars

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
    raw[rowStart] = 0; // filter: none
    pixels.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { name: 'icon-192.png', size: 192, scale: 0.55 },
  { name: 'icon-192-maskable.png', size: 192, scale: 0.4 },
  { name: 'icon-512.png', size: 512, scale: 0.55 },
  { name: 'icon-512-maskable.png', size: 512, scale: 0.4 },
];

for (const t of targets) {
  const png = buildPng(t.size, t.scale);
  writeFileSync(path.join(outDir, t.name), png);
  console.log(`Wrote ${t.name} (${png.length} bytes)`);
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#1864AB"/>
  <rect x="28" y="14" width="8" height="36" fill="#fff"/>
  <rect x="14" y="28" width="36" height="8" fill="#fff"/>
</svg>
`;
writeFileSync(path.join(__dirname, '..', 'public', 'favicon.svg'), favicon);
console.log('Wrote favicon.svg');
