/*
 * Луна IDE — логика приложения: вкладки, редактор, запуск, консоль,
 * монитор, ввод-вывод, свойства, сохранение, примеры, уроки, справочник.
 */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'luna.settings';
  var AUTOSAVE_KEY = 'luna.autosave';
  var DRAFTS_KEY = 'luna.drafts';
  // Лимит размера скрипта в игре (поднят до 8192). Считаются ВСЕ символы:
  // буквы, знаки, пробелы, переводы строк и комментарии.
  var CODE_LIMIT = 8192;

  var DEFAULT_CODE = [
    '-- Добро пожаловать в «Луна IDE» — редактор Lua для Stormworks!',
    '-- Нажмите ▶ Запустить (или F5), чтобы выполнить скрипт в браузере.',
    '',
    'local ticks = 0',
    '',
    'function onTick()',
    '    ticks = ticks + 1',
    '    -- читаем значение с канала 1 и утрояем его',
    '    local v = input.getNumber(1)',
    '    output.setNumber(1, v * 3)',
    'end',
    '',
    'function onDraw()',
    '    screen.drawClear(16, 16, 22, 255)',
    '    screen.setColor(0, 200, 120)',
    '    screen.drawText(6, 6, "Hello, Stormworks!")',
    '    screen.setColor(255, 255, 255)',
    '    screen.drawText(6, 20, string.format("Тик: %d", ticks))',
    'end',
    ''
  ].join('\n');

  var settings = {
    theme: 'dark',
    fontSize: 14,
    monitorW: 160,
    monitorH: 96,
    monitorZoom: 0,          // 0 = «Вписать», иначе множитель (1 = 1:1)
    zoomBySize: {},          // запоминаем масштаб отдельно для каждого разрешения
    maxInstructions: 20000000,
    donateUrl: '',           // публичная ссылка на страницу донатов (без личных данных)
    io: null,                // список сигналов композита (входы/выходы)
    _v: 2
  };

  // Список мониторов = только те, что реально есть в игре (официальная вики Stormworks).
  // 1 блок = 32×32 пикселя. Названия соответствуют компонентам в игре.
  var MONITORS = [
    { label: 'Monitor 1×1', w: 32, h: 32 },
    { label: 'Monitor 1×2', w: 32, h: 64 },
    { label: 'Monitor 1×3', w: 32, h: 96 },
    { label: 'Monitor 2×2', w: 64, h: 64 },
    { label: 'Monitor 2×3', w: 64, h: 96 },
    { label: 'Monitor 3×3 / HUD 3×3', w: 96, h: 96 },
    { label: 'Monitor 3×5', w: 160, h: 96 },
    { label: 'Monitor 9×5', w: 288, h: 160 }
  ];
  global.LUNA_MONITORS = MONITORS;   // используется конструктором интерфейса
  var drafts = [];
  var el = {};
  var cm = null;
  var swScreen = null, runtime = null, running = false, raf = null;
  var hasTick = false, hasDraw = false;
  var stepMode = false;
  var currentName = 'Черновик';
  var dirty = false;
  var ignoreLimit = false;   // при загрузке файла/ссылки код не обрезаем — только предупреждаем

  // ---------- утилиты ----------
  function $(id) { return document.getElementById(id); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function loadJSON(key, def) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { return decodeURIComponent(escape(atob(s))); }

  // ---------- консоль ----------
  function addConsole(msg) {
    var text = (typeof msg === 'string') ? msg : msg.text;
    var cls = (typeof msg === 'string') ? '' : (msg.css || '');
    var line = document.createElement('div');
    line.className = 'con-line ' + cls;
    line.textContent = text;
    el.console.appendChild(line);
    while (el.console.childNodes.length > 500) el.console.removeChild(el.console.firstChild);
    el.console.scrollTop = el.console.scrollHeight;
  }
  function clearConsole() { el.console.innerHTML = ''; }
  function conError(text) { addConsole({ text: '✖ ' + text, css: 'err' }); }
  function conInfo(text) { addConsole({ text: '• ' + text, css: 'info' }); }

  // ---------- настройки ----------
  function applySettings() {
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(settings.theme === 'light' ? 'theme-light' : 'theme-dark');
    if (cm) {
      cm.getWrapperElement().style.fontSize = settings.fontSize + 'px';
      cm.refresh();
    }
    if (swScreen) {
      swScreen.fontSize = 10;
      swScreen.setSize(settings.monitorW, settings.monitorH);
      fitMonitor();
      if (runtime) { runtime.numIn[1] = settings.monitorW; runtime.numIn[2] = settings.monitorH; }
    }
    syncMonitorSelects();
    syncDonateField();
    if (el.inpFont) el.inpFont.value = settings.fontSize;
    if (el.inpLimit) el.inpLimit.value = settings.maxInstructions;
    saveJSON(SETTINGS_KEY, settings);
  }

  // ---------- поддержка проекта ----------
  var DEVELOPER = 'СтаричЁк';
  var YOOMONEY_WALLET = '4100119229429725';
  var YOOMONEY_URL = 'https://yoomoney.ru/to/' + YOOMONEY_WALLET;
  var TELEGRAM_URL = 'https://t.me/luna_ide';

  function syncDonateField() {
    var url = settings.donateUrl || '';
    if (el.inpDonate && document.activeElement !== el.inpDonate && el.inpDonate.value !== url) el.inpDonate.value = url;
  }
  function openUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return;
    // в настольной версии откроется в системном браузере (Electron перехватывает окно)
    try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; }
  }
  function copyText(text, btn) {
    function done() {
      if (!btn) return;
      var t = btn.textContent;
      btn.textContent = 'Скопировано ✓';
      setTimeout(function () { btn.textContent = t; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    ta.remove();
  }
  function openDonateDialog() {
    var extra = (settings.donateUrl || '').trim();
    var html =
      '<p>Спасибо, что пользуетесь «Луна IDE»! Каждая поддержка — это не «спасибо в карман», ' +
      'а реальные часы, вложенные в проект.</p>' +
      '<p><b>На что идёт поддержка:</b></p>' +
      '<ul>' +
      '<li>новые уроки, примеры и готовые шаблоны приборов;</li>' +
      '<li>исправление ошибок и обновления под новые версии Stormworks;</li>' +
      '<li>поддержка сообщества: ответы на вопросы, разбор чужих скриптов;</li>' +
      '<li>сборки и зеркала, чтобы редактор оставался бесплатным и доступным.</li>' +
      '</ul>' +
      '<p class="muted small">Проект делает <b>' + DEVELOPER + '</b> в свободное время, и он остаётся ' +
      'бесплатным для всех. Ваша поддержка — это возможность уделять ему больше времени, ' +
      'а не искать его после работы. Даже символическая сумма заметно помогает.</p>' +
      '<hr class="donate-sep">' +
      '<h4>ЮMoney</h4>' +
      '<div class="donate-wallet"><code>' + YOOMONEY_WALLET + '</code>' +
      '<button class="btn small" id="ymCopy">Скопировать номер</button></div>' +
      '<p class="muted small">Переведите любую сумму на кошелёк — или откройте страницу перевода одной кнопкой.</p>' +
      '<button class="btn primary" id="ymGo">Перевести на ЮMoney</button>' +
      '<hr class="donate-sep"><h4>Новости проекта</h4>' +
      '<p class="muted small">Обновления, новые уроки и разборы скриптов — в Telegram-канале «Луна IDE».</p>' +
      '<button class="btn" id="tgGo">✈️ Открыть Telegram-канал</button>' +
      (extra
        ? '<hr class="donate-sep"><h4>Другие способы</h4><button class="btn" id="donExtra">Открыть ссылку поддержки</button>'
        : '');
    var back = modal('Поддержать проект 💛', html, null);
    var copyBtn = back.querySelector('#ymCopy');
    if (copyBtn) copyBtn.onclick = function () { copyText(YOOMONEY_WALLET, copyBtn); };
    var go = back.querySelector('#ymGo');
    if (go) go.onclick = function () { openUrl(YOOMONEY_URL); };
    var tg = back.querySelector('#tgGo');
    if (tg) tg.onclick = function () { openUrl(TELEGRAM_URL); };
    var ex = back.querySelector('#donExtra');
    if (ex) ex.onclick = function () { openUrl(extra); };
    return back;
  }

  // ---------- размеры и масштаб монитора ----------
  function isPresetMonitor(w, h) {
    for (var i = 0; i < MONITORS.length; i++) if (MONITORS[i].w === w && MONITORS[i].h === h) return true;
    return false;
  }
  function buildMonitorSelects() {
    var opts = MONITORS.map(function (m) {
      return '<option value="' + m.w + 'x' + m.h + '">' + m.label + ' — ' + m.w + '×' + m.h + ' px</option>';
    }).join('') + '<option value="custom">Другой размер…</option>';
    ['selMonSize', 'selMonSize2'].forEach(function (id) { var s = document.getElementById(id); if (s) s.innerHTML = opts; });
  }
  function syncMonitorSelects() {
    var v = isPresetMonitor(settings.monitorW, settings.monitorH) ? (settings.monitorW + 'x' + settings.monitorH) : 'custom';
    ['selMonSize', 'selMonSize2'].forEach(function (id) { var s = document.getElementById(id); if (s) s.value = v; });
    if (el.monCustomWrap) el.monCustomWrap.style.display = (v === 'custom') ? 'flex' : 'none';
    if (el.monCustomW) el.monCustomW.value = settings.monitorW;
    if (el.monCustomH) el.monCustomH.value = settings.monitorH;
    var lab = document.getElementById('monBlocksInfo');
    if (lab) lab.textContent = '≈ ' + Math.round(settings.monitorW / 32 * 10) / 10 + ' × ' + Math.round(settings.monitorH / 32 * 10) / 10 + ' блока';
  }
  function setMonitorSize(w, h) {
    w = Math.max(8, Math.min(4096, Math.round(w)));
    h = Math.max(8, Math.min(4096, Math.round(h)));
    settings.monitorW = w; settings.monitorH = h;
    // вспоминаем сохранённый масштаб именно для этого разрешения (иначе «Вписать»)
    var savedZoom = settings.zoomBySize ? settings.zoomBySize[w + 'x' + h] : undefined;
    settings.monitorZoom = (savedZoom === undefined) ? 0 : savedZoom;
    applySettings();
    if (runtime) refreshIOInputs();
    if (running) runCode();
  }
  // Масштаб отображения монитора (НЕ меняет разрешение — только вид).
  function fitMonitor() {
    var c = el.monitor, vp = el.monitorViewport;
    if (!c || !vp) return;
    var availW = Math.max(40, vp.clientWidth - 12);
    var availH = Math.max(40, vp.clientHeight - 12);
    var z = settings.monitorZoom || 0;         // 0 = вписать
    var scale = z || Math.min(availW / settings.monitorW, availH / settings.monitorH);
    scale = Math.max(0.1, Math.min(scale, 24));
    var dispW = Math.round(settings.monitorW * scale);
    var dispH = Math.round(settings.monitorH * scale);
    c.style.width = dispW + 'px';
    c.style.height = dispH + 'px';
    var eff = dispW / settings.monitorW;
    if (el.monZoomLabel) el.monZoomLabel.textContent = Math.round(eff * 100) + '%' + (z ? '' : ' · вписано');
  }
  function monitorEffZoom() {
    var c = el.monitor;
    var w = parseFloat(c.style.width) || settings.monitorW;
    return w / settings.monitorW;
  }
  function sizeKey() { return settings.monitorW + 'x' + settings.monitorH; }
  function rememberZoom(z) {
    settings.monitorZoom = z;
    settings.zoomBySize = settings.zoomBySize || {};
    settings.zoomBySize[sizeKey()] = z;   // масштаб хранится отдельно для каждого разрешения
    saveJSON(SETTINGS_KEY, settings);
    fitMonitor();
  }
  function zoomMonitor(factor) {
    rememberZoom(Math.max(0.25, Math.min(24, monitorEffZoom() * factor)));
  }
  function setZoomMode(mode) { rememberZoom(mode); }
  // Полноэкранный просмотр монитора (разрешение не меняется)
  var fsPrevZoom = null;
  function toggleMonitorFullscreen() {
    var vp = el.monitorViewport;
    if (!vp) return;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (vp.requestFullscreen) {
      vp.requestFullscreen();
    } else if (vp.webkitRequestFullscreen) {
      vp.webkitRequestFullscreen();
    } else {
      conInfo('Полноэкранный режим не поддерживается браузером.');
    }
  }

  // ---------- редактор ----------
  function initEditor() {
    cm = CodeMirror.fromTextArea(el.code, {
      mode: 'lua',
      theme: 'luna',
      lineNumbers: true,
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      autoCloseBrackets: true,
      matchBrackets: true,
      lineWrapping: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Ctrl-S': saveDraft, 'Cmd-S': saveDraft,
        'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
        'F5': runCode, 'Ctrl-Enter': runCode, 'Cmd-Enter': runCode,
        'Ctrl-F': 'findPersistent', 'Shift-Ctrl-F': 'replace', 'Alt-F': 'findPersistent',
        'Ctrl-Space': 'autocomplete'
      }
    });
    var saved = localStorage.getItem(AUTOSAVE_KEY);
    cm.setValue(saved && saved.length > 0 ? saved : DEFAULT_CODE);

    // жёсткий лимит: не даём ввести больше 8192 символов (как в игре)
    cm.on('beforeChange', function (cm, ch) {
      if (ignoreLimit) return;
      // при программной установке текста (setValue) нет ch.removed — проверить нельзя, пропускаем
      if (!ch.removed || !ch.text) return;
      var docLen = cm.getValue().length;
      var removedLen = ch.removed.join('\n').length;
      var addedLen = ch.text.join('\n').length;
      if (docLen + addedLen - removedLen <= CODE_LIMIT) return;
      var allowed = CODE_LIMIT - (docLen - removedLen);
      var newText = allowed <= 0 ? [''] : (ch.text || ['']).join('\n').slice(0, allowed).split('\n');
      if (typeof ch.update === 'function') ch.update(ch.from, ch.to, newText);
      else if (typeof ch.cancel === 'function') ch.cancel();
      showLimitHint();
    });

    cm.on('change', function (cm, ch) {
      if (!ignoreLimit) clampToLimit(cm, ch);
      dirty = true; updateStatus(); updateCharCount();
      clearTimeout(cm._saveT);
      cm._saveT = setTimeout(function () { localStorage.setItem(AUTOSAVE_KEY, cm.getValue()); }, 600);
    });

    updateCharCount();
    if (cm.getValue().length > CODE_LIMIT) warnOverLimit(cm.getValue().length);
  }

  // Удерживает длину документа в пределах лимита. Работает и для набора, и для вставки,
  // и для программных правок (beforeChange срабатывает не всегда).
  function clampToLimit(cm, ch) {
    var over = cm.getValue().length - CODE_LIMIT;
    if (over <= 0) return;
    var insLen = (ch && ch.text) ? ch.text.join('\n').length : 0;
    if (ch && ch.from && ch.to && insLen > 0) {
      var toIdx = cm.indexFromPos(ch.to);
      var remove = Math.min(over, insLen);
      if (toIdx - remove >= 0) {
        cm.replaceRange('', cm.posFromIndex(toIdx - remove), ch.to, 'limit');
        showLimitHint();
        return;
      }
    }
    // запасной путь: жёстко обрезаем документ до лимита
    var txt = cm.getValue().slice(0, CODE_LIMIT);
    ignoreLimit = true;
    cm.setValue(txt);
    ignoreLimit = false;
    showLimitHint();
  }

  function updateCharCount() {
    if (!el.charCount || !cm) return;
    var n = cm.getValue().length;
    el.charCount.textContent = 'Символов: ' + n + ' / ' + CODE_LIMIT;
    el.charCount.classList.toggle('warn', n >= CODE_LIMIT * 0.9 && n <= CODE_LIMIT);
    el.charCount.classList.toggle('over', n > CODE_LIMIT);
    el.charCount.title = 'Лимит игры — ' + CODE_LIMIT + ' символов. Учитываются все символы: буквы, знаки, пробелы, переводы строк и комментарии.';
  }
  function showLimitHint() {
    if (!el.limitHint) return;
    el.limitHint.textContent = 'Достигнут лимит игры — ' + CODE_LIMIT + ' символов';
    el.limitHint.classList.add('show');
    clearTimeout(el.limitHint._t);
    el.limitHint._t = setTimeout(function () { el.limitHint.classList.remove('show'); }, 2500);
  }
  function warnOverLimit(n) {
    conError('Код длиннее лимита игры: ' + n + ' > ' + CODE_LIMIT + ' символов — в игру не влезет. Сожмите кнопкой «Минифицировать».');
  }

  function updateStatus() {
    el.status.textContent = currentName + (dirty ? ' • изменён' : '');
  }

  function loadCode(code, name) {
    ignoreLimit = true;
    cm.setValue(code);
    ignoreLimit = false;
    currentName = name || 'Черновик';
    dirty = false;
    switchTab('editor');
    updateStatus();
    updateCharCount();
    if (code.length > CODE_LIMIT) warnOverLimit(code.length);
    cm.focus();
  }

  // ---------- запуск ----------
  function initRuntime() {
    swScreen = new SWScreen(el.monitor);
    applySettings();
    runtime = new LunaRuntime({
      screen: swScreen,
      onPrint: addConsole,
      maxInstructions: settings.maxInstructions
    });
    buildIOPanel();
    resetIO();
  }

  function resetIO() {
    if (!runtime) return;
    for (var i = 1; i <= 32; i++) { runtime.numIn[i] = 0; runtime.boolIn[i] = false; runtime.numOut[i] = 0; runtime.boolOut[i] = false; }
    applyInputsFromRows();
    refreshIOInputs();
    updateIOOutputs();
  }

  function runCode() {
    if (!runtime) return;
    stopRun(true);
    clearConsole();
    runtime.reset();
    applyInputsFromRows();   // возвращаем значения, введённые пользователем в панели «Композит»
    runtime.maxInstructions = settings.maxInstructions;

    var res = runtime.compile(cm.getValue());
    if (!res.ok) { conError(res.error); return; }
    swScreen.clear();
    var r = runtime.runInit();
    if (!r.ok) { conError(r.error); return; }

    hasTick = runtime.hasFunction('onTick');
    hasDraw = runtime.hasFunction('onDraw');
    if (!hasTick && !hasDraw) {
      conInfo('Скрипт выполнен, но не содержит функций onTick()/onDraw() — нечего запускать в цикле.');
      return;
    }
    if (hasDraw && !hasTick) conInfo('Найдена только onDraw() — логика onTick отсутствует.');
    if (hasTick && !hasDraw) conInfo('Найдена только onTick() — рисование отсутствует.');

    refreshIOInputs();
    tickCount = 0;
    running = true;
    setRunButtons(true);
    conInfo('Запуск. Тик #0.');
    stepMode = false;
    raf = requestAnimationFrame(loop);
  }

  var tickCount = 0;
  function loop() {
    if (!running) return;
    if (hasTick) {
      var r1 = runtime.call('onTick');
      if (!r1.ok) { conError('Ошибка в onTick: ' + r1.error); stopRun(); return; }
      tickCount++;
    }
    swScreen.clear();
    if (hasDraw) {
      var r2 = runtime.call('onDraw');
      if (!r2.ok) { conError('Ошибка в onDraw: ' + r2.error); stopRun(); return; }
    }
    updateIOOutputs();
    if (tickCount % 30 === 0) el.runtimeInfo.textContent = 'Тиков: ' + tickCount;
    raf = requestAnimationFrame(loop);
  }

  function step() {
    if (!runtime) return;
    if (!running) {
      var res = runtime.compile(cm.getValue());
      if (!res.ok) { conError(res.error); return; }
      swScreen.clear();
      var r = runtime.runInit();
      if (!r.ok) { conError(r.error); return; }
      hasTick = runtime.hasFunction('onTick');
      hasDraw = runtime.hasFunction('onDraw');
      if (!hasTick && !hasDraw) { conInfo('Нет onTick()/onDraw().'); return; }
      running = true; setRunButtons(true);
    }
    stopLoopOnly();
    if (hasTick) { var r1 = runtime.call('onTick'); if (!r1.ok) { conError('onTick: ' + r1.error); return; } tickCount++; }
    swScreen.clear();
    if (hasDraw) { var r2 = runtime.call('onDraw'); if (!r2.ok) { conError('onDraw: ' + r2.error); return; } }
    updateIOOutputs();
    el.runtimeInfo.textContent = 'Тиков: ' + tickCount;
  }

  function stopLoopOnly() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
  function stopRun(silent) {
    running = false;
    stopLoopOnly();
    setRunButtons(false);
    if (!silent) conInfo('Остановлено.');
  }
  function setRunButtons(isRunning) {
    if (el.btnRun) el.btnRun.disabled = isRunning;
    if (el.btnStop) el.btnStop.disabled = !isRunning;
  }

  // ---------- панель композита: входы и выходы создаются вручную ----------
  function defaultIO() {
    return [
      { dir: 'in', type: 'num', ch: 1, name: 'Значение' },
      { dir: 'out', type: 'num', ch: 1, name: 'Выход' }
    ];
  }
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function nextFreeChannel() {
    var used = {};
    (settings.io || []).forEach(function (r) { used[r.ch] = true; });
    for (var c = 1; c <= 32; c++) if (!used[c]) return c;
    return 1;
  }
  function buildIOPanel() {
    if (!settings.io || !settings.io.length) settings.io = defaultIO();
    el.io.innerHTML =
      '<div class="io-head"><span class="io-head-title">Сигналы</span>' +
      '<button class="btn small" id="ioScan" title="Найти input.getNumber/getBool и output.setNumber/setBool в коде">⟳ Из кода</button>' +
      '<button class="btn small" id="ioAdd">＋ Добавить</button></div>' +
      '<div id="ioList" class="io-list"></div>' +
      '<p class="muted small">Сигналы находятся в коде кнопкой «Из кода» (или задаются вручную). Каналы 1–32. Название — только подпись в IDE, код оно не меняет.</p>' +
      '<div class="io-head" style="margin-top:10px"><span class="io-head-title">Локальные переменные</span></div>' +
      '<div id="ioLocals" class="io-list"><p class="muted small">Нажмите «Из кода» — покажем объявленные <code>local</code> (только для справки).</p></div>';
    $('ioScan').onclick = scanCodeForIO;
    $('ioAdd').onclick = openAddIO;
    renderIOList();
  }

  // разбор кода: входы input.getNumber/getBool, выходы output.setNumber/setBool,
  // названия из конструкций local ИМЯ = input.getNumber(N). Ручные сигналы сохраняются.
  function scanCodeForIO() {
    var code = cm ? cm.getValue() : '';
    var names = {}, m, re;
    re = /(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*input\s*\.\s*(getNumber|getBool)\s*\(\s*(\d+)\s*\)/g;
    while ((m = re.exec(code))) names['in' + (m[2] === 'getBool' ? 'bool' : 'num') + m[3]] = m[1];

    var detected = [], seen = {};
    re = /input\s*\.\s*(getNumber|getBool)\s*\(\s*(\d+)\s*\)/g;
    while ((m = re.exec(code))) {
      var ty = m[1] === 'getBool' ? 'bool' : 'num', ch = +m[2];
      if (ch < 1 || ch > 32) continue;
      var k = 'in' + ty + ch; if (seen[k]) continue; seen[k] = 1;
      detected.push({ dir: 'in', type: ty, ch: ch });
    }
    re = /output\s*\.\s*(setNumber|setBool)\s*\(\s*(\d+)/g;
    while ((m = re.exec(code))) {
      var ty2 = m[1] === 'setBool' ? 'bool' : 'num', ch2 = +m[2];
      if (ch2 < 1 || ch2 > 32) continue;
      var k2 = 'out' + ty2 + ch2; if (seen[k2]) continue; seen[k2] = 1;
      detected.push({ dir: 'out', type: ty2, ch: ch2 });
    }

    var result = (settings.io || []).filter(function (r) { return !r.auto; });
    detected.forEach(function (f) {
      var codeName = (f.dir === 'in') ? names['in' + f.type + f.ch] : null;
      var existing = null;
      result.forEach(function (r) { if (r.dir === f.dir && r.type === f.type && r.ch === f.ch) existing = r; });
      if (existing) { if (codeName) existing.name = codeName; return; }
      var prev = null;
      (settings.io || []).forEach(function (r) { if (r.dir === f.dir && r.type === f.type && r.ch === f.ch && !r.auto) prev = r; });
      var name = codeName || (prev && prev.name) || ((f.dir === 'in' ? 'Вход ' : 'Выход ') + f.ch);
      result.push({ dir: f.dir, type: f.type, ch: f.ch, name: name, auto: true });
    });
    settings.io = result;
    saveJSON(SETTINGS_KEY, settings);
    renderIOList();
    renderLocals(code);
    if (el.io && cm) conInfo('Из кода найдено сигналов: ' + detected.length + '.');
  }

  function renderLocals(code) {
    var box = $('ioLocals'); if (!box) return;
    var names = [], seen = {}, m;
    var re = /\blocal\s+([A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*)/g;
    while ((m = re.exec(code))) {
      m[1].split(',').forEach(function (n) {
        n = n.trim(); if (!n || seen[n]) return; seen[n] = 1; names.push(n);
      });
    }
    if (!names.length) { box.innerHTML = '<p class="muted small">local-переменных не найдено.</p>'; return; }
    box.innerHTML = '<div class="chips">' + names.map(function (n) { return '<span class="chip">' + escAttr(n) + '</span>'; }).join('') + '</div>';
  }

  function renderIOList() {
    var list = $('ioList');
    if (!list) return;
    if (!settings.io.length) {
      list.innerHTML = '<p class="muted small">Пока пусто — нажмите «＋ Добавить».</p>';
      return;
    }
    var html = '';
    settings.io.forEach(function (r, i) {
      html += '<div class="io-entry" data-i="' + i + '">' +
        '<span class="io-dir ' + r.dir + '" title="' + (r.dir === 'in' ? 'Вход в скрипт' : 'Выход из скрипта') + '">' + (r.dir === 'in' ? 'ВХОД' : 'ВЫХОД') + '</span>' +
        '<span class="io-type">' + (r.type === 'bool' ? 'лог.' : 'число') + '</span>' +
        '<input class="io-ch" type="number" min="1" max="32" value="' + r.ch + '" title="Канал 1–32">' +
        '<input class="io-name" type="text" placeholder="Название" value="' + escAttr(r.name) + '">';
      if (r.dir === 'in' && r.type === 'num') html += '<input class="io-val" type="number" step="0.1" value="0" title="Значение">';
      else if (r.dir === 'in') html += '<label class="io-bool" title="Логический вход"><input type="checkbox"></label>';
      else if (r.type === 'num') html += '<span class="io-outnum" title="Значение выхода">0</span>';
      else html += '<span class="io-outbool" title="Логический выход">—</span>';
      html += '<button class="icon-btn io-del" title="Удалить">✕</button></div>';
    });
    list.innerHTML = html;

    qsa('.io-entry', list).forEach(function (row) {
      var i = +row.getAttribute('data-i'), r = settings.io[i];
      row.querySelector('.io-ch').addEventListener('input', function () {
        r.ch = Math.max(1, Math.min(32, Math.round(+this.value) || 1));
        saveJSON(SETTINGS_KEY, settings);
      });
      row.querySelector('.io-name').addEventListener('input', function () {
        r.name = this.value; saveJSON(SETTINGS_KEY, settings);
      });
      var v = row.querySelector('.io-val');
      if (v) v.addEventListener('input', function () { if (runtime) runtime.numIn[r.ch] = parseFloat(this.value) || 0; });
      var b = row.querySelector('.io-bool input');
      if (b) b.addEventListener('change', function () { if (runtime) runtime.boolIn[r.ch] = this.checked; });
      row.querySelector('.io-del').addEventListener('click', function () {
        settings.io.splice(i, 1); saveJSON(SETTINGS_KEY, settings); renderIOList();
      });
    });
    refreshIOInputs();
    updateIOOutputs();
  }

  // значения, введённые пользователем -> в рантайм
  function applyInputsFromRows() {
    if (!runtime) return;
    qsa('#ioList .io-entry').forEach(function (row) {
      var r = settings.io[+row.getAttribute('data-i')];
      if (!r || r.dir !== 'in') return;
      var v = row.querySelector('.io-val');
      if (v) runtime.numIn[r.ch] = parseFloat(v.value) || 0;
      var b = row.querySelector('.io-bool input');
      if (b) runtime.boolIn[r.ch] = b.checked;
    });
  }

  function refreshIOInputs() {
    if (!runtime) return;
    qsa('#ioList .io-entry').forEach(function (row) {
      var r = settings.io[+row.getAttribute('data-i')];
      if (!r || r.dir !== 'in') return;
      var v = row.querySelector('.io-val');
      if (v && document.activeElement !== v) v.value = runtime.numIn[r.ch];
      var b = row.querySelector('.io-bool input');
      if (b) b.checked = !!runtime.boolIn[r.ch];
    });
  }

  var ioOutTick = 0;
  function updateIOOutputs() {
    if (!runtime || !settings.io) return;
    ioOutTick++;
    if (ioOutTick % 2 !== 0) return;
    qsa('#ioList .io-entry').forEach(function (row) {
      var r = settings.io[+row.getAttribute('data-i')];
      if (!r || r.dir !== 'out') return;
      if (r.type === 'num') {
        var s = row.querySelector('.io-outnum');
        if (s) { s.textContent = Math.round(runtime.numOut[r.ch] * 100) / 100; s.classList.toggle('on', runtime.numOut[r.ch] !== 0); }
      } else {
        var sb = row.querySelector('.io-outbool');
        if (sb) { var on = !!runtime.boolOut[r.ch]; sb.textContent = on ? 'ВКЛ' : '—'; sb.classList.toggle('on', on); }
      }
    });
  }

  function openAddIO() {
    var html =
      '<label class="fld">Направление<select id="ioDir"><option value="in">Вход (в скрипт)</option><option value="out">Выход (из скрипта)</option></select></label>' +
      '<label class="fld">Тип<select id="ioType"><option value="num">Число</option><option value="bool">Логика (бул)</option></select></label>' +
      '<label class="fld">Канал (1–32)<input type="number" id="ioCh" min="1" max="32" value="' + nextFreeChannel() + '"></label>' +
      '<label class="fld">Название<input type="text" id="ioName" placeholder="Например: Газ"></label>';
    var back = modal('Добавить сигнал', html, function () {
      var dir = back.querySelector('#ioDir').value;
      var type = back.querySelector('#ioType').value;
      var ch = Math.max(1, Math.min(32, Math.round(+back.querySelector('#ioCh').value) || 1));
      var name = back.querySelector('#ioName').value.trim() || ((dir === 'in' ? 'Вход ' : 'Выход ') + ch);
      settings.io.push({ dir: dir, type: type, ch: ch, name: name });
      saveJSON(SETTINGS_KEY, settings);
      if (runtime && dir === 'in') { if (type === 'num') runtime.numIn[ch] = 0; else runtime.boolIn[ch] = false; }
      renderIOList();
    }, 'Добавить');
    setTimeout(function () { var n = back.querySelector('#ioName'); if (n) n.focus(); }, 60);
  }

  // ---------- касания по монитору ----------
  function monitorTouch(evt) {
    if (!runtime) return null;
    var r = el.monitor.getBoundingClientRect();
    var x = (evt.clientX - r.left) * (settings.monitorW / r.width);
    var y = (evt.clientY - r.top) * (settings.monitorH / r.height);
    return { x: Math.round(x), y: Math.round(y) };
  }
  function initMonitorTouch() {
    el.monitor.addEventListener('mousedown', function (e) {
      if (!runtime) return;
      var p = monitorTouch(e);
      // как в игре: каналы 1–2 — размер монитора, 3–6 и булы 1–2 — касания
      runtime.numIn[1] = settings.monitorW;
      runtime.numIn[2] = settings.monitorH;
      if (e.button === 2) { runtime.numIn[5] = p.x; runtime.numIn[6] = p.y; runtime.boolIn[2] = true; }
      else { runtime.numIn[3] = p.x; runtime.numIn[4] = p.y; runtime.boolIn[1] = true; }
      refreshIOInputs();
      e.preventDefault();
    });
    el.monitor.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // масштаб колесом мыши с Ctrl (разрешение не меняется)
    if (el.monitorViewport) {
      el.monitorViewport.addEventListener('wheel', function (e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomMonitor(e.deltaY < 0 ? 1.15 : 0.87);
      }, { passive: false });
    }
    window.addEventListener('mouseup', function () { if (runtime) { runtime.boolIn[1] = false; runtime.boolIn[2] = false; refreshIOInputs(); } });
  }

  // ---------- свойства ----------
  function renderProps() {
    var rows = el.props.querySelectorAll('.prop-row');
    var data = [];
    rows.forEach(function (row) {
      data.push({
        label: row.querySelector('.p-label').value,
        type: row.querySelector('.p-type').value,
        value: row.querySelector('.p-value').value
      });
    });
    el.propsState = data;
    applyProps();
  }
  function applyProps() {
    if (!runtime) return;
    var o = {};
    (el.propsState || []).forEach(function (r) {
      if (!r.label) return;
      if (r.type === 'bool') o[r.label] = (r.value === 'true' || r.value === '1' || r.value === 'да');
      else if (r.type === 'number') o[r.label] = parseFloat(r.value) || 0;
      else o[r.label] = String(r.value);
    });
    runtime.props = o;
  }
  function addPropRow(label, type, value) {
    var row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = '<input class="p-label" placeholder="Метка" value="' + (label || '').replace(/"/g, '&quot;') + '">' +
      '<select class="p-type"><option value="number">число</option><option value="bool">логика</option><option value="string">строка</option></select>' +
      '<input class="p-value" placeholder="значение" value="' + (value === undefined ? '' : String(value)).replace(/"/g, '&quot;') + '">' +
      '<button class="icon-btn p-del" title="Удалить">✕</button>';
    if (type) row.querySelector('.p-type').value = type;
    row.querySelector('.p-del').onclick = function () { row.remove(); renderProps(); };
    row.querySelectorAll('input,select').forEach(function (i) { i.addEventListener('input', renderProps); i.addEventListener('change', renderProps); });
    el.props.appendChild(row);
    renderProps();
  }

  // ---------- вкладки ----------
  function switchTab(name) {
    qsa('.tab-panel').forEach(function (p) { p.classList.toggle('active', p.id === 'tab-' + name); });
    qsa('.tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === name); });
    if (name === 'editor' && cm) { setTimeout(function () { cm.refresh(); fitMonitor(); }, 30); }
  }
  function switchSide(name) {
    qsa('.side-body > div').forEach(function (d) { d.classList.toggle('active', d.getAttribute('data-side') === name); });
    qsa('.side-tabs button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-side') === name); });
    if (name === 'monitor') fitMonitor();
    if (name === 'io' && cm) scanCodeForIO();
  }

  // ---------- примеры / уроки / справочник ----------
  function renderExamples(filter) {
    filter = (filter || '').toLowerCase();
    var html = '<div class="cards">';
    (global.LUNA_EXAMPLES || []).forEach(function (ex) {
      if (filter && (ex.title + ' ' + ex.desc + ' ' + (ex.tags || []).join(' ')).toLowerCase().indexOf(filter) === -1) return;
      html += '<div class="card">' +
        '<h3>' + ex.title + '</h3>' +
        '<div class="tags">' + (ex.tags || []).map(function (t) { return '<span class="tag">' + t + '</span>'; }).join('') + '</div>' +
        '<p>' + ex.desc + '</p>' +
        '<div class="card-actions"><button class="btn primary" data-ex="' + ex.id + '">Открыть в редакторе</button>' +
        '<button class="btn" data-exview="' + ex.id + '">Показать код</button></div>' +
        '<pre class="code snippet" id="ex-' + ex.id + '" style="display:none">' + escapeHtml(ex.code) + '</pre>' +
        '</div>';
    });
    html += '</div>';
    el.examples.innerHTML = html;
    qsa('[data-ex]', el.examples).forEach(function (b) {
      b.onclick = function () {
        var ex = findExample(b.getAttribute('data-ex'));
        if (ex) loadCode(ex.code, ex.title);
      };
    });
    qsa('[data-exview]', el.examples).forEach(function (b) {
      b.onclick = function () {
        var p = $('ex-' + b.getAttribute('data-exview'));
        p.style.display = p.style.display === 'none' ? 'block' : 'none';
      };
    });
  }
  function findExample(id) { var r = null; (global.LUNA_EXAMPLES || []).forEach(function (e) { if (e.id === id) r = e; }); return r; }

  function renderTutorials() {
    var html = '<div class="two-col"><div class="list-col">';
    (global.LUNA_TUTORIALS || []).forEach(function (t, i) {
      html += '<button class="list-item" data-tut="' + t.id + '"><b>' + t.title + '</b><span>' + t.minutes + ' мин</span></button>';
    });
    html += '</div><div class="content-col" id="tutContent"></div></div>';
    el.tutorials.innerHTML = html;
    qsa('[data-tut]', el.tutorials).forEach(function (b) {
      b.onclick = function () { showTutorial(b.getAttribute('data-tut')); };
    });
    if ((global.LUNA_TUTORIALS || []).length) { showTutorial(global.LUNA_TUTORIALS[0].id); qsa('[data-tut]')[0].classList.add('active'); }
  }
  function showTutorial(id) {
    var t = (global.LUNA_TUTORIALS || []).filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    $('tutContent').innerHTML = '<h2>' + t.title + '</h2><p class="muted">' + t.desc + '</p>' + t.body;
    qsa('[data-tut]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tut') === id); });
    el.tutorials.querySelector('.content-col').scrollTop = 0;
  }

  function renderDocs() {
    var html = '<div class="two-col"><div class="list-col">';
    (global.LUNA_DOCS || []).forEach(function (s) {
      html += '<div class="list-group">' + s.icon + ' ' + s.title + '</div>';
      s.articles.forEach(function (a) {
        html += '<button class="list-item" data-doc="' + s.id + '/' + a.id + '">' + a.title + '</button>';
      });
    });
    html += '</div><div class="content-col"><input type="search" id="docSearch" class="search" placeholder="Поиск по справочнику…"><div id="docContent"></div></div></div>';
    el.docs.innerHTML = html;

    qsa('[data-doc]', el.docs).forEach(function (b) {
      b.onclick = function () { showDoc(b.getAttribute('data-doc')); };
    });
    $('docSearch').addEventListener('input', function () {
      var q = this.value.toLowerCase();
      qsa('[data-doc]', el.docs).forEach(function (b) {
        var a = findDoc(b.getAttribute('data-doc'));
        var hay = (a.title + ' ' + a.body).toLowerCase();
        b.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
      });
      if (q.length > 1) {
        var first = null;
        (global.LUNA_DOCS || []).forEach(function (s) { s.articles.forEach(function (a) { if (!first && (a.title + ' ' + a.body).toLowerCase().indexOf(q) !== -1) first = s.id + '/' + a.id; }); });
        if (first) showDoc(first);
      }
    });
    var first = global.LUNA_DOCS[0].id + '/' + global.LUNA_DOCS[0].articles[0].id;
    showDoc(first);
    qsa('[data-doc]', el.docs).forEach(function (b) { if (b.getAttribute('data-doc') === first) b.classList.add('active'); });
  }
  function findDoc(key) {
    var parts = key.split('/');
    var sec = (global.LUNA_DOCS || []).filter(function (s) { return s.id === parts[0]; })[0];
    if (!sec) return { title: '', body: '' };
    return sec.articles.filter(function (a) { return a.id === parts[1]; })[0] || { title: '', body: '' };
  }
  function showDoc(key) {
    var a = findDoc(key);
    var parts = key.split('/');
    var sec = (global.LUNA_DOCS || []).filter(function (s) { return s.id === parts[0]; })[0];
    $('docContent').innerHTML = '<h2>' + (sec ? sec.icon + ' ' : '') + a.title + '</h2>' + a.body;
    qsa('[data-doc]', el.docs).forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-doc') === key); });
  }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ---------- модальное окно ----------
  function modal(title, bodyHtml, onOk, okLabel) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="modal"><h3>' + title + '</h3><div class="modal-body">' + bodyHtml + '</div>' +
      '<div class="modal-actions"><button class="btn" data-cancel>Отмена</button>' +
      (onOk ? '<button class="btn primary" data-ok>' + (okLabel || 'ОК') + '</button>' : '') + '</div></div>';
    document.body.appendChild(back);
    back.querySelector('[data-cancel]').onclick = function () { back.remove(); };
    if (onOk) back.querySelector('[data-ok]').onclick = function () { if (onOk(back) !== false) back.remove(); };
    return back;
  }

  // ---------- сохранение/загрузка ----------
  function saveDraft() {
    drafts = loadJSON(DRAFTS_KEY, []);
    var name = currentName && currentName !== 'Черновик' ? currentName : '';
    var back = modal('Сохранить скрипт', '<label>Имя файла<input id="draftName" value="' + escapeHtml(name) + '"></label>', function () {
      var n = back.querySelector('#draftName').value.trim() || ('Скрипт ' + new Date().toLocaleString());
      var existing = drafts.filter(function (d) { return d.name === n; })[0];
      if (existing) { existing.code = cm.getValue(); existing.date = Date.now(); }
      else drafts.push({ name: n, code: cm.getValue(), date: Date.now() });
      saveJSON(DRAFTS_KEY, drafts);
      currentName = n; dirty = false; updateStatus();
      conInfo('Сохранено: ' + n);
    }, 'Сохранить');
    setTimeout(function () { var i = back.querySelector('#draftName'); if (i) { i.focus(); i.select(); } }, 50);
  }

  function openDrafts() {
    drafts = loadJSON(DRAFTS_KEY, []);
    if (!drafts.length) { conInfo('Сохранённых скриптов пока нет. Нажмите «Сохранить».'); return; }
    var html = '<div class="draft-list">' + drafts.map(function (d, i) {
      return '<div class="draft-item"><button class="btn" data-load="' + i + '">' + escapeHtml(d.name) + '</button>' +
        '<span class="muted small">' + new Date(d.date).toLocaleString() + '</span>' +
        '<button class="icon-btn" data-rm="' + i + '" title="Удалить">✕</button></div>';
    }).join('') + '</div>';
    var back = modal('Мои скрипты', html, null);
    back.querySelectorAll('[data-load]').forEach(function (b) {
      b.onclick = function () { var d = drafts[+b.getAttribute('data-load')]; loadCode(d.code, d.name); back.remove(); };
    });
    back.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () {
        var i = +b.getAttribute('data-rm');
        drafts.splice(i, 1); saveJSON(DRAFTS_KEY, drafts); back.remove(); openDrafts();
      };
    });
  }

  function exportFile() {
    var blob = new Blob([cm.getValue()], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (currentName || 'script').replace(/[\\/:*?"<>|]/g, '_') + '.lua';
    document.body.appendChild(a); a.click(); a.remove();
    conInfo('Экспортировано в ' + a.download);
  }

  function importFile() {
    var input = document.createElement('input');
    input.type = 'file'; input.accept = '.lua,.txt,text/plain';
    input.onchange = function () {
      var f = input.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { loadCode(String(rd.result), f.name.replace(/\.lua$/, '')); conInfo('Импортировано: ' + f.name); };
      rd.readAsText(f, 'utf-8');
    };
    input.click();
  }

  function share() {
    var link = location.href.split('#')[0] + '#code=' + b64enc(cm.getValue());
    var back = modal('Поделиться ссылкой',
      '<p>Ссылка содержит ваш код. Скопируйте и отправьте — при открытии скрипт загрузится автоматически.</p>' +
      '<textarea id="shareLink" readonly style="width:100%;height:80px">' + escapeHtml(link) + '</textarea>', null);
    var ta = back.querySelector('#shareLink');
    ta.focus(); ta.select();
    try { document.execCommand('copy'); conInfo('Ссылка скопирована в буфер обмена.'); } catch (e) { }
    try { history.replaceState(null, '', '#code=' + b64enc(cm.getValue())); } catch (e) { }
  }

  function minifyCode() {
    var res = LuaMinify.minify(cm.getValue());
    var back = modal('Минификация',
      '<p>Размер: <b>' + res.originalLength + '</b> → <b>' + res.minifiedLength + '</b> символов (' +
      Math.round(res.ratio * 100) + '%).</p>' +
      '<p class="' + (res.minifiedLength <= CODE_LIMIT ? 'ok-text' : 'err-text') + '">' +
      (res.minifiedLength <= CODE_LIMIT
        ? 'Влезает в лимит игры — ' + CODE_LIMIT + ' символов.'
        : 'Всё ещё больше лимита игры (' + CODE_LIMIT + ' символов).') + '</p>' +
      '<p class="muted small">Комментарии и лишние пробелы удалены. Смысл кода не меняется.</p>', function () {
      loadCode(res.code, currentName + ' (мини)');
      conInfo('Минифицировано: −' + Math.round(res.ratio * 100) + '%');
    }, 'Заменить в редакторе');
    back.querySelector('.modal-body').insertAdjacentHTML('beforeend',
      '<pre class="code snippet">' + escapeHtml(res.code.slice(0, 1500)) + (res.code.length > 1500 ? '…' : '') + '</pre>');
  }

  function newScript() {
    if (dirty && !confirm('Текущий скрипт не сохранён. Создать новый?')) return;
    loadCode(DEFAULT_CODE, 'Черновик');
  }

  // ---------- инициализация ----------
  function init() {
    el = {
      code: $('code'),
      console: $('console'),
      monitor: $('monitor'),
      io: $('io'),
      props: $('props'),
      examples: $('examplesBody'),
      tutorials: $('tutorialsBody'),
      docs: $('docsBody'),
      builder: $('builderBody'),
      status: $('fileStatus'),
      runtimeInfo: $('runtimeInfo'),
      charCount: $('charCount'),
      limitHint: $('limitHint'),
      btnDonate: $('btnDonate'),
      inpDonate: $('inpDonate'),
      btnRun: $('btnRun'),
      btnStop: $('btnStop'),
      btnStep: $('btnStep'),
      selMonSize: $('selMonSize'),
      monitorViewport: $('monitorViewport'),
      monZoomLabel: $('monZoomLabel'),
      monCustomWrap: $('monCustomWrap'),
      monCustomW: $('monCustomW'),
      monCustomH: $('monCustomH'),
      inpFont: $('inpFont'),
      inpLimit: $('inpLimit')
    };

    // управление окном (только в настольной версии)
    if (global.lunaDesktop) {
      document.body.classList.add('desktop');
      var wmin = $('winMin'), wmax = $('winMax'), wclose = $('winClose');
      if (wmin) wmin.onclick = function () { global.lunaDesktop.minimize(); };
      if (wmax) wmax.onclick = function () { global.lunaDesktop.toggleMaximize(); };
      if (wclose) wclose.onclick = function () { global.lunaDesktop.close(); };
      var brand = document.querySelector('.brand');
      if (brand) brand.addEventListener('dblclick', function () { global.lunaDesktop.toggleMaximize(); });
      if (global.lunaDesktop.onMaximized) {
        global.lunaDesktop.onMaximized(function (isMax) {
          if (!wmax) return;
          wmax.textContent = isMax ? '❐' : '▢';
          wmax.title = isMax ? 'Восстановить' : 'Развернуть';
        });
      }
    }
    // поддержка проекта
    if (el.btnDonate) el.btnDonate.onclick = openDonateDialog;
    if (el.inpDonate) el.inpDonate.oninput = function () {
      settings.donateUrl = this.value.trim();
      saveJSON(SETTINGS_KEY, settings);
      syncDonateField();
    };
    if ($('btnDonateOpen')) $('btnDonateOpen').onclick = function () { openUrl(settings.donateUrl); };
    if ($('btnDonateClear')) $('btnDonateClear').onclick = function () {
      settings.donateUrl = ''; saveJSON(SETTINGS_KEY, settings); syncDonateField();
    };

    if ($('btnAbout')) $('btnAbout').onclick = function () {
      if (global.lunaDesktop && global.lunaDesktop.about) { global.lunaDesktop.about(); return; }
      modal('О программе',
        '<p>Луна IDE — русский редактор Lua для Stormworks: Build and Rescue.</p>' +
        '<p class="muted small">Разработчик: <b>' + DEVELOPER + '</b>.</p>' +
        '<p class="muted small">Работает полностью офлайн. Lua 5.3 (Fengari), CodeMirror 5.<br>' +
        'Неофициальный инструмент, не связанный с разработчиками Stormworks.</p>' +
        '<p class="muted small">Новости и обновления — Telegram-канал:<br>' +
        '<a href="' + TELEGRAM_URL + '" target="_blank" rel="noopener">' + TELEGRAM_URL + '</a></p>', null);
    };

    var saved = loadJSON(SETTINGS_KEY, {});
    settings = Object.assign(settings, saved);
    // миграция старого неигрового размера 256×256 на реальный 5×3 (160×96)
    if (!saved._v && settings.monitorW === 256 && settings.monitorH === 256) { settings.monitorW = 160; settings.monitorH = 96; }
    settings._v = 2;

    buildMonitorSelects();

    initEditor();
    initRuntime();
    initMonitorTouch();
    updateStatus();

    // верхние вкладки
    qsa('.tabs button').forEach(function (b) { b.onclick = function () { switchTab(b.getAttribute('data-tab')); }; });
    qsa('.side-tabs button').forEach(function (b) { b.onclick = function () { switchSide(b.getAttribute('data-side')); }; });

    // кнопки
    el.btnRun.onclick = runCode;
    el.btnStop.onclick = function () { stopRun(); };
    el.btnStep.onclick = step;
    $('btnMinify').onclick = minifyCode;
    $('btnShare').onclick = share;
    $('btnSave').onclick = saveDraft;
    $('btnOpen').onclick = openDrafts;
    $('btnExport').onclick = exportFile;
    $('btnImport').onclick = importFile;
    $('btnNew').onclick = newScript;
    $('btnClearConsole').onclick = clearConsole;
    $('btnAddProp').onclick = function () { addPropRow('', 'number', 0); };

    // размер монитора (оба селекта) + свой размер
    function onMonSizeSelect(v) {
      if (v === 'custom') { if (el.monCustomWrap) el.monCustomWrap.style.display = 'flex'; return; }
      var parts = v.split('x');
      setMonitorSize(+parts[0], +parts[1]);
    }
    el.selMonSize.onchange = function () { onMonSizeSelect(this.value); };
    var sel2b = document.getElementById('selMonSize2');
    if (sel2b) sel2b.onchange = function () { onMonSizeSelect(this.value); };
    if ($('monCustomApply')) $('monCustomApply').onclick = function () {
      setMonitorSize(+el.monCustomW.value || 160, +el.monCustomH.value || 96);
    };

    // масштаб отображения монитора (разрешение не меняется)
    if ($('monZoomIn')) $('monZoomIn').onclick = function () { zoomMonitor(1.25); };
    if ($('monZoomOut')) $('monZoomOut').onclick = function () { zoomMonitor(0.8); };
    if ($('monFit')) $('monFit').onclick = function () { setZoomMode(0); };
    if ($('mon100')) $('mon100').onclick = function () { setZoomMode(1); };
    if ($('monFull')) $('monFull').onclick = function () { toggleMonitorFullscreen(); };
    var fsHappened = false;
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    function onFullscreenChange() {
      var on = !!(document.fullscreenElement || document.webkitFullscreenElement);
      if (on) { fsHappened = true; fsPrevZoom = settings.monitorZoom; settings.monitorZoom = 0; }
      else if (fsHappened) { if (fsPrevZoom !== null) settings.monitorZoom = fsPrevZoom; fsPrevZoom = null; fsHappened = false; }
      setTimeout(fitMonitor, 60);
    }
    el.inpFont.oninput = function () { settings.fontSize = +this.value || 14; applySettings(); };
    el.inpLimit.oninput = function () { settings.maxInstructions = +this.value || 20000000; saveJSON(SETTINGS_KEY, settings); };
    qsa('[data-theme]').forEach(function (b) {
      b.onclick = function () { settings.theme = b.getAttribute('data-theme'); applySettings(); };
    });

    // контент вкладок
    renderExamples();
    $('exSearch').addEventListener('input', function () { renderExamples(this.value); });
    renderTutorials();
    renderDocs();
    global.LunaUIBuilder.create().mount(el.builder);

    // свойства по умолчанию
    addPropRow('Коэффициент', 'number', 2);
    addPropRow('Включено', 'bool', 'true');

    // ссылка-шаринг
    if (location.hash.indexOf('#code=') === 0) {
      try { cm.setValue(b64dec(location.hash.slice(6))); currentName = 'Из ссылки'; updateStatus(); } catch (e) { }
    }

    window.addEventListener('resize', fitMonitor);
    conInfo('Луна IDE готова. Нажмите ▶ Запустить или откройте вкладку «Уроки».');
  }

  global.LunaApp = { loadCode: loadCode, run: runCode };
  document.addEventListener('DOMContentLoaded', init);
})(window);
