/*
 * Публикация Луна IDE на GitHub БЕЗ установки git — напрямую через GitHub API.
 *
 * Токен берётся из переменной окружения GITHUB_TOKEN или из файла
 * (по умолчанию %LOCALAPPDATA%\Temp\agenthere\github-token.txt).
 * В коде токена нет, в консоль он не печатается.
 *
 * Команды:
 *   node tools/gh-publish.mjs status          состояние репозитория (Pages, релизы)
 *   node tools/gh-publish.mjs upload          залить папку publish/github в репозиторий
 *   node tools/gh-publish.mjs pages           включить GitHub Pages (ветка main, папка /docs)
 *   node tools/gh-publish.mjs release         создать релиз v<версия> и приложить установщик
 *
 * Владелец и репозиторий: переменные GITHUB_OWNER / GITHUB_REPO
 * (по умолчанию Bossmen007 / Luna-IDE-LUA-Stormworks).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = process.env.GITHUB_OWNER || 'Bossmen007';
const REPO = process.env.GITHUB_REPO || 'Luna-IDE-LUA-Stormworks';
const API = 'https://api.github.com';
const UA = 'luna-ide-publish';

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function readToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  const candidates = [
    process.env.GITHUB_TOKEN_FILE,
    path.join(process.env.LOCALAPPDATA || os.homedir(), 'Temp', 'agenthere', 'github-token.txt'),
    path.join(os.homedir(), '.agenthere', 'github-token.txt')
  ].filter(Boolean);
  for (const f of candidates) {
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  }
  console.error('Не найден токен GitHub.\n' +
    'Сохраните его в файл: ' + path.join(process.env.LOCALAPPDATA || os.homedir(), 'Temp', 'agenthere', 'github-token.txt') +
    '\nили задайте переменную окружения GITHUB_TOKEN.');
  process.exit(1);
}

const TOKEN = readToken();

async function api(url, init = {}) {
  const res = await fetch(url.startsWith('http') ? url : API + url, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'User-Agent': UA,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = data && data.message ? data.message : text;
    const err = new Error('HTTP ' + res.status + ' ' + url + ' — ' + msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function walk(dir, base = '') {
  const out = [];
  for (const it of fs.readdirSync(dir)) {
    const full = path.join(dir, it);
    const rel = base ? base + '/' + it : it;
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full, size: st.size });
  }
  return out;
}

async function pool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ---------------- команды ----------------

// выдержка из CHANGELOG.md для указанной версии (для описания релиза)
function changelogFor(version) {
  try {
    const txt = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const parts = txt.split(/\n(?=##\s)/);
    const sec = parts.find((p) => p.trim().startsWith('## v' + version));
    return sec ? sec.split('\n').slice(1).join('\n').trim() : '';
  } catch (e) { return ''; }
}

// Загрузка файла в релиз. Для больших файлов curl.exe надёжнее Node-fetch:
// он умеет повторять попытки при сетевых сбоях (--retry-all-errors) и не «висит»
// на таймаутах. Токен в вывод не попадает.
async function uploadAsset(releaseId, filePath, assetName) {
  const url = `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`;
  const sizeMb = (fs.statSync(filePath).size / 1048576).toFixed(1);
  console.log('  загрузка ' + sizeMb + ' МБ через curl…');
  try {
    const out = execFileSync('curl.exe', [
      '-sS', '--fail-with-body',
      '--retry', '5', '--retry-all-errors', '--retry-delay', '3',
      '-X', 'POST',
      '-H', 'Authorization: Bearer ' + TOKEN,
      '-H', 'User-Agent: ' + UA,
      '-H', 'Content-Type: application/octet-stream',
      '--data-binary', '@' + filePath,
      url
    ], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
    const data = JSON.parse(out);
    if (data && data.id) return data;
    throw new Error('ответ без id: ' + String(out).slice(0, 200));
  } catch (e) {
    // запасной путь: Node-fetch
    console.log('  curl не удался (' + (e.stderr ? String(e.stderr).slice(0, 160) : e.message) + '), пробую fetch…');
    const buf = fs.readFileSync(filePath);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + TOKEN,
        'User-Agent': UA,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buf.length)
      },
      body: buf
    });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' — ' + text);
    return JSON.parse(text);
  }
}

async function cmdStatus() {
  const repo = await api(`/repos/${OWNER}/${REPO}`);
  console.log('репозиторий: ' + repo.full_name + '  (' + (repo.private ? 'приватный' : 'публичный') + ')');
  console.log('ветка по умолчанию: ' + repo.default_branch);
  console.log('размер репозитория: ' + (repo.size / 1024).toFixed(1) + ' МБ');
  console.log('GitHub Pages: ' + (repo.has_pages ? 'включены' : 'выключены'));

  try {
    const p = await api(`/repos/${OWNER}/${REPO}/pages`);
    console.log('  адрес: ' + p.html_url + '  (источник: ' + (p.source && p.source.branch) +
      (p.source && p.source.path ? p.source.path : '') + ')');
    console.log('  статус сборки: ' + (p.status || '—'));
  } catch (e) {
    if (e.status === 404) console.log('  (настройки Pages ещё не заданы)');
    else console.log('  ошибка проверки Pages: ' + e.message);
  }

  const rels = await api(`/repos/${OWNER}/${REPO}/releases`);
  console.log('релизов: ' + rels.length);
  for (const r of rels.slice(0, 3)) {
    console.log('  ' + r.tag_name + ' — файлов: ' + r.assets.length +
      (r.assets.length ? ' (' + r.assets.map((a) => a.name + ', ' + (a.size / 1048576).toFixed(1) + ' МБ').join('; ') + ')' : ''));
  }
}

async function cmdUpload(dirArg) {
  const DIR = path.resolve(ROOT, dirArg || 'publish/github');
  if (!fs.existsSync(DIR)) { console.error('нет папки ' + DIR + ' — сначала npm run github'); process.exit(1); }

  // Пустой репозиторий не принимает дерево файлов: нужен первый коммит.
  let ref0 = null;
  try {
    ref0 = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
    await api(`/repos/${OWNER}/${REPO}/contents/.init`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'Инициализация репозитория',
        content: Buffer.from('init\n').toString('base64')
      })
    });
    console.log('репозиторий инициализирован первым коммитом');
  }

  const files = walk(DIR).filter((f) => f.rel !== 'PUBLISH.md' || true);
  const total = files.reduce((a, b) => a + b.size, 0);
  console.log('загружаю ' + files.length + ' файлов (' + (total / 1048576).toFixed(1) + ' МБ) в ' + OWNER + '/' + REPO);

  let done = 0;
  const tree = await (async () => {
    const entries = [];
    await pool(files, 6, async (f) => {
      const content = fs.readFileSync(f.full).toString('base64');
      const blob = await api(`/repos/${OWNER}/${REPO}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({ content, encoding: 'base64' })
      });
      entries.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha });
      done++;
      if (done % 20 === 0 || done === files.length) console.log('  загружено ' + done + '/' + files.length);
    });
    return entries;
  })();

  const newTree = await api(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ tree })
  });
  console.log('дерево создано: ' + newTree.sha.slice(0, 10));

  // есть ли уже ветка main?
  let parents = [];
  try {
    const ref = await api(`/repos/${OWNER}/${REPO}/git/ref/heads/main`);
    parents = [ref.object.sha];
  } catch (e) {
    // пустой репозиторий — родителей нет
  }

  const commit = await api(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: 'Луна IDE ' + VERSION + ' — редактор Lua для Stormworks',
      tree: newTree.sha,
      parents
    })
  });
  console.log('коммит создан: ' + commit.sha.slice(0, 10));

  if (parents.length) {
    await api(`/repos/${OWNER}/${REPO}/git/refs/heads/main`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false })
    });
  } else {
    await api(`/repos/${OWNER}/${REPO}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha })
    });
  }
  console.log('ветка main обновлена');
  console.log('готово. Проверить: node tools/gh-publish.mjs status');
}

async function cmdPages() {
  const body = JSON.stringify({ source: { branch: 'main', path: '/docs' } });
  try {
    await api(`/repos/${OWNER}/${REPO}/pages`);
    await api(`/repos/${OWNER}/${REPO}/pages`, { method: 'PUT', body });
    console.log('Pages обновлены: ветка main, папка /docs');
  } catch (e) {
    if (e.status === 404) {
      await api(`/repos/${OWNER}/${REPO}/pages`, { method: 'POST', body });
      console.log('Pages включены: ветка main, папка /docs');
    } else {
      throw e;
    }
  }
  const p = await api(`/repos/${OWNER}/${REPO}/pages`);
  console.log('адрес страницы: ' + p.html_url);
  console.log('сборка обычно занимает 1–3 минуты.');
}

async function cmdRelease() {
  const tag = 'v' + VERSION;
  const exe = path.join(ROOT, 'release', `Luna-IDE-Setup-${VERSION}.exe`);
  const yml = path.join(ROOT, 'release', 'latest.yml');
  const blockMap = exe + '.blockmap';
  if (!fs.existsSync(exe)) { console.error('нет установщика: ' + exe + ' — сначала npm run installer'); process.exit(1); }
  if (!fs.existsSync(yml)) { console.error('нет latest.yml: ' + yml + ' — соберите установщик заново (npm run installer)'); process.exit(1); }

  const chlog = changelogFor(VERSION);
  const notes = [
    '**Луна IDE ' + VERSION + '** — русский редактор Lua для Stormworks.',
    '',
    '📣 Telegram-канал (новости и обновления): https://t.me/luna_ide',
    '',
    chlog ? '## Что нового\n\n' + chlog : '',
    '',
    '## Скачать',
    '- **Установщик** для Windows 10/11 (x64), ~99 МБ — файл `Luna-IDE-Setup.exe` ниже.',
    '- **Веб-версия** (без установки): https://' + OWNER.toLowerCase() + '.github.io/' + REPO + '/app/',
    '- **Страница проекта**: https://' + OWNER.toLowerCase() + '.github.io/' + REPO + '/',
    '',
    '> Windows при первом запуске покажет предупреждение SmartScreen («Неизвестный издатель») —',
    '> цифровой подписи нет. Нажмите «Подробнее» → «Выполнить в любом случае».'
  ].filter(Boolean).join('\n');

  let rel;
  try {
    rel = await api(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
    console.log('релиз ' + tag + ' уже есть — обновляю описание');
    rel = await api(`/repos/${OWNER}/${REPO}/releases/${rel.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Луна IDE ' + VERSION, body: notes })
    });
  } catch (e) {
    if (e.status !== 404) throw e;
    rel = await api(`/repos/${OWNER}/${REPO}/releases`, {
      method: 'POST',
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: 'main',
        name: 'Луна IDE ' + VERSION,
        body: notes,
        draft: false,
        prerelease: false
      })
    });
    console.log('релиз ' + tag + ' создан');
  }

  // В релизе три файла:
  //  • Luna-IDE-Setup-<версия>.exe — его скачивает автообновление (имя из latest.yml);
  //  • latest.yml — манифест версии для electron-updater;
  //  • Luna-IDE-Setup.exe — копия с постоянным именем для постоянной ссылки сайта.
  const versionedName = 'Luna-IDE-Setup-' + VERSION + '.exe';
  const assetName = 'Luna-IDE-Setup.exe';
  for (const a of rel.assets) {
    if (/^Luna-IDE-Setup.*\.exe$/i.test(a.name) || /^Luna-IDE-Setup.*\.blockmap$/i.test(a.name) || a.name === 'latest.yml') {
      await api(a.url, { method: 'DELETE' });
      console.log('  удалён старый файл ' + a.name);
    }
  }
  console.log('загружаю установщик (' + (fs.statSync(exe).size / 1048576).toFixed(1) + ' МБ)…');
  const asset = await uploadAsset(rel.id, exe, versionedName);
  console.log('  версия для автообновления: ' + asset.name);
  const ymlAsset = await uploadAsset(rel.id, yml, 'latest.yml');
  console.log('  манифест: ' + ymlAsset.name);
  if (fs.existsSync(blockMap)) {
    const bm = await uploadAsset(rel.id, blockMap, path.basename(blockMap));
    console.log('  блоки для докачки: ' + bm.name);
  }
  const alias = await uploadAsset(rel.id, exe, assetName);
  console.log('  постоянная ссылка: ' + alias.name);
  console.log('ссылки для скачивания:');
  console.log('  https://github.com/' + OWNER + '/' + REPO + '/releases/latest/download/' + assetName);
  console.log('  https://github.com/' + OWNER + '/' + REPO + '/releases/latest/download/' + versionedName);
  console.log('страница релиза: ' + rel.html_url);
}

// Оставляет в релизе осмысленный набор: постоянная копия, версионный файл и latest.yml.
// Лишние дубли (например, от прерванных заливок) удаляются через API.
async function cmdFixAsset() {
  const tag = 'v' + VERSION;
  let rel = await api(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  if (!rel.assets.length) { console.log('в релизе ' + tag + ' нет файлов'); return; }
  const keep = ['Luna-IDE-Setup.exe', 'Luna-IDE-Setup-' + VERSION + '.exe', 'Luna-IDE-Setup-' + VERSION + '.exe.blockmap', 'latest.yml'];
  let removed = 0;
  for (const a of rel.assets) {
    if (/^Luna-IDE-Setup.*\.exe$/i.test(a.name) && keep.indexOf(a.name) === -1) {
      await api(a.url, { method: 'DELETE' });
      console.log('удалён дубль ' + a.name);
      removed++;
    }
  }
  if (!removed) console.log('дублей нет');
  rel = await api(`/repos/${OWNER}/${REPO}/releases/tags/${tag}`);
  console.log('файлов в релизе ' + tag + ': ' + rel.assets.length + ' (' + rel.assets.map((a) => a.name).join(', ') + ')');
  if (!rel.assets.some((a) => a.name === 'latest.yml')) console.log('ВНИМАНИЕ: latest.yml нет — автообновление не увидит версию');
}

async function cmdMeta() {
  const homepage = 'https://' + OWNER.toLowerCase() + '.github.io/' + REPO + '/';
  await api(`/repos/${OWNER}/${REPO}`, {
    method: 'PATCH',
    body: JSON.stringify({
      description: 'Луна IDE — русский редактор Lua для микроконтроллеров Stormworks: ' +
        'запуск и отладка скриптов, виртуальный монитор, справочник API, уроки, конструктор экранов ' +
        'и автоопределение сигналов композита. Windows + веб. Telegram: https://t.me/luna_ide',
      homepage
    })
  });
  const topics = ['stormworks', 'lua', 'ide', 'editor', 'russian', 'modding', 'game-development', 'electron'];
  await api(`/repos/${OWNER}/${REPO}/topics`, {
    method: 'PUT',
    body: JSON.stringify({ names: topics })
  });
  console.log('описание репозитория и теги обновлены: ' + topics.join(', '));
  console.log('домашняя страница: ' + homepage);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'upload') await cmdUpload(arg);
  else if (cmd === 'pages') await cmdPages();
  else if (cmd === 'release') await cmdRelease();
  else if (cmd === 'meta') await cmdMeta();
  else if (cmd === 'fixasset') await cmdFixAsset();
  else if (cmd === 'status') await cmdStatus();
  else {
    console.log('Команды: status | upload [папка] | pages | release | meta | fixasset');
    console.log('Пример: node tools/gh-publish.mjs upload');
  }
} catch (e) {
  console.error('ОШИБКА: ' + e.message);
  process.exit(1);
}
