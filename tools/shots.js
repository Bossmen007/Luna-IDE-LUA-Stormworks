/*
 * Снимает скриншоты интерфейса Луна IDE для страниц публикации.
 * Запуск: npm run shots   (или: npx electron tools/shots.js)
 * Результат: publish/shots/*.png
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'publish', 'shots');

app.disableHardwareAcceleration();

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// { файл, шаги: [ [код, пауза_после_мс], ... ] } — снимок делается после последнего шага
const SHOTS = [
  {
    file: '1-editor.png',
    steps: [
      [`document.querySelector('nav.tabs button[data-tab="examples"]').click();`, 500],
      [`var ex = document.querySelector('[data-ex="speed"]'); if (ex) ex.click();`, 500],
      [`var v = document.querySelector('.io-entry .io-val');
        if (v) { v.value = '24'; v.dispatchEvent(new Event('input', { bubbles: true })); }
        var r = document.getElementById('btnRun'); if (r) r.click();`, 2400]
    ]
  },
  {
    file: '2-examples.png',
    steps: [
      [`document.querySelector('nav.tabs button[data-tab="examples"]').click();`, 900]
    ]
  },
  {
    file: '3-builder.png',
    steps: [
      [`document.querySelector('nav.tabs button[data-tab="builder"]').click();`, 700],
      [`['bar', 'button', 'text'].forEach(function (k) {
          var b = document.querySelector('[data-add="' + k + '"]'); if (b) b.click();
        });`, 900]
    ]
  },
  {
    file: '4-docs.png',
    steps: [
      [`document.querySelector('nav.tabs button[data-tab="docs"]').click();`, 900]
    ]
  },
  {
    file: '5-tutorials.png',
    steps: [
      [`document.querySelector('nav.tabs button[data-tab="tutorials"]').click();`, 1000]
    ]
  }
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    frame: false,
    backgroundColor: '#0e1015',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(ROOT, 'index.html'));
  await wait(2000); // дать библиотекам прорисоваться

  for (const shot of SHOTS) {
    for (const [js, pause] of shot.steps) {
      try {
        await win.webContents.executeJavaScript(js, true);
      } catch (e) {
        console.error('JS error for ' + shot.file + ': ' + e.message);
      }
      await wait(pause);
    }
    const img = await win.webContents.capturePage();
    const target = path.join(OUT, shot.file);
    fs.writeFileSync(target, img.toPNG());
    const { width, height } = img.getSize();
    console.log('OK ' + shot.file + '  ' + width + 'x' + height + '  ' +
      Math.round(fs.statSync(target).size / 1024) + ' KB');
  }

  win.destroy();
  app.quit();
}

app.whenReady().then(main).catch((e) => { console.error(e); app.exit(1); });
