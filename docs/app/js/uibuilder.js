/*
 * Луна IDE — визуальный конструктор экранов.
 *   - выбор реального монитора из игры (1 блок = 32×32 px);
 *   - цвет фона экрана, цвет заливки и цвет текста;
 *   - у кнопок — отдельный цвет в обычном состоянии и в нажатом;
 *   - генерация готового Lua-кода (onTick + onDraw).
 * ВАЖНО: весь текст, который выводится на экран, — только латиницей (шрифт игры).
 */
(function (global) {
  'use strict';

  var DEFAULT_MONITORS = [
    { label: 'Monitor 1×1', w: 32, h: 32 },
    { label: 'Monitor 1×2', w: 32, h: 64 },
    { label: 'Monitor 1×3', w: 32, h: 96 },
    { label: 'Monitor 2×2', w: 64, h: 64 },
    { label: 'Monitor 2×3', w: 64, h: 96 },
    { label: 'Monitor 3×3 / HUD 3×3', w: 96, h: 96 },
    { label: 'Monitor 3×5', w: 160, h: 96 },
    { label: 'Monitor 9×5', w: 288, h: 160 }
  ];

  // Тексты на экране — только латиница.
  var TYPES = {
    text:   { label: '📝 Текст',         text: 'Text',    textColor: [255, 255, 255] },
    button: { label: '🔘 Кнопка',        w: 110, h: 32, text: 'Button', color: [90, 90, 110],  colorPressed: [60, 200, 80], textColor: [255, 255, 255] },
    toggle: { label: '🎚️ Переключатель', w: 110, h: 32, text: 'ON/OFF', color: [80, 80, 95],   colorPressed: [60, 200, 80], textColor: [255, 255, 255] },
    bar:    { label: '📊 Полоса',        w: 140, h: 20, value: 0.6,      color: [80, 200, 90],  colorBg: [120, 120, 130] },
    rect:   { label: '⬛ Прямоугольник',  w: 80,  h: 60,                  color: [120, 120, 130] },
    circle: { label: '⭕ Круг',            r: 30,                          color: [80, 200, 255] }
  };

  // Готовые темы: фон экрана + цвета элементов (одним кликом).
  var THEMES = [
    { name: 'Тёмная приборная панель', bg: [16, 24, 32],  fill: [30, 42, 56],  accent: [74, 208, 255], text: [230, 237, 245], pressed: [46, 204, 113], barBg: [34, 48, 64] },
    { name: 'Зелёный терминал',        bg: [5, 16, 10],   fill: [11, 42, 24],  accent: [51, 255, 136], text: [124, 255, 178], pressed: [168, 255, 96], barBg: [15, 58, 34] },
    { name: 'Янтарная авионика',       bg: [20, 15, 0],   fill: [42, 30, 0],   accent: [255, 176, 0],  text: [255, 209, 102], pressed: [255, 233, 120], barBg: [58, 42, 0] },
    { name: 'Светлая',                 bg: [232, 236, 242], fill: [185, 196, 212], accent: [13, 122, 209], text: [20, 32, 46], pressed: [46, 204, 113], barBg: [205, 214, 227] },
    { name: 'Тревожная (красная)',     bg: [18, 6, 8],    fill: [58, 16, 21],  accent: [255, 77, 77],  text: [255, 222, 222], pressed: [255, 138, 0], barBg: [74, 26, 32] }
  ];

  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'); }
  function rgb(c) { return (c[0] | 0) + ', ' + (c[1] | 0) + ', ' + (c[2] | 0); }
  function hex(c) { return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.max(0, Math.min(255, c[i] | 0)).toString(16)).slice(-2); }).join(''); }
  function fromHex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function cssColor(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  function create() {
    var state = {
      elements: [],
      selected: -1,
      monW: 160, monH: 96, monLabel: 'Monitor 3×5',
      bg: [16, 16, 22]
    };
    var container, canvas, ctx, preview, pctx, props, codeOut, info, prevInfo, bgInput;
    var drag = null;
    var styleClip = null;   // буфер стиля (цвета, скопированные с элемента)

    function uid() { return 'el' + (state.elements.length + 1) + '_' + Math.floor(Math.random() * 1000); }
    function monitors() { return global.LUNA_MONITORS || DEFAULT_MONITORS; }
    function bbox(el) {
      if (el.type === 'circle') return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
      if (el.type === 'text') return { x: el.x, y: el.y, w: 60, h: 12 };
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    }

    function addElement(type) {
      var def = TYPES[type];
      var el = { type: type, x: 24 + (state.elements.length % 5) * 12, y: 24 + (state.elements.length % 5) * 14 };
      ['color', 'colorPressed', 'colorBg', 'textColor'].forEach(function (k) { if (def[k]) el[k] = def[k].slice(); });
      if (def.w) el.w = def.w;
      if (def.h) el.h = def.h;
      if (def.r) el.r = def.r;
      if (def.value !== undefined) el.value = def.value;
      if (def.text !== undefined) el.text = def.text;
      el._id = uid();
      state.elements.push(el);
      state.selected = state.elements.length - 1;
      clampElements();
      render();
    }

    // держим элементы внутри экрана (с учётом их размера)
    function clampElement(el) {
      var bw = el.type === 'circle' ? el.r * 2 : (el.w || 60);
      var bh = el.type === 'circle' ? el.r * 2 : (el.h || 12);
      el.x = Math.max(0, Math.min(Math.max(0, state.monW - bw), el.x));
      el.y = Math.max(0, Math.min(Math.max(0, state.monH - bh), el.y));
    }
    function clampElements() { state.elements.forEach(clampElement); }

    function drawElement(c, el, selected) {
      var col = cssColor(el.color || el.textColor);
      c.lineWidth = 1;
      if (el.type === 'text') { c.fillStyle = cssColor(el.textColor); c.font = '10px monospace'; c.fillText(el.text, el.x, el.y + 8); }
      else if (el.type === 'rect') { c.strokeStyle = col; c.strokeRect(el.x + 0.5, el.y + 0.5, el.w, el.h); }
      else if (el.type === 'circle') { c.strokeStyle = col; c.beginPath(); c.arc(el.x, el.y, el.r, 0, Math.PI * 2); c.stroke(); }
      else if (el.type === 'bar') {
        c.strokeStyle = cssColor(el.colorBg); c.strokeRect(el.x + 0.5, el.y + 0.5, el.w, el.h);
        c.fillStyle = col; c.fillRect(el.x, el.y, el.w * (el.value || 0), el.h);
      } else { // button / toggle — в конструкторе показываем «не нажатый» цвет
        c.fillStyle = cssColor(el.color); c.fillRect(el.x, el.y, el.w, el.h);
        c.fillStyle = cssColor(el.textColor); c.font = '10px monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(el.text, el.x + el.w / 2, el.y + el.h / 2);
        c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      }
      if (selected) { c.strokeStyle = '#5ad1ff'; c.strokeRect(el.x - 2.5, el.y - 2.5, (el.w || 60) + 5, (el.h || 12) + 5); }
    }

    function drawCanvas() {
      var W = state.monW, H = state.monH;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = cssColor(state.bg); ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      for (var g = 0; g <= W; g += 32) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke(); }
      for (var h = 0; h <= H; h += 32) { ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(W, h); ctx.stroke(); }
      state.elements.forEach(function (el, i) { drawElement(ctx, el, i === state.selected); });
    }

    // ---------- вывод «как будет на мониторе» (1:1, без сетки и выделения) ----------
    function drawPreview() {
      var W = state.monW, H = state.monH;
      pctx.clearRect(0, 0, W, H);
      pctx.fillStyle = cssColor(state.bg); pctx.fillRect(0, 0, W, H);
      state.elements.forEach(function (el) { drawElement(pctx, el, false); });
    }
    function redraw() { drawCanvas(); drawPreview(); }

    function render() {
      canvas.width = state.monW; canvas.height = state.monH;
      var z = Math.min(8, Math.max(1, 300 / state.monW));
      canvas.style.width = Math.round(state.monW * z) + 'px';
      canvas.style.height = 'auto';
      preview.width = state.monW; preview.height = state.monH;
      preview.style.width = state.monW + 'px';
      preview.style.height = 'auto';
      drawCanvas(); drawPreview(); renderProps(); renderCode(); renderInfo();
    }

    function renderInfo() {
      info.textContent = state.monLabel + ' — ' + state.monW + '×' + state.monH + ' px (1 блок = 32 px)';
      if (prevInfo) prevInfo.textContent = 'как на мониторе · 1:1 · ' + state.monW + '×' + state.monH + ' px';
    }

    function colorRow(prop, label) {
      return '<label>' + label + '<input type="color" data-c="' + prop + '" value="' + hex(state.elements[state.selected][prop]) + '"></label>';
    }

    // ---------- темы и стили ----------
    function styleKeysFor(type) {
      if (type === 'button' || type === 'toggle') return ['color', 'colorPressed', 'textColor'];
      if (type === 'text') return ['textColor'];
      if (type === 'bar') return ['color', 'colorBg'];
      return ['color'];
    }
    function typeName(t) {
      return ({ text: 'текста', button: 'кнопки', toggle: 'переключателя', bar: 'полосы', rect: 'прямоугольника', circle: 'круга' })[t] || t;
    }
    function applyTheme(t) {
      state.bg = t.bg.slice();
      state.elements.forEach(function (el) {
        if (el.type === 'button' || el.type === 'toggle') { el.color = t.fill.slice(); el.colorPressed = t.pressed.slice(); el.textColor = t.text.slice(); }
        else if (el.type === 'text') { el.textColor = t.text.slice(); }
        else if (el.type === 'bar') { el.color = t.accent.slice(); el.colorBg = t.barBg.slice(); }
        else { el.color = t.fill.slice(); }
      });
      if (bgInput) bgInput.value = hex(state.bg);
      redraw(); renderProps(); renderCode();
    }
    function copyStyle(el) {
      styleClip = { _from: el.type };
      styleKeysFor(el.type).forEach(function (k) { if (el[k]) styleClip[k] = el[k].slice(); });
      renderProps();
    }
    function pasteStyleTo(el) {
      if (!styleClip) return;
      styleKeysFor(el.type).forEach(function (k) { if (styleClip[k]) el[k] = styleClip[k].slice(); });
    }

    function renderProps() {
      var el = state.elements[state.selected];
      if (!el) { props.innerHTML = '<p class="muted">Выберите элемент на холсте или добавьте новый.</p>'; return; }
      var html = '<div class="prop-grid">';
      function num(name, label) { html += '<label>' + label + '<input type="number" data-p="' + name + '" value="' + (el[name] | 0) + '"></label>'; }
      num('x', 'X'); num('y', 'Y');
      if (el.type === 'rect' || el.type === 'button' || el.type === 'toggle' || el.type === 'bar') { num('w', 'Ширина'); num('h', 'Высота'); }
      if (el.type === 'circle') { num('r', 'Радиус'); }
      if (el.type === 'bar') { html += '<label>Значение (0..1)<input type="number" step="0.05" min="0" max="1" data-p="value" value="' + (el.value || 0) + '"></label>'; }
      if (el.type === 'text' || el.type === 'button' || el.type === 'toggle') { html += '<label class="wide">Текст на экране<input type="text" data-p="text" value="' + String(el.text).replace(/"/g, '&quot;') + '"></label>'; }
      if (el.type === 'button' || el.type === 'toggle') {
        html += colorRow('color', 'Цвет (не нажата)');
        html += colorRow('colorPressed', 'Цвет при нажатии');
        html += colorRow('textColor', 'Цвет текста');
      } else if (el.type === 'text') {
        html += colorRow('textColor', 'Цвет текста');
      } else if (el.type === 'bar') {
        html += colorRow('color', 'Цвет заливки');
        html += colorRow('colorBg', 'Цвет фона (рамка)');
      } else {
        html += colorRow('color', 'Цвет заливки');
      }
      html += '</div>';
      if (el.type === 'text' || el.type === 'button' || el.type === 'toggle') html += '<p class="muted small">Надпись — только латиницей: шрифт Stormworks не поддерживает кириллицу.</p>';
      html += '<div class="prop-actions">' +
        '<button class="btn small" id="uiCopyStyle">Копировать стиль</button>' +
        '<button class="btn small" id="uiPasteStyle"' + (styleClip ? '' : ' disabled') + '>Вставить стиль</button>' +
        '<button class="btn small" id="uiPasteAll"' + (styleClip ? '' : ' disabled') + '>Стиль всем</button>' +
        '</div>' +
        '<p class="muted small" id="uiStyleNote">' + (styleClip ? 'В буфере: стиль ' + typeName(styleClip._from) : 'Скопируйте стиль, чтобы перенести цвета на другой элемент.') + '</p>' +
        '<button class="btn danger" id="uiDel">Удалить элемент</button>';
      props.innerHTML = html;

      props.querySelectorAll('input[data-p]').forEach(function (inp) {
        inp.addEventListener('input', function () {
          var p = inp.getAttribute('data-p'), v = inp.value;
          if (p === 'value') el.value = Math.max(0, Math.min(1, +v));
          else if (p === 'text') el.text = v;
          else el[p] = isNaN(+v) ? 0 : +v;
          redraw(); renderCode(); renderInfo();
        });
      });
      props.querySelectorAll('input[data-c]').forEach(function (inp) {
        inp.addEventListener('input', function () { el[inp.getAttribute('data-c')] = fromHex(inp.value); redraw(); renderCode(); });
      });
      props.querySelector('#uiDel').onclick = function () { state.elements.splice(state.selected, 1); state.selected = -1; render(); };
      props.querySelector('#uiCopyStyle').onclick = function () { copyStyle(el); };
      props.querySelector('#uiPasteStyle').onclick = function () { pasteStyleTo(el); redraw(); renderProps(); renderCode(); };
      props.querySelector('#uiPasteAll').onclick = function () { state.elements.forEach(pasteStyleTo); redraw(); renderProps(); renderCode(); };
    }

    // ---------- генерация Lua ----------
    function renderCode() {
      var L = [], outs = 0, MW = state.monW, MH = state.monH;
      L.push('-- Сгенерировано конструктором интерфейса «Луна IDE»');
      L.push('-- Монитор: ' + state.monLabel + ' — ' + MW + 'x' + MH + ' px');
      L.push('-- Текст на экране — только латиницей (кириллицу шрифт игры не поддерживает).');
      L.push('');
      L.push('local MON_W, MON_H = ' + MW + ', ' + MH);
      L.push('');
      L.push('local function inBox(px, py, x, y, w, h)');
      L.push('    return px >= x and px <= x + w and py >= y and py <= y + h');
      L.push('end');
      L.push('');

      var interactive = [];
      state.elements.forEach(function (el) {
        if (el.type === 'button' || el.type === 'toggle') {
          L.push('local ' + el._id + ' = { x = ' + (el.x | 0) + ', y = ' + (el.y | 0) + ', w = ' + (el.w | 0) + ', h = ' + (el.h | 0) + ' }');
          L.push('local ' + el._id + '_on = false');
          interactive.push({ el: el, n: ++outs });
        }
      });
      if (interactive.length) L.push('local prevQ, prevE = false, false');
      L.push('');
      L.push('function onTick()');
      if (interactive.length) {
        L.push('    local x1, y1 = input.getNumber(3), input.getNumber(4)   -- нажатие Q');
        L.push('    local x2, y2 = input.getNumber(5), input.getNumber(6)   -- нажатие E');
        L.push('    local q, e = input.getBool(1), input.getBool(2)');
        interactive.forEach(function (it) {
          var b = it.el._id + '.x, ' + it.el._id + '.y, ' + it.el._id + '.w, ' + it.el._id + '.h';
          if (it.el.type === 'button') {
            L.push('    ' + it.el._id + '_on = (q and inBox(x1, y1, ' + b + '))');
            L.push('                or (e and inBox(x2, y2, ' + b + '))');
          } else {
            L.push('    if q and not prevQ and inBox(x1, y1, ' + b + ') then');
            L.push('        ' + it.el._id + '_on = not ' + it.el._id + '_on');
            L.push('    end');
          }
        });
        L.push('    prevQ, prevE = q, e');
        interactive.forEach(function (it) { L.push('    output.setBool(' + it.n + ', ' + it.el._id + '_on)'); });
      } else {
        L.push('    -- (в интерфейсе нет интерактивных элементов)');
      }
      L.push('end');
      L.push('');
      L.push('function onDraw()');
      L.push('    screen.drawClear(' + rgb(state.bg) + ', 255)');
      state.elements.forEach(function (el) {
        if (el.type === 'text') {
          L.push('    screen.setColor(' + rgb(el.textColor) + ')');
          L.push('    screen.drawText(' + (el.x | 0) + ', ' + (el.y | 0) + ', "' + esc(el.text) + '")');
        } else if (el.type === 'rect') {
          L.push('    screen.setColor(' + rgb(el.color) + ')');
          L.push('    screen.drawRectF(' + (el.x | 0) + ', ' + (el.y | 0) + ', ' + (el.w | 0) + ', ' + (el.h | 0) + ')');
        } else if (el.type === 'circle') {
          L.push('    screen.setColor(' + rgb(el.color) + ')');
          L.push('    screen.drawCircleF(' + (el.x | 0) + ', ' + (el.y | 0) + ', ' + (el.r | 0) + ')');
        } else if (el.type === 'bar') {
          L.push('    local bw = ' + (el.w | 0) + ' * ' + (el.value || 0).toFixed(2));
          L.push('    screen.setColor(' + rgb(el.colorBg) + ')');
          L.push('    screen.drawRect(' + (el.x | 0) + ', ' + (el.y | 0) + ', ' + (el.w | 0) + ', ' + (el.h | 0) + ')');
          L.push('    screen.setColor(' + rgb(el.color) + ')');
          L.push('    screen.drawRectF(' + (el.x | 0) + ', ' + (el.y | 0) + ', bw, ' + (el.h | 0) + ')');
        } else if (el.type === 'button' || el.type === 'toggle') {
          L.push('    if ' + el._id + '_on then screen.setColor(' + rgb(el.colorPressed) + ') else screen.setColor(' + rgb(el.color) + ') end');
          L.push('    screen.drawRectF(' + el._id + '.x, ' + el._id + '.y, ' + el._id + '.w, ' + el._id + '.h)');
          L.push('    screen.setColor(' + rgb(el.textColor) + ')');
          L.push('    screen.drawTextBox(' + el._id + '.x, ' + el._id + '.y, ' + el._id + '.w, ' + el._id + '.h, "' + esc(el.text) + '", 0, 0)');
        }
      });
      L.push('end');
      codeOut.value = L.join('\n');
    }

    // ---------- мышь ----------
    function canvasPos(evt) {
      var r = canvas.getBoundingClientRect();
      return { x: (evt.clientX - r.left) * (state.monW / r.width), y: (evt.clientY - r.top) * (state.monH / r.height) };
    }
    function hitTest(p) {
      for (var i = state.elements.length - 1; i >= 0; i--) {
        var b = bbox(state.elements[i]);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return i;
      }
      return -1;
    }

    function mount(el) {
      container = el;
      var opts = monitors().map(function (m, i) {
        return '<option value="' + i + '"' + ((m.w === state.monW && m.h === state.monH) ? ' selected' : '') + '>' + m.label + ' — ' + m.w + '×' + m.h + ' px</option>';
      }).join('');

      container.innerHTML =
        '<div class="builder">' +
        '  <div class="builder-side">' +
        '    <section class="panel"><h4>Экран</h4>' +
        '      <label class="fld">Монитор<select id="uiMon">' + opts + '</select></label>' +
        '      <label class="fld">Готовая тема<select id="uiTheme"><option value="">— выбрать —</option>' +
        THEMES.map(function (t, i) { return '<option value="' + i + '">' + t.name + '</option>'; }).join('') +
        '      </select></label>' +
        '      <label class="fld">Цвет фона экрана<input type="color" id="uiBg" value="' + hex(state.bg) + '"></label>' +
        '    </section>' +
        '    <section class="panel"><h4>Добавить элемент</h4><div class="palette-grid">' +
        Object.keys(TYPES).map(function (k) { return '<button class="btn" data-add="' + k + '">' + TYPES[k].label + '</button>'; }).join('') +
        '    </div><p class="muted small">Кликните элемент, затем перетаскивайте его мышью на холсте.</p></section>' +
        '  </div>' +
        '  <div class="builder-center">' +
        '    <div class="row-between"><h4>Холст</h4><span class="muted small" id="uiInfo"></span></div>' +
        '    <canvas id="uiCanvas"></canvas>' +
        '  </div>' +
        '  <div class="builder-props panel"><h4>Свойства</h4><div id="uiProps"></div></div>' +
        '  <div class="builder-preview panel"><h4>Вывод на монитор</h4><canvas id="uiPreview"></canvas>' +
        '    <p class="muted small" id="uiPrevInfo"></p></div>' +
        '</div>' +
        '<div class="builder-code"><div class="row-between"><h4>Готовый код</h4>' +
        '<div><button class="btn" id="uiCopy">Скопировать</button> <button class="btn primary" id="uiInsert">Вставить в редактор</button></div></div>' +
        '<textarea id="uiCode" spellcheck="false" readonly></textarea></div>';

      canvas = container.querySelector('#uiCanvas');
      ctx = canvas.getContext('2d');
      preview = container.querySelector('#uiPreview');
      pctx = preview.getContext('2d');
      props = container.querySelector('#uiProps');
      codeOut = container.querySelector('#uiCode');
      info = container.querySelector('#uiInfo');
      prevInfo = container.querySelector('#uiPrevInfo');

      var selMon = container.querySelector('#uiMon');
      selMon.onchange = function () {
        var m = monitors()[+selMon.value];
        if (m) { state.monW = m.w; state.monH = m.h; state.monLabel = m.label; }
        clampElements(); render();
      };
      bgInput = container.querySelector('#uiBg');
      bgInput.oninput = function () { state.bg = fromHex(bgInput.value); redraw(); renderCode(); };
      var selTheme = container.querySelector('#uiTheme');
      selTheme.onchange = function () { if (this.value !== '') applyTheme(THEMES[+this.value]); };

      container.querySelectorAll('[data-add]').forEach(function (b) {
        b.onclick = function () { addElement(b.getAttribute('data-add')); };
      });

      canvas.addEventListener('mousedown', function (e) {
        var p = canvasPos(e), i = hitTest(p);
        state.selected = i;
        if (i >= 0) drag = { i: i, dx: p.x - state.elements[i].x, dy: p.y - state.elements[i].y };
        render();
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        var p = canvasPos(e), el = state.elements[drag.i];
        el.x = Math.round(p.x - drag.dx); el.y = Math.round(p.y - drag.dy);
        redraw(); renderCode();
      });
      window.addEventListener('mouseup', function () { if (drag) { drag = null; renderProps(); } });

      container.querySelector('#uiCopy').onclick = function () {
        codeOut.removeAttribute('readonly'); codeOut.select(); document.execCommand('copy'); codeOut.setAttribute('readonly', '');
        this.textContent = 'Скопировано!'; var b = this; setTimeout(function () { b.textContent = 'Скопировать'; }, 1200);
      };
      container.querySelector('#uiInsert').onclick = function () {
        if (global.LunaApp && global.LunaApp.loadCode) global.LunaApp.loadCode(codeOut.value, 'Интерфейс из конструктора');
      };

      render();
    }

    return { mount: mount, getCode: function () { return codeOut ? codeOut.value : ''; } };
  }

  global.LunaUIBuilder = { create: create };
})(window);
