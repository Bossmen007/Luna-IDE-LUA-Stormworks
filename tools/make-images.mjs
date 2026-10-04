/*
 * Приводит обложки к нужным размерам:
 *   publish/itch/cover.png  → 630×500 (рекомендация itch.io)
 *   publish/site/hero.png   → 1600×900
 * Запуск: node tools/make-images.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// центр-кроп под нужное соотношение + ресайз
function fit(srcPath, dstPath, W, H) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const targetRatio = W / H;
  const srcRatio = src.width / src.height;

  let cw = src.width, ch = src.height, cx = 0, cy = 0;
  if (srcRatio > targetRatio) {
    cw = Math.round(src.height * targetRatio);
    cx = Math.round((src.width - cw) / 2);
  } else {
    ch = Math.round(src.width / targetRatio);
    cy = Math.round((src.height - ch) / 2);
  }

  const out = new PNG({ width: W, height: H });
  const sx = cw / W, sy = ch / H;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const x0 = cx + Math.floor(x * sx), x1 = cx + Math.min(cw, Math.ceil((x + 1) * sx));
      const y0 = cy + Math.floor(y * sy), y1 = cy + Math.min(ch, Math.ceil((y + 1) * sy));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++;
        }
      }
      const o = (y * W + x) * 4;
      out.data[o] = Math.round(r / n);
      out.data[o + 1] = Math.round(g / n);
      out.data[o + 2] = Math.round(b / n);
      out.data[o + 3] = Math.round(a / n);
    }
  }
  fs.writeFileSync(dstPath, PNG.sync.write(out));
  console.log(path.relative(ROOT, dstPath) + '  ' + W + 'x' + H + '  ' +
    Math.round(fs.statSync(dstPath).size / 1024) + ' KB');
}

const jobs = [
  ['publish/itch/cover.png', 'publish/itch/cover.png', 630, 500],
  ['publish/site/hero.png', 'publish/site/hero.png', 1600, 900]
];

for (const [from, to, w, h] of jobs) {
  const src = path.join(ROOT, from);
  if (!fs.existsSync(src)) { console.warn('нет ' + from); continue; }
  fit(src, path.join(ROOT, to), w, h);
}
