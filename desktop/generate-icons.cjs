'use strict';
// Original geometric Hyper H; no downloaded artwork or native conversion tools.
// Run: bun run generate-icons.cjs. PNG/ICO/ICNS containers use only Node built-ins.
const { deflateSync } = require('node:zlib');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const output = path.join(__dirname, 'assets');
mkdirSync(output, { recursive: true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length); name.copy(result, 4); data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), result.length - 4);
  return result;
}
function png(size, template = false) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  // Four-by-four supersampling keeps small tray artwork legible without dependencies.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let alpha = 0, red = 0, green = 0, blue = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const u = (x + (sx + .5) / 4) / size, v = (y + (sy + .5) / 4) / size;
      const h = ((u >= .25 && u <= .39) || (u >= .61 && u <= .75)) && v >= .22 && v <= .78
        || u >= .39 && u <= .61 && Math.abs(v - (.58 - (u - .39) * .72)) < .065;
      const dx = Math.max(.20 - u, 0, u - .80), dy = Math.max(.20 - v, 0, v - .80);
      const background = dx * dx + dy * dy <= .14 * .14;
      if (template ? h : background) {
        alpha++;
        if (!template) { red += h ? 255 : 68; green += h ? 255 : 72; blue += h ? 255 : 220; }
      }
    }
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    if (alpha) { pixels[offset] = Math.round(red / alpha); pixels[offset + 1] = Math.round(green / alpha); pixels[offset + 2] = Math.round(blue / alpha); }
    pixels[offset + 3] = Math.round(alpha / 16 * 255);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const images = new Map(sizes.map(size => [size, png(size)]));
writeFileSync(path.join(output, 'icon.png'), images.get(512));
writeFileSync(path.join(output, 'tray.png'), images.get(32));
writeFileSync(path.join(output, 'trayTemplate.png'), png(18, true));
writeFileSync(path.join(output, 'trayTemplate@2x.png'), png(36, true));
const icoSizes = sizes.filter(size => size <= 256);
const directory = Buffer.alloc(6 + 16 * icoSizes.length);
directory.writeUInt16LE(1, 2); directory.writeUInt16LE(icoSizes.length, 4);
let offset = directory.length;
icoSizes.forEach((size, index) => {
  const entry = 6 + index * 16, image = images.get(size);
  directory[entry] = directory[entry + 1] = size === 256 ? 0 : size;
  directory.writeUInt16LE(1, entry + 4); directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8); directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(path.join(output, 'icon.ico'), Buffer.concat([directory, ...icoSizes.map(size => images.get(size))]));
const entries = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]].map(([type, size]) => {
  const image = images.get(size), header = Buffer.alloc(8);
  header.write(type); header.writeUInt32BE(image.length + 8, 4);
  return Buffer.concat([header, image]);
});
const header = Buffer.alloc(8); header.write('icns'); header.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
writeFileSync(path.join(output, 'icon.icns'), Buffer.concat([header, ...entries]));
console.log('Generated original Hyper icons in desktop/assets');
