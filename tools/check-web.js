/*
 * Проверка собранной веб-версии: открывает publish/web/index.html,
 * запускает пример, проверяет консоль и пиксели на мониторе.
 * Запуск: npx electron tools/check-web.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false }
  });

  const rel = process.argv[2] || 'publish/web/index.html';
  const file = path.resolve(__dirname, '..', rel);
  await win.loadFile(file);
  await wait(2500);

  const result = await win.webContents.executeJavaScript(`
    (function () {
      var out = { url: location.href, LunaApp: typeof window.LunaApp };
      if (!window.LunaApp) return out;
      window.LunaApp.loadCode([
        'function onTick() end',
        'function onDraw()',
        '  screen.setColor(255, 0, 0)',
        '  screen.drawRectF(0, 0, 20, 10)',
        '  print("привет из веб-версии")',
        'end'
      ].join('\\n'), 'check');
      window.LunaApp.run();
      return out;
    })();
  `, true);
  console.log('загрузка: ' + JSON.stringify(result));

  await wait(1500);

  const probe = await win.webContents.executeJavaScript(`
    (function () {
      var con = document.getElementById('console');
      var cv = document.getElementById('monitor');
      var painted = null;
      if (cv && cv.getContext) {
        var ctx = cv.getContext('2d');
        var d = ctx.getImageData(0, 0, Math.min(20, cv.width), Math.min(10, cv.height)).data;
        painted = 0;
        for (var i = 0; i < d.length; i += 4) {
          if (d[i] > 100 && d[i + 1] < 80 && d[i + 2] < 80) painted++;
        }
      }
      return {
        consoleText: con ? con.innerText.slice(0, 200) : '(нет #console)',
        monitor: cv ? (cv.width + 'x' + cv.height) : '(нет #monitor)',
        redPixels: painted,
        tabs: document.querySelectorAll('nav.tabs button').length
      };
    })();
  `, true);

  console.log('консоль: ' + JSON.stringify(probe.consoleText));
  console.log('монитор: ' + probe.monitor + ', красных пикселей: ' + probe.redPixels);
  console.log('вкладок: ' + probe.tabs);

  const ok = probe.redPixels > 100 && probe.tabs === 6;
  console.log(ok ? 'РЕЗУЛЬТАТ: OK — веб-версия рисует и печатает' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
