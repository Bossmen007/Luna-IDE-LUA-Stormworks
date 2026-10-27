/*
 * Проверка списка мониторов: в игре есть только эти компоненты,
 * 1 блок = 32×32 px, подписи «W×H» совпадают с разрешением.
 *
 * Запуск: npx electron tools/check-monitors.js   (или npm run check-monitors)
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

// Эталон: компонент → разрешение в пикселях
const EXPECTED = [
  ['Monitor 1×1', 32, 32],
  ['Monitor 2×1', 64, 32],
  ['Monitor 2×2', 64, 64],
  ['Monitor 3×1', 96, 32],
  ['Monitor 3×2', 96, 64],
  ['Monitor 3×3', 96, 96],
  ['Monitor 5×3', 160, 96],
  ['Monitor 9×5', 288, 160]
];

const INDEX = path.resolve(__dirname, '..', 'index.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 860, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false }
  });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });

  await win.loadFile(INDEX);
  await wait(1300);

  const data = await win.webContents.executeJavaScript(`(function () {
    var list = (window.LUNA_MONITORS || []).map(function (m) {
      return { label: m.label, w: m.w, h: m.h };
    });
    var sel = document.getElementById('selMonSize');
    var opts = sel ? Array.prototype.map.call(sel.options, function (o) { return o.textContent.trim(); }) : null;
    return { list: list, opts: opts };
  })()`, true);

  let ok = errors.length === 0;

  console.log('мониторов в списке: ' + data.list.length);
  data.list.forEach(function (m, i) {
    const first = m.label.split(' ')[1].split(' ')[0];
    const [bw, bh] = first.split('×').map(Number);
    const sizeOk = m.w === bw * 32 && m.h === bh * 32;
    const labelOk = m.w >= m.h || bw < bh;           // «W×H»: первое число — ширина
    console.log('  ' + (i + 1) + '. ' + m.label + ' → ' + m.w + '×' + m.h + ' px' +
      (sizeOk ? '' : '   ПЛОХО: подпись не совпадает с разрешением') +
      (labelOk ? '' : '   ПЛОХО: перепутаны ширина и высота'));
    if (!sizeOk || !labelOk) ok = false;
  });

  if (data.list.length !== EXPECTED.length) {
    console.log('ПЛОХО: должно быть ' + EXPECTED.length + ' мониторов, а не ' + data.list.length);
    ok = false;
  }
  EXPECTED.forEach(function (row) {
    const found = data.list.find((m) => m.label.indexOf(row[0]) === 0);
    if (!found) { console.log('ПЛОХО: нет «' + row[0] + '»'); ok = false; return; }
    if (found.w !== row[1] || found.h !== row[2]) {
      console.log('ПЛОХО: ' + row[0] + ' = ' + found.w + '×' + found.h + ', ожидалось ' + row[1] + '×' + row[2]);
      ok = false;
    }
  });

  if (data.opts) console.log('в выпадающем списке: ' + data.opts.length + ' пунктов');
  if (errors.length) errors.slice(0, 5).forEach((e) => console.log('  консоль: ' + e));
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
