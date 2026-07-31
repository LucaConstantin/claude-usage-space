// Generates the PNG icons the Stream Deck manifest needs (no external deps).
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, 'ascii');
  const body = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const c = pixel(x, y, size);
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2]; raw[p++] = c[3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// dark rounded-ish tile with an emerald dot
function tilePixel(x, y, size) {
  const cx = size / 2, cy = size / 2;
  const dx = x - cx, dy = y - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const dot = size * 0.22;
  if (d < dot) {
    const t = 1 - d / dot;
    return [Math.round(52 + t * 40), Math.round(211 + t * 20), Math.round(153 + t * 30), 255];
  }
  // background gradient top→bottom
  const g = y / size;
  return [Math.round(18 - g * 8), Math.round(21 - g * 9), Math.round(27 - g * 12), 255];
}

const dir = path.join(__dirname, 'com.claudeusage.deck.sdPlugin', 'icons');
fs.mkdirSync(dir, { recursive: true });
const files = [
  ['plugin.png', 20], ['plugin@2x.png', 40],
  ['action.png', 20], ['action@2x.png', 40],
  ['key.png', 72], ['key@2x.png', 144]
];
for (const [name, size] of files) {
  fs.writeFileSync(path.join(dir, name), png(size, tilePixel));
  console.log('wrote', name, size + 'x' + size);
}
console.log('done');
