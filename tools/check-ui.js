/*
 * Быстрая проверка интерфейсных мелочей: кнопка Telegram, ссылка в настройках,
 * модалка поддержки, ссылка на ТГ в landing-странице.
 * Запуск: npx electron tools/check-ui.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, webPreferences: { contextIsolation: false, nodeIntegration: false } });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });
  await win.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await wait(1600);

  const app1 = await win.webContents.executeJavaScript(`(function () {
    var out = {};
    var tg = document.getElementById('btnTg');
    out.tgExists = !!tg;
    out.tgHref = tg ? tg.getAttribute('href') : '';
    out.tgTarget = tg ? tg.getAttribute('target') : '';
    // ссылка на ТГ в настройках «О программе»
    out.settingsTg = !!document.querySelector('.setting-card a[href="https://t.me/luna_ide"]');
    // модалка поддержки
    var d = document.getElementById('btnDonate'); if (d) d.click();
    out.donateTg = !!document.querySelector('#tgGo');
    if (out.donateTg) { var b = document.querySelector('.modal-back') || document.querySelector('.modal'); if (b) b.remove(); }
    return out;
  })()`, true);

  console.log('кнопка Telegram: ' + app1.tgExists + ', href=' + app1.tgHref + ', target=' + app1.tgTarget);
  console.log('ссылка в настройках: ' + app1.settingsTg + ', кнопка в модалке: ' + app1.donateTg);

  await win.loadFile(path.resolve(__dirname, '..', 'publish', 'site', 'index.html'));
  await wait(800);
  const site1 = await win.webContents.executeJavaScript(`(function () {
    var links = document.querySelectorAll('.tg-link');
    var span = document.querySelector('.pill');
    return { tgLinks: links.length, href: links.length ? links[0].getAttribute('href') : '', pill: span ? span.textContent : '' };
  })()`, true);
  console.log('лендинг: ссылок ТГ ' + site1.tgLinks + ', href=' + site1.href);
  console.log('лендинг, плашка версии: ' + site1.pill);

  const ok = app1.tgExists && app1.tgHref === 'https://t.me/luna_ide' && app1.tgTarget === '_blank' &&
             app1.settingsTg && app1.donateTg && site1.tgLinks >= 3 && /1\.2\.0/.test(site1.pill) &&
             errors.length === 0;
  if (errors.length) console.log('ОШИБКИ КОНСОЛИ: ' + JSON.stringify(errors.slice(0, 5)));
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
