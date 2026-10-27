/*
 * Проверка блока «Обновления» в настройках:
 *  • в настольной версии карточка видна и показывает версию;
 *  • состояния available/downloading/ready/none/error отрисовываются;
 *  • в браузерной версии (без preload) карточки нет;
 *  • консоль без ошибок.
 * Запуск: npx electron tools/check-update.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

const INDEX = path.resolve(__dirname, '..', 'index.html');
const PRELOAD = path.resolve(__dirname, '..', 'preload.js');

function collectErrors(win) {
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });
  return errors;
}

app.whenReady().then(async () => {
  // ---------- настольная версия ----------
  const win = new BrowserWindow({
    width: 1280, height: 860, show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  const errors = collectErrors(win);
  await win.loadFile(INDEX);
  await wait(1400);

  const desktop = await win.webContents.executeJavaScript(`(function () {
    var card = document.getElementById('updateCard');
    var api = window.lunaDesktop || {};
    document.querySelector('.tabs button[data-tab="settings"]').click();
    return {
      cardShown: !!card && getComputedStyle(card).display !== 'none',
      hasApi: !!(api.updateCheck && api.updateDownload && api.updateInstall && api.updateGet && api.onUpdateState),
      version: document.getElementById('updCurrent').textContent,
      status: document.getElementById('updStatus').textContent
    };
  })()`, true);

  // подсовываем состояния так, как их пришлёт main-процесс
  async function fake(st) {
    win.webContents.send('update:state', st);
    await wait(120);
    return win.webContents.executeJavaScript(`(function () {
      return {
        status: document.getElementById('updStatus').textContent,
        action: document.getElementById('updAction').style.display === 'none' ? '' : document.getElementById('updAction').textContent,
        actionDisabled: document.getElementById('updAction').disabled
      };
    })()`, true);
  }

  const stDev = await fake({ status: 'dev', current: '1.3.0', percent: 0 });
  const verText = await win.webContents.executeJavaScript("document.getElementById('updCurrent').textContent", true);
  const stAvailable = await fake({ status: 'available', version: '1.3.0', current: '1.2.0', percent: 0 });
  const stDownloading = await fake({ status: 'downloading', version: '1.3.0', current: '1.2.0', percent: 42 });
  const stReady = await fake({ status: 'ready', version: '1.3.0', current: '1.2.0', percent: 100 });
  const stNone = await fake({ status: 'none', current: '1.3.0', percent: 0 });

  // ---------- веб-версия (как в браузере: без preload) ----------
  const web = new BrowserWindow({
    width: 1100, height: 800, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false }
  });
  const webErrors = collectErrors(web);
  await web.loadFile(INDEX);
  await wait(1200);
  const webCard = await web.webContents.executeJavaScript(`(function () {
    var card = document.getElementById('updateCard');
    return { exists: !!card, hidden: !card || getComputedStyle(card).display === 'none', desktop: !!window.lunaDesktop };
  })()`, true);

  console.log('настольная: карточка=' + desktop.cardShown + ', api=' + desktop.hasApi);
  console.log('dev:         версия=' + verText + ', статус="' + stDev.status + '"');
  console.log('available:   ' + stAvailable.status + ' | кнопка: ' + stAvailable.action);
  console.log('downloading: ' + stDownloading.status + ' | кнопка: ' + stDownloading.action + ' (disabled=' + stDownloading.actionDisabled + ')');
  console.log('ready:       ' + stReady.status + ' | кнопка: ' + stReady.action);
  console.log('none:        ' + stNone.status);
  console.log('веб-версия: карточка скрыта=' + webCard.hidden + ', lunaDesktop=' + webCard.desktop);

  const checks = {
    'карточка видна в настольной версии': desktop.cardShown,
    'мост обновлений доступен': desktop.hasApi,
    'показана текущая версия': /1\.3\.0/.test(verText),
    'режим разработки объяснён': /установленной версии/.test(stDev.status),
    'available: текст и кнопка «Скачать»': /Доступна версия 1\.3\.0/.test(stAvailable.status) && /Скачать/.test(stAvailable.action),
    'downloading: процент и блокировка': /42%/.test(stDownloading.status) && stDownloading.actionDisabled,
    'ready: кнопка перезапуска': /Обновление 1\.3\.0/.test(stReady.status) && /Перезапустить/.test(stReady.action),
    'none: последняя версия': /последняя версия/i.test(stNone.status),
    'в веб-версии карточки нет': webCard.hidden && !webCard.desktop,
    'нет ошибок консоли (настольная)': errors.length === 0,
    'нет ошибок консоли (веб)': webErrors.length === 0
  };

  let ok = true;
  Object.keys(checks).forEach(function (k) {
    if (!checks[k]) ok = false;
    console.log((checks[k] ? '  OK  ' : '  ПЛОХО ') + k);
  });
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('  консоль: ' + e));
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  web.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
