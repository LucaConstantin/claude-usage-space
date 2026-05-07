// One-time script to generate a B&W PNG icon (no dependencies)
const fs = require('fs');
const path = require('path');

function createPNG(width, height, pixels) {
  // pixels is Uint8Array of RGBA
  const { deflateSync } = require('zlib');

  function crc32(buf) {
    let c = 0xffffffff;
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let cc = n;
      for (let k = 0; k < 8; k++) cc = cc & 1 ? 0xedb88320 ^ (cc >>> 1) : cc >>> 1;
      table[n] = cc;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crcB = Buffer.alloc(4);
    crcB.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, typeB, data, crcB]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT - filter rows
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // no filter
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * (1 + width * 4) + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }
  const compressed = deflateSync(raw);

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = chunk('IHDR', ihdr);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Generate 256x256 B&W icon - a clean minimal star/sparkle
const size = 256;
const pixels = new Uint8Array(size * size * 4);

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const off = (y * size + x) * 4;
    const cx = (x - size / 2) / (size / 2);
    const cy = (y - size / 2) / (size / 2);
    const dist = Math.sqrt(cx * cx + cy * cy);
    const angle = Math.atan2(cy, cx);

    // 4-pointed star with soft glow
    const star4 = Math.pow(Math.cos(angle * 2), 2);
    const starRadius = 0.25 + 0.35 * star4;

    // Cross spikes (thinner, longer)
    const spike = Math.max(
      Math.exp(-Math.abs(cx) * 8) * Math.exp(-Math.abs(cy) * 1.5),
      Math.exp(-Math.abs(cy) * 8) * Math.exp(-Math.abs(cx) * 1.5)
    );

    // Central bright core
    const core = Math.max(0, 1 - dist / starRadius);
    const coreBright = Math.pow(core, 1.5);

    // Soft outer glow
    const glow = Math.exp(-dist * 3) * 0.3;

    const brightness = Math.min(1, coreBright + spike * 0.6 + glow);

    if (brightness > 0.01) {
      const v = Math.round(brightness * 255);
      pixels[off] = v;
      pixels[off + 1] = v;
      pixels[off + 2] = v;
      pixels[off + 3] = Math.round(Math.min(1, brightness * 1.5) * 255);
    } else {
      pixels[off] = 0;
      pixels[off + 1] = 0;
      pixels[off + 2] = 0;
      pixels[off + 3] = 0;
    }
  }
}

const png = createPNG(size, size, pixels);
fs.writeFileSync(path.join(__dirname, 'assets', 'icon.png'), png);
console.log('Generated assets/icon.png (' + png.length + ' bytes)');
