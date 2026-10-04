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
  if (!fs.existsSync(exe)) { console.error('нет установщика: ' + exe + ' — сначала npm run installer'); process.exit(1); }

  const notes = [
    '**Луна IDE ' + VERSION + '** — русский редактор Lua для Stormworks.',
    '',
    '- Установщик для Windows 10/11 (x64), ~99 МБ.',
    '- Веб-версия: https://' + OWNER.toLowerCase() + '.github.io/' + REPO + '/',
    '- Внимание: Windows может предупредить SmartScreen («Неизвестный издатель») —',
    '  цифровой подписи нет. Нажмите «Подробнее» → «Выполнить в любом случае».'
  ].join('\n');

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

  // файл с постоянным именем — чтобы ссылка .../releases/latest/download/Luna-IDE-Setup.exe работала всегда
  const buf = fs.readFileSync(exe);
  const assetName = 'Luna-IDE-Setup.exe';
  console.log('загружаю установщик (' + (buf.length / 1048576).toFixed(1) + ' МБ)…');
  for (const a of rel.assets) {
    if (a.name === assetName) {
      await api(a.url, { method: 'DELETE' });
      console.log('  старый файл ' + assetName + ' удалён');
    }
  }
  const up = await fetch(`https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'User-Agent': UA,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(buf.length)
    },
    body: buf
  });
  const upText = await up.text();
  if (!up.ok) throw new Error('загрузка файла: HTTP ' + up.status + ' — ' + upText);
  const asset = JSON.parse(upText);
  console.log('файл загружен: ' + asset.name + '  ' + (asset.size / 1048576).toFixed(1) + ' МБ');
  console.log('ссылка для скачивания:');
  console.log('  https://github.com/' + OWNER + '/' + REPO + '/releases/latest/download/' + assetName);
  console.log('страница релиза: ' + rel.html_url);
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'upload') await cmdUpload(arg);
  else if (cmd === 'pages') await cmdPages();
  else if (cmd === 'release') await cmdRelease();
  else if (cmd === 'status') await cmdStatus();
  else {
    console.log('Команды: status | upload [папка] | pages | release');
    console.log('Пример: node tools/gh-publish.mjs upload');
  }
} catch (e) {
  console.error('ОШИБКА: ' + e.message);
  process.exit(1);
}
