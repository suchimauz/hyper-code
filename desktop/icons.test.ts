import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const asset = (name: string) => readFileSync(`${import.meta.dir}/assets/${name}`);
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function validatePNG(bytes: Buffer, size: number, template = false) {
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.readUInt32BE(16)).toBe(size); expect(bytes.readUInt32BE(20)).toBe(size);
  expect(bytes[24]).toBe(8); expect(bytes[25]).toBe(6);
  let offset = 8; const compressed: Buffer[] = []; const types: string[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    expect(end).toBeLessThanOrEqual(bytes.length);
    const type = bytes.toString('ascii', offset + 4, offset + 8); types.push(type);
    expect(bytes.readUInt32BE(end - 4)).toBe(crc32(bytes.subarray(offset + 4, end - 4)));
    if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, end - 4));
    offset = end;
  }
  expect(types[0]).toBe('IHDR'); expect(types.at(-1)).toBe('IEND');
  const raw = inflateSync(Buffer.concat(compressed)); expect(raw.length).toBe((size * 4 + 1) * size);
  const alphas = new Set<number>();
  for (let y = 0; y < size; y++) {
    expect(raw[y * (size * 4 + 1)]).toBe(0);
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 4 + 1) + 1 + x * 4; alphas.add(raw[offset + 3]);
      if (template) expect([...raw.subarray(offset, offset + 3)]).toEqual([0, 0, 0]);
    }
  }
  expect(alphas.has(0)).toBe(true); expect(alphas.has(255)).toBe(true);
}
test('app and tray PNGs decode with valid checksums; template is black with transparency', () => {
  validatePNG(asset('icon.png'), 512); validatePNG(asset('tray.png'), 32);
  validatePNG(asset('trayTemplate.png'), 18, true); validatePNG(asset('trayTemplate@2x.png'), 36, true);
});
test('ICO directory offsets, sizes and PNG payloads are valid', () => {
  const ico = asset('icon.ico'); expect(ico.readUInt16LE(0)).toBe(0); expect(ico.readUInt16LE(2)).toBe(1);
  const count = ico.readUInt16LE(4); expect(count).toBe(6); let end = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16, size = ico[entry] || 256, length = ico.readUInt32LE(entry + 8), offset = ico.readUInt32LE(entry + 12);
    expect(offset).toBe(end); expect(ico[entry + 1] || 256).toBe(size); expect(ico.readUInt16LE(entry + 6)).toBe(32);
    validatePNG(ico.subarray(offset, offset + length), size); end = offset + length;
  }
  expect(end).toBe(ico.length);
});
test('ICNS length, supported element types and PNG payloads are valid', () => {
  const icns = asset('icon.icns'); expect(icns.toString('ascii', 0, 4)).toBe('icns'); expect(icns.readUInt32BE(4)).toBe(icns.length);
  const sizes: Record<string, number> = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024 };
  let offset = 8; const seen: string[] = [];
  while (offset < icns.length) {
    const type = icns.toString('ascii', offset, offset + 4), length = icns.readUInt32BE(offset + 4);
    expect(length).toBeGreaterThan(8); expect(sizes[type]).toBeDefined(); seen.push(type);
    validatePNG(icns.subarray(offset + 8, offset + length), sizes[type]); offset += length;
  }
  expect(offset).toBe(icns.length); expect(seen).toEqual(Object.keys(sizes));
});
