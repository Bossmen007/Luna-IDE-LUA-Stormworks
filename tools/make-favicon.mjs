/*
 * Делает favicon.png (64×64) и favicon.ico (32×32) из build/icon.png.
 * Запуск: node tools/make-favicon.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'build', 'icon.png');

function resize(png, w, h) {
  const out = new PNG({ width: w, height: h });
  const sx = png.width / w, sy = png.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.min(png.width, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(png.height, Math.ceil((y + 1) * sy));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * png.width + xx) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; a += png.data[i + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

const src = PNG.sync.read(fs.readFileSync(SRC));
console.log('source: ' + src.width + 'x' + src.height);

const png64 = resize(src, 64, 64);
const png32 = resize(src, 32, 32);

fs.writeFileSync(path.join(ROOT, 'favicon.png'), PNG.sync.write(png64));
fs.writeFileSync(path.join(ROOT, 'favicon-32.png'), PNG.sync.write(png32));

// .ico с одной картинкой 32×32 (формат ICO допускает PNG внутри)
const png32buf = PNG.sync.write(png32);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved
header.writeUInt16LE(1, 2);          // type = icon
header.writeUInt16LE(1, 4);          // count
const entry = Buffer.alloc(16);
entry[0] = 32; entry[1] = 32;        // width/height
entry[2] = 0; entry[3] = 0;
entry.writeUInt16LE(1, 4);           // color planes
entry.writeUInt16LE(32, 6);          // bpp
entry.writeUInt32LE(png32buf.length, 8);
entry.writeUInt32LE(6 + 16, 12);     // offset
fs.writeFileSync(path.join(ROOT, 'favicon.ico'), Buffer.concat([header, entry, png32buf]));

console.log('wrote favicon.png, favicon-32.png, favicon.ico');
