/*
 * Проверка автоопределения сигналов композита.
 * Открывает index.html, кладёт тестовый код, открывает вкладку «Композит»
 * и сверяет найденные входы/выходы и список local-переменных.
 * Запуск: npx electron tools/check-io.js
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

const CODE = [
  'local fuel = input.getNumber(1)',
  'local rpm = input.getNumber(2)',
  'local engine_on = input.getBool(1)',
  'local total = fuel + rpm',
  '',
  'function onTick()',
  '  local throttle = input.getNumber(5)',
  '  output.setNumber(1, fuel)',
  '  output.setBool(2, engine_on)',
  '  output.setNumber(3, throttle)',
  'end',
  '',
  'function onDraw() end'
].join('\n');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1200, height: 800, show: false, webPreferences: { contextIsolation: false, nodeIntegration: false } });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });
  await win.loadFile(path.resolve(__dirname, '..', 'index.html'));
  await wait(1200);
  await win.webContents.executeJavaScript('try { localStorage.clear(); } catch (e) {}', true);
  win.webContents.reload();
  await wait(1800);

  const res = await win.webContents.executeJavaScript(`(function () {
    window.LunaApp.loadCode(${JSON.stringify(CODE)}, 'io-test');
    var sideBtn = document.querySelector('.side-tabs button[data-side="io"]');
    if (sideBtn) sideBtn.click();
    var rows = [];
    document.querySelectorAll('#ioList .io-entry').forEach(function (r) {
      rows.push({
        dir: r.querySelector('.io-dir').textContent,
        type: r.querySelector('.io-type').textContent,
        ch: +r.querySelector('.io-ch').value,
        name: r.querySelector('.io-name').value
      });
    });
    var locals = [];
    document.querySelectorAll('#ioLocals .chip').forEach(function (c) { locals.push(c.textContent); });
    return { rows: rows, locals: locals };
  })()`, true);

  console.log('сигналы:');
  res.rows.forEach(function (r) { console.log('  ' + r.dir + ' ' + r.type + ' #' + r.ch + ' = ' + r.name); });
  console.log('локальные: ' + res.locals.join(', '));

  const has = (dir, type, ch, name) => res.rows.some(r => r.dir === dir && r.type === type && r.ch === ch && (!name || r.name === name));
  const checks = {
    'вход num #1 = fuel': has('ВХОД', 'число', 1, 'fuel'),
    'вход num #2 = rpm': has('ВХОД', 'число', 2, 'rpm'),
    'вход num #5 = throttle': has('ВХОД', 'число', 5, 'throttle'),
    'вход bool #1 = engine_on': has('ВХОД', 'лог.', 1, 'engine_on'),
    'выход num #1': has('ВЫХОД', 'число', 1),
    'выход num #3': has('ВЫХОД', 'число', 3),
    'выход bool #2': has('ВЫХОД', 'лог.', 2),
    'local fuel': res.locals.indexOf('fuel') >= 0,
    'local total': res.locals.indexOf('total') >= 0,
    'local throttle': res.locals.indexOf('throttle') >= 0,
    'нет ошибок консоли': errors.length === 0
  };
  let ok = true;
  Object.keys(checks).forEach(function (k) { if (!checks[k]) ok = false; console.log((checks[k] ? '  OK  ' : '  ПЛОХО ') + k); });
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
