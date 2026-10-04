/*
 * Собирает готовые к публикации файлы:
 *   publish/web/        — папка для Netlify Drop (перетащить в браузер)
 *   publish/itch/       — комплект для itch.io (установщик, web.zip, обложка, скриншоты, описание)
 * Запуск: node tools/make-release.mjs  (или npm run release-files)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'publish');
const WEB = path.join(PUB, 'web');
const ITCH = path.join(PUB, 'itch');
const SHOTS = path.join(PUB, 'shots');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

const WEB_ITEMS = ['index.html', 'favicon.png', 'favicon.ico', 'css', 'js', 'data'];

function rm(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
function copy(src, dst) { fs.cpSync(src, dst, { recursive: true }); }

function zipDir(srcDir, outZip) {
  if (fs.existsSync(outZip)) fs.rmSync(outZip, { force: true });
  const cmd = `Compress-Archive -Path '${srcDir}\\*' -DestinationPath '${outZip}' -CompressionLevel Optimal -Force`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', cmd], { stdio: 'inherit' });
}

// --- 1. веб-версия ---
rm(WEB);
fs.mkdirSync(WEB, { recursive: true });
for (const item of WEB_ITEMS) {
  const s = path.join(ROOT, item);
  if (!fs.existsSync(s)) { console.warn('нет файла: ' + item); continue; }
  copy(s, path.join(WEB, item));
}
console.log('web/ собран: ' + WEB_ITEMS.join(', '));

// --- 2. комплект itch.io ---
fs.mkdirSync(ITCH, { recursive: true });

const installer = path.join(ROOT, 'release', `Luna-IDE-Setup-${VERSION}.exe`);
if (fs.existsSync(installer)) {
  copy(installer, path.join(ITCH, `Luna-IDE-Setup-${VERSION}.exe`));
  console.log('itch/: установщик скопирован');
} else {
  console.warn('itch/: НЕТ установщика release\\Luna-IDE-Setup-' + VERSION + '.exe — сначала npm run installer');
}

zipDir(WEB, path.join(ITCH, `luna-ide-web-${VERSION}.zip`));
console.log('itch/: web.zip собран');

// --- 2б. лендинг: кладём веб-версию внутрь сайта, чтобы «Открыть веб-версию»
//        работало без внешних ссылок (site/app/index.html) ---
const SITE = path.join(PUB, 'site');
const SITE_APP = path.join(SITE, 'app');
if (fs.existsSync(SITE)) {
  rm(SITE_APP);
  copy(WEB, SITE_APP);
  if (fs.existsSync(path.join(ROOT, 'favicon.png'))) {
    copy(path.join(ROOT, 'favicon.png'), path.join(SITE, 'favicon.png'));
  }
  const siteShots = path.join(SITE, 'shots');
  fs.mkdirSync(siteShots, { recursive: true });
  if (fs.existsSync(SHOTS)) {
    for (const f of fs.readdirSync(SHOTS)) {
      if (/^\d-.*\.png$/.test(f)) copy(path.join(SHOTS, f), path.join(siteShots, f));
    }
  }
  console.log('site/: веб-версия встроена в site/app/');
} else {
  console.warn('site/: папки нет — пропускаю встраивание веб-версии');
}

// скриншоты в itch/screenshots с понятными именами
const shotsDir = path.join(ITCH, 'screenshots');
fs.mkdirSync(shotsDir, { recursive: true });
const SHOT_NAMES = {
  '1-editor.png': '1-editor.png',
  '2-examples.png': '2-examples.png',
  '3-builder.png': '3-builder.png',
  '4-docs.png': '4-docs.png',
  '5-tutorials.png': '5-tutorials.png'
};
if (fs.existsSync(SHOTS)) {
  for (const [from, to] of Object.entries(SHOT_NAMES)) {
    const s = path.join(SHOTS, from);
    if (fs.existsSync(s)) copy(s, path.join(shotsDir, to));
  }
  console.log('itch/: скриншоты скопированы');
}

// --- 3. итог ---
console.log('\n=== publish/itch ===');
for (const f of fs.readdirSync(ITCH)) {
  const st = fs.statSync(path.join(ITCH, f));
  const size = st.isDirectory() ? '<папка>' : (st.size / 1048576).toFixed(2) + ' МБ';
  console.log('  ' + f + '  ' + size);
}
