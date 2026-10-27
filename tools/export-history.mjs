/*
 * Выгрузка истории проекта в один файл + копия памяти агента.
 *
 * Собирает в export\HISTORY-<дата>.md: журнал, ТЗ, changelog, README,
 * состояние окружения и решений (память агента), тексты постов в Telegram.
 * Память копируется в export\memory\ как есть.
 *
 *   node tools/export-history.mjs
 *   node tools/export-history.mjs --out D:\архив   (другая папка)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const MEM = path.join(os.homedir(), '.agenthere', 'memory', 'ai-developer');

const argv = process.argv.slice(2);
const outIdx = argv.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(argv[outIdx + 1]) : path.join(ROOT, 'export');
fs.mkdirSync(OUT, { recursive: true });

const today = new Date();
// дата по местному времени (toISOString даёт UTC — ночью это «вчера»)
const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const human = today.toLocaleDateString('ru-RU');

function readIf(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').trim();
}

function countFiles(dir) {
  const out = [];
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', 'release', 'export'].includes(it.name)) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) out.push(...countFiles(full));
    else out.push(path.relative(dir, full));
  }
  return out;
}

const parts = [];
const push = (s) => parts.push(s);

push('# История проекта — Луна IDE (' + pkg.productName + ')');
push('');
push('- **Версия:** ' + pkg.version);
push('- **Выгружено:** ' + human + ' (' + iso + ')');
push('- **Папка проекта:** `' + ROOT + '`');
push('- **Канал:** https://t.me/luna_ide');
push('- **Репозиторий:** https://github.com/Bossmen007/Luna-IDE-LUA-Stormworks');
push('- **Страница:** https://bossmen007.github.io/Luna-IDE-LUA-Stormworks/');
push('');
push('> Документ собран автоматически командой `npm run history`.');
push('> Полные переписки с агентом в него не входят — они хранятся в приложении.');
push('');

// 1. Память агента (кросс-проектные факты)
const memFiles = fs.existsSync(MEM)
  ? fs.readdirSync(MEM).filter((f) => f.endsWith('.md')).sort()
  : [];
if (memFiles.length) {
  push('## 1. Память агента');
  push('');
  for (const f of memFiles) {
    const txt = fs.readFileSync(path.join(MEM, f), 'utf8').trim();
    push('### `' + f + '`');
    push('');
    push(txt);
    push('');
  }
}

// 2. Документы проекта — как есть
const docs = ['HANDOVER.md', 'DEV-JOURNAL.md', 'SPEC.md', 'CHANGELOG.md', 'README.md'];
let n = 2;
for (const rel of docs) {
  const txt = readIf(rel);
  if (!txt) continue;
  push('## ' + n + '. ' + rel);
  push('');
  push(txt);
  push('');
  n++;
}

// 3. Тексты постов в Telegram
const tgDir = path.join(ROOT, 'publish', 'tg');
if (fs.existsSync(tgDir)) {
  const posts = fs.readdirSync(tgDir).filter((f) => /\.(txt|md)$/i.test(f)).sort();
  if (posts.length) {
    push('## ' + n + '. Тексты постов в Telegram (`publish/tg/`)');
    push('');
    for (const f of posts) {
      push('### ' + f);
      push('');
      push('```');
      push(fs.readFileSync(path.join(tgDir, f), 'utf8').trim());
      push('```');
      push('');
    }
    n++;
  }
}

// 4. Состав проекта
const all = countFiles(ROOT);
const byExt = {};
for (const f of all) {
  const ext = (path.extname(f) || '(без расширения)').toLowerCase();
  byExt[ext] = (byExt[ext] || 0) + 1;
}
push('## ' + n + '. Состав папки проекта');
push('');
push('Файлов (без node_modules, dist, release): **' + all.length + '**');
push('');
push('| Расширение | Файлов |');
push('|---|---|');
for (const [ext, c] of Object.entries(byExt).sort((a, b) => b[1] - a[1])) {
  push('| ' + ext + ' | ' + c + ' |');
}
push('');

const mdPath = path.join(OUT, 'HISTORY-' + iso + '.md');
fs.writeFileSync(mdPath, parts.join('\n'), 'utf8');

// копия памяти рядом — чтобы её можно было перенести на другую машину
let copied = 0;
if (memFiles.length) {
  const memOut = path.join(OUT, 'memory');
  fs.mkdirSync(memOut, { recursive: true });
  for (const f of memFiles) {
    fs.copyFileSync(path.join(MEM, f), path.join(memOut, f));
    copied++;
  }
}

const kb = (fs.statSync(mdPath).size / 1024).toFixed(0);
console.log('готово.');
console.log('  документ: ' + mdPath + '  (' + kb + ' КБ, ' + parts.length + ' строк)');
if (copied) console.log('  память:   ' + path.join(OUT, 'memory') + '  (' + copied + ' файлов)');
console.log('');
console.log('Архив одним файлом (PowerShell):');
console.log('  Compress-Archive -Path "' + mdPath + '","' + path.join(OUT, 'memory') +
  '" -DestinationPath "' + path.join(OUT, 'Luna-IDE-history-' + iso + '.zip') + '" -Force');
