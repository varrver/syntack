/**
 * SYNTACK QA — minimal PNG codec (zero dependencies).
 *
 * Decodes the PNGs Chrome's Page.captureScreenshot produces (bit depth 8,
 * color type 2 RGB / 6 RGBA, non-interlaced) and encodes RGBA output.
 * Uses Node's built-in `zlib` only.
 */

import { inflateSync, deflateSync } from 'node:zlib';

/* ── CRC32 (PNG spec) ── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/* ── Paeth predictor (PNG spec) ── */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode a PNG buffer → { width, height, rgba: Uint8Array (w*h*4) }. */
export function decodePng(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height) throw new Error('PNG missing IHDR');
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const ul = x >= channels ? prev[x - channels] : 0;
      let recon;
      switch (filter) {
        case 0: recon = v; break; // None
        case 1: recon = v + left; break; // Sub
        case 2: recon = v + up; break; // Up
        case 3: recon = v + ((left + up) >> 1); break; // Average
        case 4: recon = v + paeth(left, up, ul); break; // Paeth
        default: throw new Error(`bad filter ${filter}`);
      }
      row[x] = recon & 0xff;
    }
    const out = y * width * 4;
    for (let x = 0; x < width; x++) {
      rgba[out + x * 4] = row[x * channels];
      rgba[out + x * 4 + 1] = row[x * channels + 1];
      rgba[out + x * 4 + 2] = row[x * channels + 2];
      rgba[out + x * 4 + 3] = channels === 4 ? row[x * channels + 3] : 255;
    }
    prev.set(row);
  }
  return { width, height, rgba };
}

/** Encode { width, height, rgba } → PNG buffer (filter None, color type 6). */
export function encodePng({ width, height, rgba }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Compare two RGBA frames (same size). Returns per-pixel max channel delta stats:
 * { same, diffPixels, totalPixels, maxDelta, diffFraction, bbox } where bbox is the
 * bounding box of pixels exceeding `maxDelta` (null when none).
 * `width` must be the real frame width (both frames share it); height is derived.
 */
export function diffRgba(a, b, maxDelta, width) {
  if (a.length !== b.length) throw new Error('size mismatch');
  if (!Number.isInteger(width) || width <= 0) throw new Error('diffRgba: width required');
  let diffPixels = 0;
  let maxDeltaSeen = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  const height = a.length / 4 / width;
  if (!Number.isInteger(height)) throw new Error('diffRgba: length not divisible by width');
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2])
    );
    if (d > maxDeltaSeen) maxDeltaSeen = d;
    if (d > maxDelta) {
      diffPixels++;
      const x = (i / 4) % width;
      const y = Math.floor(i / 4 / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const total = a.length / 4;
  return {
    same: diffPixels === 0,
    diffPixels,
    totalPixels: total,
    maxDelta: maxDeltaSeen,
    diffFraction: diffPixels / total,
    bbox: diffPixels ? { minX, minY, maxX, maxY } : null,
  };
}
