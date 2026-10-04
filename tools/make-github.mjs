/*
 * Собирает чистую папку репозитория для GitHub:
 *   publish/github/  — исходники + docs/ (страница для GitHub Pages) + служебные файлы
 * Без node_modules, dist, release и тяжёлых файлов публикации.
 *
 * Запуск: node tools/make-github.mjs   (или npm run github)
 * Дальше: залить содержимое publish/github в репозиторий на GitHub
 * (можно прямо через браузер: Add file → Upload files, перетащить папку).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'publish', 'github');
const SITE = path.join(ROOT, 'publish', 'site');

// файлы и папки, которые попадают в репозиторий
const FILES = [
  'index.html', 'favicon.png', 'favicon.ico', 'favicon-32.png',
  'electron-main.js', 'preload.js',
  'package.json', 'package-lock.json',
  'start.bat', 'README.md', 'SPEC.md', 'DEV-JOURNAL.md',
  'LICENSE', '.gitignore'
];
const DIRS = ['css', 'js', 'data', 'build', 'tools', '.github'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = path.join(ROOT, f);
  if (!fs.existsSync(src)) { console.warn('нет файла: ' + f); continue; }
  fs.cpSync(src, path.join(OUT, f));
  copied++;
}
for (const d of DIRS) {
  const src = path.join(ROOT, d);
  if (!fs.existsSync(src)) { console.warn('нет папки: ' + d); continue; }
  fs.cpSync(src, path.join(OUT, d), { recursive: true });
  copied++;
}

// docs/ — то, что отдаёт GitHub Pages (страница проекта + веб-версия в docs/app)
if (!fs.existsSync(SITE)) {
  console.error('нет publish/site — сначала npm run release-files');
  process.exit(1);
}
fs.cpSync(SITE, path.join(OUT, 'docs'), { recursive: true });

// инструкция по публикации — одним файлом, чтобы была видна в репозитории
const pubReadme = path.join(ROOT, 'publish', 'README.md');
if (fs.existsSync(pubReadme)) fs.cpSync(pubReadme, path.join(OUT, 'PUBLISH.md'));

console.log('publish/github/ собран (скопировано: ' + copied + ' объектов + docs/)');

// --- итог и проверки ---
function walk(dir, base = '') {
  const out = [];
  for (const it of fs.readdirSync(dir)) {
    const full = path.join(dir, it);
    const rel = base ? base + '/' + it : it;
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, size: st.size });
  }
  return out;
}

const all = walk(OUT);
const total = all.reduce((a, b) => a + b.size, 0);
console.log('файлов: ' + all.length + ', всего: ' + (total / 1048576).toFixed(1) + ' МБ');

// проверки, которые спасают от позора при публикации
const problems = [];
const has = (p) => all.some((f) => f.rel === p);
if (!has('docs/index.html')) problems.push('нет docs/index.html (GitHub Pages не заработает)');
if (!has('docs/app/index.html')) problems.push('нет docs/app/index.html (кнопка веб-версии не заработает)');
if (!has('.gitignore')) problems.push('нет .gitignore');
if (!has('.github/workflows/build-release.yml')) problems.push('нет workflow автосборки');
if (!has('LICENSE')) problems.push('нет LICENSE');

const heavy = all.filter((f) => f.size > 20 * 1048576);
if (heavy.length) problems.push('слишком большие файлы: ' + heavy.map((f) => f.rel).join(', '));
if (all.some((f) => /(^|\/)node_modules\//.test(f.rel))) problems.push('попал node_modules');

console.log('\nВерхний уровень репозитория:');
for (const it of fs.readdirSync(OUT).sort()) {
  console.log('  ' + it + (fs.statSync(path.join(OUT, it)).isDirectory() ? '/' : ''));
}

if (problems.length) {
  console.log('\nПРОБЛЕМЫ:');
  problems.forEach((p) => console.log('  ! ' + p));
  process.exit(1);
}
console.log('\nРЕЗУЛЬТАТ: OK — папка готова к загрузке на GitHub');
