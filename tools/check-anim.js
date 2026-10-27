/*
 * Проверка панели «Композит»: анимация числовых входов (маятник) и
 * регулируемая ширина правой панели.
 * Запуск: npx electron tools/check-anim.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

const CODE = [
  'function onTick()',
  '  output.setNumber(1, input.getNumber(1))',
  'end',
  '',
  'function onDraw() end'
].join('\n');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });
  await win.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await wait(1200);
  await win.webContents.executeJavaScript('try { localStorage.clear(); } catch (e) {}', true);
  win.webContents.reload();
  await wait(1800);

  // ---------- 1. точное значение без анимации ----------
  const exact = await win.webContents.executeJavaScript(`(function () {
    window.LunaApp.loadCode(${JSON.stringify(CODE)}, 'anim-test');
    document.querySelector('.side-tabs button[data-side="io"]').click();
    function row() {
      var out = null;
      document.querySelectorAll('#ioList .io-entry').forEach(function (r) {
        if (out) return;
        if (r.querySelector('.io-dir').textContent === 'ВХОД' &&
            r.querySelector('.io-type').textContent === 'число' &&
            +r.querySelector('.io-ch').value === 1) out = r;
      });
      return out;
    }
    var r = row();
    if (!r) return { fail: 'нет числового входа #1' };
    var v = r.querySelector('.io-val');
    v.value = '7';
    v.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true };
  })()`, true);

  let exactVal = null;
  if (exact.ok) {
    for (var s = 0; s < 3; s++) {
      await win.webContents.executeJavaScript('document.getElementById("btnStep").click()', true);
      await wait(40);
    }
    exactVal = await win.webContents.executeJavaScript(`(function () {
      var r = null;
      document.querySelectorAll('#ioList .io-entry').forEach(function (e) {
        if (r) return;
        if (e.querySelector('.io-dir').textContent === 'ВЫХОД' && +e.querySelector('.io-ch').value === 1) r = e;
      });
      document.getElementById('btnStop').click();
      return r ? r.querySelector('.io-outnum').textContent : null;
    })()`, true);
  }

  // ---------- 2. анимация: маятник 0..4 шагом 1 ----------
  const animSetup = await win.webContents.executeJavaScript(`(function () {
    function row() {
      var out = null;
      document.querySelectorAll('#ioList .io-entry').forEach(function (r) {
        if (out) return;
        if (r.querySelector('.io-dir').textContent === 'ВХОД' &&
            r.querySelector('.io-type').textContent === 'число' &&
            +r.querySelector('.io-ch').value === 1) out = r;
      });
      return out;
    }
    var r = row();
    if (!r) return { fail: 'нет числового входа #1' };
    var chk = r.querySelector('.io-anim-on');
    if (!chk) return { fail: 'нет галочки анимации' };
    chk.checked = true;
    chk.dispatchEvent(new Event('change', { bubbles: true }));
    r = row();
    [['min', '0'], ['max', '4'], ['step', '1']].forEach(function (p) {
      var i = r.querySelector('.io-anim-' + p[0]);
      i.value = p[1];
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return { ok: true, readonly: r.querySelector('.io-val').readOnly };
  })()`, true);

  // анимация идёт в общем цикле «Запустить» (тики в невидимом окне редкие — проверяем факт движения)
  let runValue = null;
  if (animSetup.ok) {
    await win.webContents.executeJavaScript('document.getElementById("btnRun").click()', true);
    await wait(1400);
    runValue = await win.webContents.executeJavaScript(`(function () {
      var r = null;
      document.querySelectorAll('#ioList .io-entry').forEach(function (e) {
        if (r) return;
        if (e.querySelector('.io-dir').textContent === 'ВХОД' && +e.querySelector('.io-ch').value === 1) r = e;
      });
      document.getElementById('btnStop').click();
      return r ? parseFloat(r.querySelector('.io-val').value) : null;
    })()`, true);
  }

  // маятник проверяем детерминированно — кнопкой «Шаг»
  let samples = [];
  if (animSetup.ok) {
    for (var k = 0; k < 10; k++) {
      await win.webContents.executeJavaScript('document.getElementById("btnStep").click()', true);
      await wait(30);
      const v = await win.webContents.executeJavaScript(`(function () {
        var r = null;
        document.querySelectorAll('#ioList .io-entry').forEach(function (e) {
          if (r) return;
          if (e.querySelector('.io-dir').textContent === 'ВХОД' && +e.querySelector('.io-ch').value === 1) r = e;
        });
        return r ? parseFloat(r.querySelector('.io-val').value) : null;
      })()`, true);
      samples.push(v);
    }
    await win.webContents.executeJavaScript('document.getElementById("btnStop").click()', true);
  }

  // ---------- 3. ширина панели ----------
  const resize = await win.webContents.executeJavaScript(`(function () {
    var col = document.querySelector('.side-col');
    var bar = document.getElementById('sideResizer');
    if (!col || !bar) return { fail: 'нет ползунка ширины' };
    var before = Math.round(col.getBoundingClientRect().width);
    var y = col.getBoundingClientRect().top + 100;
    var x = bar.getBoundingClientRect().left + 3;
    function pe(type, cx) {
      bar.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: cx, clientY: y, button: 0, pointerId: 1 }));
    }
    pe('pointerdown', x);
    pe('pointermove', x - 90);
    pe('pointerup', x - 90);
    var after = Math.round(col.getBoundingClientRect().width);
    var saved = 0;
    try { saved = JSON.parse(localStorage.getItem('luna.settings')).sideWidth; } catch (e) { }
    return { before: before, after: after, saved: saved };
  })()`, true);

  // ---------- итог ----------
  const distinct = Array.from(new Set(samples.filter(v => v !== null)));
  const moved = distinct.length > 1;
  const inRange = samples.every(v => v === null || (v >= 0 && v <= 4));
  const bounced = samples.some((v, i) => i > 0 && samples[i - 1] !== null && v < samples[i - 1]);
  const reachedMax = samples.some(v => v >= 3);
  const resized = !resize.fail && resize.after !== resize.before && resize.saved === resize.after;

  console.log('точное значение без анимации (ожидаем 7): ' + exactVal);
  console.log('значение через 1.4 с после «Запустить»: ' + runValue);
  console.log('отсчёты по кнопке «Шаг»: ' + samples.join(', '));
  console.log('ширина панели: ' + (resize.before || '?') + ' -> ' + (resize.after || '?') + ' (сохранено: ' + (resize.saved || '?') + ')');

  const checks = {
    'точное значение = 7': exact.ok && String(exactVal) === '7',
    'поле при анимации только для чтения': !!animSetup.readonly,
    'анимация идёт в цикле «Запустить»': runValue !== null && runValue >= 1,
    'значение по шагам меняется': moved,
    'не выходит за мин/макс': inRange,
    'доходит почти до максимума': reachedMax,
    'разворачивается обратно (маятник)': bounced,
    'ширина панели тянется и сохраняется': resized,
    'нет ошибок консоли': errors.length === 0
  };

  let ok = true;
  Object.keys(checks).forEach(function (k) {
    if (!checks[k]) ok = false;
    console.log((checks[k] ? '  OK  ' : '  ПЛОХО ') + k);
  });
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('  консоль: ' + e));
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
