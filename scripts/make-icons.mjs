// Zero-dependency PNG resizer. Node's zlib is the only hard part of reading and
// writing PNG, so decoding + box-filter downscale + re-encode is all local.
// Used to build the iOS home-screen icon and favicons from public/logo-mark.png.
import { readFileSync, writeFileSync } from "fs";
import { inflateSync, deflateSync } from "zlib";

// ---------- CRC32 (PNG chunk checksums) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------- Decode ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error("interlaced PNG unsupported");
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);

  // Apple's iDOT encoder splits the image across MULTIPLE independent zlib
  // streams rather than the single stream the spec requires. Concatenating all
  // IDATs and inflating once only yields the first half. So: accumulate chunks
  // and flush whenever what we hold inflates cleanly as a complete stream.
  const parts = [];
  let cur = [];
  for (const d of idat) {
    cur.push(d);
    try {
      parts.push(inflateSync(Buffer.concat(cur)));
      cur = [];
    } catch {
      /* stream not complete yet — keep accumulating */
    }
  }
  if (cur.length) {
    parts.push(inflateSync(Buffer.concat(cur), { finishFlush: 2 /* Z_SYNC_FLUSH */ }));
  }
  const raw = Buffer.concat(parts);
  const need = height * (width * ({ 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]) + 1);
  if (raw.length < need) {
    throw new Error(`decoded ${raw.length} of ${need} bytes (${parts.length} zlib stream(s))`);
  }
  const bpp = channels;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const line = raw.subarray(rp, rp + stride); rp += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  // Normalise to RGBA
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels, d = i * 4;
    if (channels === 4) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = out[s+3]; }
    else if (channels === 3) { rgba[d] = out[s]; rgba[d+1] = out[s+1]; rgba[d+2] = out[s+2]; rgba[d+3] = 255; }
    else if (channels === 2) { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = out[s+1]; }
    else { rgba[d] = rgba[d+1] = rgba[d+2] = out[s]; rgba[d+3] = 255; }
  }
  return { width, height, rgba };
}

// ---------- Trim fully transparent margins ----------
function trim({ width, height, rgba }) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { width, height, rgba };
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y + minY) * width + minX) * 4, ((y + minY) * width + minX + w) * 4);
  }
  return { width: w, height: h, rgba: out };
}

// ---------- Box-filter downscale, alpha-premultiplied ----------
function resize(src, dw, dh) {
  const { width: sw, height: sh, rgba } = src;
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor((dy * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * sh) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor((dx * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = (y * sw + x) * 4, al = rgba[s + 3] / 255;
          r += rgba[s] * al; g += rgba[s + 1] * al; b += rgba[s + 2] * al; a += rgba[s + 3];
          n++;
        }
      }
      const d = (dy * dw + dx) * 4, avgA = a / n;
      const un = avgA > 0 ? 255 / avgA : 0;
      out[d]     = Math.min(255, Math.round((r / n) * un));
      out[d + 1] = Math.min(255, Math.round((g / n) * un));
      out[d + 2] = Math.min(255, Math.round((b / n) * un));
      out[d + 3] = Math.round(avgA);
    }
  }
  return { width: dw, height: dh, rgba: out };
}

// ---------- Compose onto a square canvas ----------
// `bg` null keeps alpha (favicons); a [r,g,b] flattens it (iOS ignores alpha and
// would otherwise composite the transparent field to black).
function square(src, size, padRatio, bg) {
  const inner = Math.round(size * (1 - padRatio * 2));
  const scale = Math.min(inner / src.width, inner / src.height);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const { rgba: small } = resize(src, w, h); // resize returns {width,height,rgba}
  const out = Buffer.alloc(size * size * 4);
  if (bg) {
    for (let i = 0; i < size * size; i++) {
      out[i * 4] = bg[0]; out[i * 4 + 1] = bg[1]; out[i * 4 + 2] = bg[2]; out[i * 4 + 3] = 255;
    }
  }
  const ox = Math.round((size - w) / 2), oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = ((y + oy) * size + (x + ox)) * 4;
      const a = small[s + 3] / 255;
      if (bg) {
        out[d]     = Math.round(small[s]     * a + out[d]     * (1 - a));
        out[d + 1] = Math.round(small[s + 1] * a + out[d + 1] * (1 - a));
        out[d + 2] = Math.round(small[s + 2] * a + out[d + 2] * (1 - a));
        out[d + 3] = 255;
      } else {
        out[d] = small[s]; out[d + 1] = small[s + 1]; out[d + 2] = small[s + 2]; out[d + 3] = small[s + 3];
      }
    }
  }
  return { width: size, height: size, rgba: out };
}

// ---------- Encode ----------
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ width, height, rgba }, opaque) {
  const ch = opaque ? 3 : 4;
  const stride = width * ch;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4, d = y * (stride + 1) + 1 + x * ch;
      raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
      if (!opaque) raw[d + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Build ----------
const src = trim(decodePng(readFileSync("design-source/logo-mark.png")));
console.log(`source trimmed to ${src.width}x${src.height}`);

// Dark ground matching the app's own backdrop (theme gradB, dark).
const IOS_BG = [10, 15, 21];

const jobs = [
  ["public/apple-touch-icon.png", 180, 0.11, IOS_BG, true],
  ["public/favicon.png",           64, 0.06, null,   false],
  ["public/favicon-32.png",        32, 0.04, null,   false],
  ["public/icon-192.png",         192, 0.11, IOS_BG, true],
  ["public/icon-512.png",         512, 0.11, IOS_BG, true],
  ["public/logo-mark-256.png",    256, 0.0,  null,   false],
];
for (const [path, size, pad, bg, opaque] of jobs) {
  const img = square(src, size, pad, bg);
  const png = encodePng(img, opaque);
  writeFileSync(path, png);
  console.log(`${path.padEnd(30)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB${bg ? "  (opaque)" : ""}`);
}
