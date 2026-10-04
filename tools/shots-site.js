/*
 * Снимает лендинг publish/site/index.html на широком и мобильном экране.
 * Запуск: npx electron tools/shots-site.js
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => { /* не выходим: окна закрываем сами по очереди */ });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SITE = path.join(__dirname, '..', 'publish', 'site', 'index.html');
const OUT = path.join(__dirname, '..', 'publish', 'shots');

const SIZES = [
  ['site-desktop.png', 1440, 900],
  ['site-mobile.png', 390, 844]
];

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [file, w, h] of SIZES) {
    const win = new BrowserWindow({
      width: w, height: h, show: false, frame: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false }
    });
    let loaded = false;
    for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
      try {
        await win.loadFile(SITE);
        loaded = true;
      } catch (e) {
        console.error('попытка ' + attempt + ' для ' + file + ': ' + e.message);
        await wait(800);
      }
    }
    if (!loaded) { win.destroy(); continue; }
    await wait(1500);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, file), img.toPNG());
    console.log('OK ' + file + '  ' + w + 'x' + h + '  ' +
      Math.round(fs.statSync(path.join(OUT, file)).size / 1024) + ' KB');
    win.destroy();
  }
  app.quit();
}).catch((e) => { console.error(e); app.exit(1); });
