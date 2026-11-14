/*
 * Проверка подсказок API в редакторе и перехода к строке с ошибкой.
 *
 *   • аддон show-hint подключён, Ctrl+Space открывает список;
 *   • после `screen.` подсказки показываются сами, в списке есть drawText с описанием;
 *   • фильтр по набранному тексту работает (`screen.drawT` → drawText и drawTextBox);
 *   • ключевые слова Lua тоже подсказываются;
 *   • ошибка Lua подсвечивает строку в редакторе и даёт кликабельную строку в консоли;
 *   • в консоли нет посторонних ошибок.
 *
 * Запуск: npx electron tools/check-hints.js   (или npm run check-hints)
 */
'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

const INDEX = path.resolve(__dirname, '..', 'index.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1400, height: 900, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false }
  });
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => {
    if (level >= 2 && String(message).indexOf('Electron Security Warning') === -1) errors.push(message);
  });

  await win.loadFile(INDEX);
  await wait(1200);

  // --- 1. аддон на месте, подсказки по screen. ---
  const auto = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setValue('');
    cm.focus();
    cm.replaceRange('screen.', { line: 0, ch: 0 });
    cm.setCursor({ line: 0, ch: 7 });
    var bound = typeof (cm.options.extraKeys || {})['Ctrl-Space'] === 'function';
    if (bound) cm.options.extraKeys['Ctrl-Space']();
    var box = document.querySelector('.CodeMirror-hints');
    var items = box ? Array.prototype.map.call(box.querySelectorAll('li'), function (li) {
      return li.textContent.replace(/\\s+/g, ' ').trim();
    }) : [];
    return {
      showHint: typeof CodeMirror.showHint === 'function',
      bound: bound,
      opened: !!box,
      count: items.length,
      hasDrawText: items.some(function (t) { return t.indexOf('drawText(') === 0; }),
      hasDoc: items.some(function (t) { return /только латиница/i.test(t); })
    };
  })()`, true);
  await wait(200);

  // --- 2. фильтр по набранному префиксу ---
  const filtered = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    if (cm.closeHint) cm.closeHint();
    cm.setValue('screen.drawT');
    cm.setCursor({ line: 0, ch: 12 });
    cm.options.extraKeys['Ctrl-Space']();
    var box = document.querySelector('.CodeMirror-hints');
    var items = box ? Array.prototype.map.call(box.querySelectorAll('li'), function (li) {
      return li.textContent.replace(/\\s+/g, ' ').trim();
    }) : [];
    return {
      count: items.length,
      names: items.map(function (t) { return t.split('(')[0].trim(); })
    };
  })()`, true);
  await wait(200);

  // --- 3. ключевые слова ---
  const keywords = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    var box = document.querySelector('.CodeMirror-hints');
    if (box) box.remove();
    cm.setValue('fun');
    cm.setCursor({ line: 0, ch: 3 });
    cm.options.extraKeys['Ctrl-Space']();
    var b = document.querySelector('.CodeMirror-hints');
    var items = b ? Array.prototype.map.call(b.querySelectorAll('li'), function (li) { return li.textContent.trim(); }) : [];
    return { count: items.length, hasFunction: items.indexOf('function') >= 0, items: items };
  })()`, true);
  await wait(200);

  // --- 4. линт по кнопке: кириллица в drawText ---
  const lintClicked = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    if (cm.closeHint) cm.closeHint();
    cm.setValue('function onDraw()\\n    screen.drawText(4, 4, "Привет")\\nend');
    var btn = document.getElementById('btnLint');
    if (!btn) return false;
    btn.click();
    return true;
  })()`, true);
  await wait(500);

  const lintState = await win.webContents.executeJavaScript(`(function () {
    var err = Array.prototype.slice.call(document.querySelectorAll('.con-line.err'));
    var last = err.length ? err[err.length - 1] : null;
    var bg = document.querySelector('.cm-error-line');
    var codeEl = document.querySelector('.CodeMirror-code');
    return {
      hasBtn: !!document.getElementById('btnLint'),
      text: last ? last.textContent : '',
      line: (bg && codeEl) ? Array.prototype.indexOf.call(codeEl.children, bg.parentNode) + 1 : 0
    };
  })()`, true);

  // --- 5. ошибка → подсветка строки + кликабельная консоль ---
  const errorRun = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    var box = document.querySelector('.CodeMirror-hints');
    if (box) box.remove();
    var code = [
      'function onTick()',
      '    local a = 1',
      '    local b = nil + 1',
      'end'
    ].join('\\n');
    cm.setValue(code);
    document.getElementById('btnRun').click();
    return true;
  })()`, true);
  await wait(1500);

  const errorState = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    var marked = document.querySelectorAll('.cm-error-line');
    var bg = marked.length ? marked[0] : null;
    var codeEl = document.querySelector('.CodeMirror-code');
    var markedLine = (bg && codeEl) ? Array.prototype.indexOf.call(codeEl.children, bg.parentNode) + 1 : 0;
    var conErr = Array.prototype.slice.call(document.querySelectorAll('.con-line.err'));
    var last = conErr.length ? conErr[conErr.length - 1] : null;
    var cur = cm.getCursor();
    return {
      markedCount: marked.length,
      markedLine: markedLine,
      cursorLine: cur.line + 1,
      hasLink: !!(last && last.classList.contains('con-link')),
      errText: last ? last.textContent : '',
      mentionsLine: !!(last && /строка 3/.test(last.textContent))
    };
  })()`, true);

  // клик по ошибке в консоли возвращает курсор на нужную строку
  const clickJump = await win.webContents.executeJavaScript(`(function () {
    var cm = document.querySelector('.CodeMirror').CodeMirror;
    cm.setCursor({ line: 0, ch: 0 });
    var link = document.querySelector('.con-line.err.con-link');
    if (!link) return { clicked: false, line: cm.getCursor().line + 1 };
    link.click();
    return { clicked: true, line: cm.getCursor().line + 1 };
  })()`, true);

  await win.webContents.executeJavaScript(`document.getElementById('btnStop').click();`, true);
  await wait(200);

  console.log('аддон show-hint: ' + auto.showHint + ', Ctrl+Space привязан: ' + auto.bound);
  console.log('после "screen.": открылось=' + auto.opened + ', подсказок=' + auto.count);
  console.log('фильтр "screen.drawT": ' + filtered.count + ' — ' + filtered.names.join(', '));
  console.log('ключевые слова "fun": ' + keywords.items.join(', '));
  console.log('ошибка: подсвечена строка ' + errorState.markedLine + ' (курсор на ' + errorState.cursorLine + ')');
  console.log('линт: кнопка=' + lintState.hasBtn + ', строка=' + lintState.line + ', текст="' + lintState.text.slice(0, 80) + '"');
  console.log('консоль: ссылка=' + errorState.hasLink + ', текст="' + errorState.errText.slice(0, 90) + '"');
  console.log('клик по ошибке вернул на строку: ' + clickJump.line);

  const checks = {
    'аддон show-hint загружен': auto.showHint,
    'Ctrl+Space привязан к подсказкам': auto.bound,
    'после screen. список открывается': auto.opened && auto.count > 1,
    'в списке есть drawText с сигнатурой': auto.hasDrawText,
    'у подсказки видно описание': auto.hasDoc,
    'фильтр screen.drawT отбирает только drawT*': filtered.count === 4 &&
      filtered.names.indexOf('drawText') >= 0 && filtered.names.indexOf('drawTextBox') >= 0 &&
      filtered.names.every(function (n) { return n.toLowerCase().indexOf('drawt') === 0; }),
    'ключевые слова подсказываются': keywords.hasFunction,
    'кнопка «Проверить» есть': lintClicked && lintState.hasBtn,
    'линт нашёл кириллицу в drawText': /кириллица/.test(lintState.text),
    'линт подсветил строку 2': lintState.line === 2,
    'ошибка подсветила нужную строку': errorState.markedCount === 1 && errorState.markedLine === 3,
    'курсор встал на строку ошибки': errorState.cursorLine === 3,
    'в консоли есть номер строки': errorState.mentionsLine,
    'строка ошибки в консоли кликабельна': errorState.hasLink,
    'клик по ошибке переводит курсор': clickJump.clicked && clickJump.line === 3,
    'нет ошибок консоли': errors.length === 0
  };

  let ok = true;
  Object.keys(checks).forEach(function (k) {
    if (!checks[k]) ok = false;
    console.log((checks[k] ? '  OK  ' : '  ПЛОХО ') + k);
  });
  if (errors.length) errors.slice(0, 5).forEach((e) => console.log('  консоль: ' + e));
  console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
  win.destroy();
  app.exit(ok ? 0 : 1);
}).catch((e) => { console.error(e); app.exit(1); });
