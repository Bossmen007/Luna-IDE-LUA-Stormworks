/*
 * Проверка конструктора интерфейса (вкладка «Конструктор UI»).
 * Открывает index.html, добавляет элементы всех типов, забирает
 * сгенерированный Lua-код и прогоняет его через Fengari (compile + onTick + onDraw).
 * Запуск: npx electron tools/check-builder.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.disableHardwareAcceleration();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false }
  });

  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });

  const file = path.resolve(__dirname, '..', 'index.html');
  await win.loadFile(file);
  await wait(2000);

  const result = await win.webContents.executeJavaScript(`(function () {
    var out = { errors: [], log: [] };
    var tabBtn = document.querySelector('.tabs button[data-tab="builder"]');
    if (tabBtn) tabBtn.click();
    var body = document.getElementById('builderBody');
    if (!body) { out.log.push('нет #builderBody'); return out; }
    var canvas = body.querySelector('[data-role="canvas"]');
    out.mounted = !!canvas;
    var palette = body.querySelectorAll('[data-pal]');
    out.palette = palette.length;
    // все 20 видов палитры
    var wanted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    wanted.forEach(function (i) { if (palette[i]) palette[i].click(); });
    var ta = body.querySelector('[data-role="code"]');
    var code = ta ? ta.value : '';
    out.codeLen = code.length;
    out.head = code.split('\\n').slice(0, 4).join(' | ');
    // компиляция и запуск
    try {
      var cvs = document.createElement('canvas');
      var scr = new SWScreen(cvs);
      var rt = new LunaRuntime({ screen: scr, onPrint: function (o) { out.log.push(o.text); } });
      var c = rt.compile(code);
      if (!c.ok) { out.compileError = c.error; }
      else {
        var ri = rt.runInit();
        if (!ri.ok) out.initError = ri.error;
        else {
          rt.tick = 0;
          var t = rt.call('onTick');
          if (!t.ok) out.tickError = t.error;
          else { var d = rt.call('onDraw'); if (!d.ok) out.drawError = d.error; }
          // проверим, что интерактив дал выход
          out.boolOut1 = rt.boolOut[1] !== undefined;
        }
      }
    } catch (ex) { out.ex = String(ex); }
    return out;
  })()`, true);

  console.log('смонтирован: ' + result.mounted + ', кнопок палитры: ' + result.palette);
  console.log('длина кода: ' + result.codeLen + ' символов');
  console.log('шапка: ' + result.head);
  if (result.compileError) console.log('ОШИБКА КОМПИЛЯЦИИ: ' + result.compileError);
  if (result.initError) console.log('ОШИБКА INIT: ' + result.initError);
  if (result.tickError) console.log('ОШИБКА onTick: ' + result.tickError);
  if (result.drawError) console.log('ОШИБКА onDraw: ' + result.drawError);
  if (result.ex) console.log('ИСКЛЮЧЕНИЕ: ' + result.ex);
  if (errors.length) console.log('ОШИБКИ КОНСОЛИ: ' + JSON.stringify(errors.slice(0, 5)));
  else console.log('ошибок консоли нет');

  const ok = !result.compileError && !result.initError && !result.tickError &&
             !result.drawError && !result.ex && result.mounted && result.codeLen > 200 && errors.length === 0;
  console.log(ok ? 'РЕЗУЛЬТАТ: OK — код конструктора компилируется и выполняется' : 'РЕЗУЛЬТАТ: ПРОВАЛ');

  try {
    await wait(700);
    const tab = await win.webContents.executeJavaScript(
      "document.getElementById('tab-builder').classList.contains('active')", true);
    console.log('вкладка конструктора активна: ' + tab);
    const fs = require('fs'), os = require('os');
    const img = await win.webContents.capturePage();
    const shot = path.join(os.tmpdir(), 'luna-builder.png');
    fs.writeFileSync(shot, img.toPNG());
    console.log('скриншот: ' + shot);
  } catch (e) { console.log('скриншот не сделан: ' + e.message); }

  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
