/*
 * Собирает папку для своего хостинга (РФ): лендинг + установщик В ОДНОЙ папке.
 * publish/hosting/  ←  содержимое publish/site/  +  Luna-IDE-Setup-<версия>.exe
 *
 * Запуск: node tools/make-hosting.mjs   (или npm run hosting)
 * Дальше: залить содержимое publish/hosting в корень сайта (public_html / www).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'publish', 'site');
const OUT = path.join(ROOT, 'publish', 'hosting');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;
const INSTALLER = `Luna-IDE-Setup-${VERSION}.exe`;
const installerPath = path.join(ROOT, 'release', INSTALLER);

if (!fs.existsSync(SITE)) {
  console.error('нет папки publish/site — сначала соберите лендинг');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(SITE, OUT, { recursive: true });
console.log('hosting/: лендинг скопирован');

if (fs.existsSync(installerPath)) {
  fs.cpSync(installerPath, path.join(OUT, INSTALLER));
  console.log('hosting/: установщик ' + INSTALLER + ' добавлен');
} else {
  console.warn('hosting/: НЕТ ' + INSTALLER + ' — сначала npm run installer');
}

// готовый список того, что лежит в корне (для быстрой проверки при загрузке)
const items = fs.readdirSync(OUT).sort();
console.log('\nСодержимое publish/hosting (это и заливаем на хостинг):');
for (const it of items) {
  const st = fs.statSync(path.join(OUT, it));
  console.log('  ' + (st.isDirectory() ? '[папка] ' : '') + it +
    (st.isDirectory() ? '' : '  ' + (st.size / 1048576).toFixed(2) + ' МБ'));
}

const total = fs.readdirSync(OUT, { recursive: true })
  .map((f) => { try { return fs.statSync(path.join(OUT, f)).size; } catch (e) { return 0; } })
  .reduce((a, b) => a + b, 0);
console.log('\nВсего: ' + (total / 1048576).toFixed(1) + ' МБ');
console.log('Проверка на сервере: npm run check-hosting');
