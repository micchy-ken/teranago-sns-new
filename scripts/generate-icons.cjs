const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 table for PNG chunk generation
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const toCrc = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function renderIconPng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const scale = size / 512;
  const radius = 100 * scale;

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 4);
    raw[rowOffset] = 0; // Filter: none
    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      
      let r = 0, g = 0, b = 0, a = 0;
      
      // Rounded rectangle bounds
      let inRect = false;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      if (dx < radius && dy < radius) {
        const dist = Math.hypot(radius - dx, radius - dy);
        if (dist <= radius) inRect = true;
      } else {
        inRect = true;
      }

      if (inRect) {
        // Indigo background: #4f46e5 (79, 70, 229)
        r = 79; g = 70; b = 229; a = 255;

        const sx = x / scale;
        const sy = y / scale;

        // Outer square stroke: 160,160 to 352,352 (width 24)
        const inOuterStroke = (
          (sx >= 148 && sx <= 364 && sy >= 148 && sy <= 364) &&
          !(sx >= 172 && sx <= 340 && sy >= 172 && sy <= 340)
        );

        // Circle: cx=256, cy=200, r=32
        const inCircle = Math.hypot(sx - 256, sy - 200) <= 32;

        // Arc (user shoulders): arc from 200,310 to 312,310
        const inArc = (() => {
          if (sy > 320 || sy < 250 || sx < 190 || sx > 322) return false;
          const ex = (sx - 256) / 56;
          const ey = (sy - 310) / 50;
          const dist = Math.sqrt(ex * ex + ey * ey);
          return dist >= 0.80 && dist <= 1.20 && sy <= 312;
        })();

        if (inOuterStroke || inCircle || inArc) {
          // White iconography
          r = 255; g = 255; b = 255; a = 255;
        }
      }

      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk('IHDR', ihdrData);

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = createChunk('IDAT', compressed);
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const publicDir = path.join(process.cwd(), 'public');
const distDir = path.join(process.cwd(), 'dist');

ensureDir(publicDir);
const pwa192 = renderIconPng(192);
const pwa512 = renderIconPng(512);

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);

if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'pwa-192x192.png'), pwa192);
  fs.writeFileSync(path.join(distDir, 'pwa-512x512.png'), pwa512);
}

console.log(`[PWA Icons] Generated pwa-192x192.png (${pwa192.length} bytes) and pwa-512x512.png (${pwa512.length} bytes) successfully.`);
