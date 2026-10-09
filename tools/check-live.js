/*
 * Проверка ЖИВОЙ страницы по адресу (например, GitHub Pages):
 * включилась ли кнопка скачивания и куда ведёт кнопка веб-версии.
 *
 * Запуск: npx electron tools/check-live.js https://логин.github.io/репозиторий/
 */
'use strict';
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const URL = process.argv[2];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  if (!URL) { console.error('укажите адрес страницы'); app.exit(1); return; }

  const win = new BrowserWindow({
    width: 1280, height: 800, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  await win.loadURL(URL);
  await wait(2500);

  const ui = await win.webContents.executeJavaScript(`
    (function () {
      var d = document.getElementById('dlWin'), w = document.getElementById('dlWeb');
      return {
        title: document.title,
        dl: d ? d.getAttribute('href') : null,
        dlText: d ? d.innerText : null,
        dlDisabled: d ? d.getAttribute('aria-disabled') : null,
        dlTarget: d ? d.getAttribute('target') : null,
        web: w ? w.getAttribute('href') : null,
        note: (document.getElementById('linkNote') || {}).textContent || ''
      };
    })();
  `, true);

  console.log('страница: ' + ui.title);
  console.log('кнопка скачивания: «' + ui.dlText + '» → ' + ui.dl +
    (ui.dlDisabled ? '  [выключена]' : '  [включена]'));
  console.log('кнопка веб-версии: ' + ui.web);
  console.log('пояснение: ' + String(ui.note).trim().slice(0, 140));

  const ok = ui.dl && ui.dl.indexOf('/releases/') !== -1 && !ui.dlDisabled;
  console.log(ok ? 'РЕЗУЛЬТАТ: OK — кнопка ведёт на релиз с установщиком'
                 : 'РЕЗУЛЬТАТ: ПРОВАЛ — кнопка не активна или ведёт не туда');
  win.destroy();
  setTimeout(() => app.exit(ok ? 0 : 1), 200);
}).catch((e) => { console.error('не удалось открыть страницу: ' + e.message); app.exit(1); });
