/*
 * Проверяет папку publish/hosting так, как её увидит посетитель:
 * поднимает локальный веб-сервер и открывает лендинг через http://.
 * Смотрит, включилась ли кнопка скачивания и отвечает ли сам установщик.
 *
 * Запуск: npx electron tools/check-hosting.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const DIR = path.resolve(__dirname, '..', process.argv[2] || 'publish/hosting');
const PORT = 8099;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.exe': 'application/octet-stream'
};

function serve(req, res) {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/') rel = '/index.html';
  const file = path.join(DIR, rel);
  if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const st = fs.statSync(file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Accept-Ranges': 'bytes'
  });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  if (!fs.existsSync(path.join(DIR, 'index.html'))) {
    console.error('нет ' + DIR + ' — сначала npm run hosting');
    app.exit(1); return;
  }

  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  // 1. отдаётся ли сам установщик
  const head = await new Promise((resolve) => {
    http.request({ host: '127.0.0.1', port: PORT, path: '/Luna-IDE-Setup-1.1.0.exe', method: 'HEAD' },
      (res) => { resolve({ status: res.statusCode, size: +res.headers['content-length'] }); res.resume(); })
      .on('error', () => resolve({ status: 0 })).end();
  });
  console.log('файл установщика по HTTP: ' + head.status + ', ' +
    (head.size ? (head.size / 1048576).toFixed(1) + ' МБ' : '—'));

  // 2. что видит посетитель на странице
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  await win.loadURL('http://127.0.0.1:' + PORT + '/index.html');
  await wait(1800);

  const ui = await win.webContents.executeJavaScript(`
    (function () {
      var b = document.getElementById('dlWin');
      return {
        href: b ? b.getAttribute('href') : null,
        text: b ? b.innerText : null,
        disabled: b ? b.getAttribute('aria-disabled') : null,
        web: (document.getElementById('dlWeb') || {}).getAttribute
              ? document.getElementById('dlWeb').getAttribute('href') : null,
        note: (document.getElementById('linkNote') || {}).textContent || ''
      };
    })();
  `, true);

  console.log('кнопка скачивания: ' + JSON.stringify(ui.text) + ' → ' + ui.href +
    (ui.disabled ? '  [выключена]' : '  [включена]'));
  console.log('кнопка веб-версии: ' + ui.web);
  console.log('пояснение: ' + ui.note.trim().slice(0, 120));

  const hasInstaller = ui.href === 'Luna-IDE-Setup-1.1.0.exe' && !ui.disabled;
  const soonMode = ui.href === '#install' && ui.disabled;
  const webOk = ui.web === 'app/index.html';
  const ok = (hasInstaller || soonMode) && webOk;
  console.log(hasInstaller
    ? 'РЕЖИМ: установщик лежит рядом — кнопка включена'
    : 'РЕЖИМ: установщика рядом нет — кнопка в режиме «скоро» (это правильно)');
  console.log(ok ? 'РЕЗУЛЬТАТ: OK — лендинг работает в обоих случаях'
                 : 'РЕЗУЛЬТАТ: ПРОВАЛ');

  win.destroy();
  server.close();
  setTimeout(() => app.exit(ok ? 0 : 1), 300);
}).catch((e) => { console.error(e); app.exit(1); });
