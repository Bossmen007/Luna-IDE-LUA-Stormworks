/*
 * Луна IDE — визуальный конструктор экранов.
 *   - выбор реального монитора из игры (1 блок = 32×32 px);
 *   - элементы приборной панели: триггеры, индикаторы (бул), полоса, шкалы,
 *     диал, график, 7-сегментный индикатор, сегментные индикаторы и батарея;
 *   - у индикаторов задаётся диапазон значений (Мин/Макс) и цвета по порогам;
 *   - привязка к каналу входа композита (1–32) или постоянное значение;
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

  // Базовые настройки по типам. Варианты (тумблер ↕/↔, шкала, диал, график)
  // отличаются одним свойством и собраны в палитре ниже.
  var TYPES = {
    text:   { text: 'Text', textColor: [255, 255, 255] },
    button: { w: 110, h: 32, text: 'Button', color: [90, 90, 110], colorPressed: [60, 200, 80], textColor: [255, 255, 255], bind: 1, out: 1 },
    toggle: { w: 110, h: 32, text: 'ON/OFF', color: [80, 80, 95], colorPressed: [60, 200, 80], textColor: [255, 255, 255], bind: 1, out: 1 },
    switch: { w: 34, h: 58, orient: 'v', color: [70, 78, 92], colorOn: [60, 200, 80], colorOff: [40, 46, 56], textColor: [235, 240, 245], bind: 1, out: 1 },
    lamp:   { w: 28, h: 28, shape: 'round', colorOff: [60, 66, 78], colorOn: [60, 200, 80], bind: 1, bindType: 'bool', label: '' },
    bar:    { w: 140, h: 20, value: 60, min: 0, max: 100, bind: 1, color: [80, 200, 90], colorBg: [120, 120, 130], t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    gauge:  { w: 140, h: 30, orient: 'h', value: 60, min: 0, max: 100, bind: 1, color: [90, 170, 255], colorBg: [120, 120, 130], ticks: 5, textColor: [220, 228, 238], t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    dial:   { r: 40, sweep: 270, value: 60, min: 0, max: 100, bind: 1, color: [235, 240, 245], colorBg: [70, 78, 92], ticks: 9, t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    graph:  { w: 140, h: 56, style: 'line', value: 60, min: 0, max: 100, bind: 1, color: [80, 200, 255], colorBg: [30, 38, 50], t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    seg7:   { w: 42, h: 20, digits: 2, value: 42, min: 0, max: 99, bind: 1, color: [90, 220, 130], colorOff: [34, 44, 40], decimals: 0, t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    segbar: { w: 88, h: 14, segments: 8, value: 60, min: 0, max: 100, bind: 1, color: [90, 190, 255], colorOff: [40, 48, 58], t1: 0.7, c1: [255, 176, 0], t2: 0.9, c2: [255, 77, 77] },
    battery:{ w: 52, h: 22, segments: 8, value: 60, min: 0, max: 100, bind: 1, color: [90, 220, 130], colorOff: [36, 44, 52], colorBg: [120, 130, 145], t1: 0.25, c1: [255, 176, 0], t2: 0.1, c2: [255, 77, 77], invert: true },
    rect:   { w: 80, h: 60, color: [120, 120, 130] },
    circle: { r: 30, color: [80, 200, 255] }
  };

  // Палитра: несколько видов одних и тех же элементов.
  var PALETTE = [
    { t: 'text',    label: '📝 Текст' },
    { t: 'rect',    label: '⬛ Прямоуг.' },
    { t: 'circle',  label: '⭕ Круг' },
    { t: 'button',  label: '🔘 Кнопка' },
    { t: 'toggle',  label: '🎚 Фиксатор' },
    { t: 'switch',  p: { orient: 'v' }, label: '🎛 Тумблер ↕' },
    { t: 'switch',  p: { orient: 'h' }, label: '🎛 Тумблер ↔' },
    { t: 'lamp',    p: { shape: 'round' }, label: '💡 Лампа бул' },
    { t: 'lamp',    p: { shape: 'rect' },  label: '▮ Индикатор бул' },
    { t: 'bar',     label: '📊 Полоса' },
    { t: 'gauge',   p: { orient: 'h' }, label: '📏 Шкала ↔' },
    { t: 'gauge',   p: { orient: 'v' }, label: '📏 Шкала ↕' },
    { t: 'dial',    p: { sweep: 270 }, label: '🧭 Диал 270°' },
    { t: 'dial',    p: { sweep: 180 }, label: '🧭 Диал 180°' },
    { t: 'graph',   p: { style: 'line' }, label: '📈 График линия' },
    { t: 'graph',   p: { style: 'fill' }, label: '📉 График заливка' },
    { t: 'graph',   p: { style: 'bars' }, label: '📊 График столбики' },
    { t: 'seg7',    label: '🔢 7-сегмент' },
    { t: 'segbar',  label: '▮▮ Сегменты' },
    { t: 'battery', label: '🔋 Батарея' }
  ];

  // Типы со значением (диапазон + пороги цвета)
  var VALUE_TYPES = { bar: 1, gauge: 1, dial: 1, graph: 1, seg7: 1, segbar: 1, battery: 1 };
  // Типы с привязкой к логическому входу
  var BOOL_TYPES = { lamp: 1 };
  // Интерактивные (дают выход из скрипта)
  var INTERACTIVE = { button: 1, toggle: 1, switch: 1 };
  // Элементы с размерами
  var SIZE_TYPES = { button: 1, toggle: 1, switch: 1, lamp: 1, bar: 1, gauge: 1, graph: 1, seg7: 1, segbar: 1, battery: 1, rect: 1 };

  // Готовые темы: фон экрана + цвета элементов (одним кликом).
  var THEMES = [
    { name: 'Тёмная приборная панель', bg: [16, 24, 32],  fill: [30, 42, 56],  accent: [74, 208, 255], text: [230, 237, 245], pressed: [46, 204, 113], barBg: [34, 48, 64] },
    { name: 'Зелёный терминал',        bg: [5, 16, 10],   fill: [11, 42, 24],  accent: [51, 255, 136], text: [124, 255, 178], pressed: [168, 255, 96], barBg: [15, 58, 34] },
    { name: 'Янтарная авионика',       bg: [20, 15, 0],   fill: [42, 30, 0],   accent: [255, 176, 0],  text: [255, 209, 102], pressed: [255, 233, 120], barBg: [58, 42, 0] },
    { name: 'Светлая',                 bg: [232, 236, 242], fill: [185, 196, 212], accent: [13, 122, 209], text: [20, 32, 46], pressed: [46, 204, 113], barBg: [205, 214, 227] },
    { name: 'Тревожная (красная)',     bg: [18, 6, 8],    fill: [58, 16, 21],  accent: [255, 77, 77],  text: [255, 222, 222], pressed: [255, 138, 0], barBg: [74, 26, 32] }
  ];

  var TYPE_LABEL = {
    text: 'текста', button: 'кнопки', toggle: 'фиксатора', switch: 'тумблера', lamp: 'индикатора',
    bar: 'полосы', gauge: 'шкалы', dial: 'диала', graph: 'графика',
    seg7: '7-сегментного индикатора', segbar: 'сегментного индикатора', battery: 'батареи',
    rect: 'прямоугольника', circle: 'круга'
  };

  function esc(s) { return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'); }
  function rgb(c) { return (c[0] | 0) + ', ' + (c[1] | 0) + ', ' + (c[2] | 0); }
  function hex(c) { return '#' + [0, 1, 2].map(function (i) { return ('0' + Math.max(0, Math.min(255, c[i] | 0)).toString(16)).slice(-2); }).join(''); }
  function fromHex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
  function cssColor(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  // нормализованное значение элемента 0..1 по его диапазону
  function pct(el) {
    var lo = +el.min || 0, hi = (el.max === undefined ? 1 : +el.max);
    if (hi === lo) return 0;
    return clamp01((( +el.value || 0) - lo) / (hi - lo));
  }
  // цвет по порогам: до t1 — базовый, от t1 — c1, от t2 — c2
  function zoneColor(el, n) {
    var t1 = el.t1 === undefined ? 2 : +el.t1, t2 = el.t2 === undefined ? 2 : +el.t2;
    if (el.invert) {               // меньше значения — тревожнее (например, заряд батареи)
      if (n <= t2 && el.c2) return el.c2;
      if (n <= t1 && el.c1) return el.c1;
      return el.color;
    }
    if (n >= t2 && el.c2) return el.c2;
    if (n >= t1 && el.c1) return el.c1;
    return el.color;
  }

  // 7-сегментные цифры (a,b,c,d,e,f,g)
  var SEG7 = {
    '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg',
    '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': ''
  };

  function create() {
    var state = {
      elements: [],
      selected: -1,
      monW: 160, monH: 96, monLabel: 'Monitor 3×5',
      bg: [16, 16, 22]
    };
    var container, canvas, ctx, preview, pctx, props, codeOut, info, prevInfo, bgInput, lenOut;
    var drag = null;
    var styleClip = null;   // буфер стиля (цвета, скопированные с элемента)

    function uid() { return 'el' + (state.elements.length + 1) + '_' + Math.floor(Math.random() * 1000); }
    function monitors() { return global.LUNA_MONITORS || DEFAULT_MONITORS; }

    function bbox(el) {
      if (el.type === 'circle') return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
      if (el.type === 'dial') return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
      if (el.type === 'text') return { x: el.x, y: el.y, w: 60, h: 12 };
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    }

    function addElement(type, preset) {
      var def = TYPES[type];
      var el = { type: type, x: 16 + (state.elements.length % 6) * 10, y: 16 + (state.elements.length % 6) * 12 };
      ['color', 'colorPressed', 'colorOn', 'colorOff', 'colorBg', 'textColor', 'c1', 'c2'].forEach(function (k) { if (def[k]) el[k] = def[k].slice(); });
      ['w', 'h', 'r', 'value', 'min', 'max', 'ticks', 'segments', 'digits', 'decimals', 't1', 't2', 'bind', 'out'].forEach(function (k) { if (def[k] !== undefined) el[k] = def[k]; });
      ['text', 'orient', 'style', 'sweep', 'shape', 'label'].forEach(function (k) { if (def[k] !== undefined) el[k] = def[k]; });
      if (preset) for (var pk in preset) if (preset.hasOwnProperty(pk)) el[pk] = preset[pk];
      el._id = uid();
      state.elements.push(el);
      state.selected = state.elements.length - 1;
      clampElements();
      render();
    }

    function sizeOf(el) {
      if (el.type === 'circle' || el.type === 'dial') return { w: el.r * 2, h: el.r * 2 };
      if (el.type === 'text') return { w: 60, h: 12 };
      return { w: el.w || 40, h: el.h || 40 };
    }
    function clampElement(el) {
      var s = sizeOf(el);
      el.x = Math.max(0, Math.min(Math.max(0, state.monW - s.w), el.x));
      el.y = Math.max(0, Math.min(Math.max(0, state.monH - s.h), el.y));
    }
    function clampElements() { state.elements.forEach(clampElement); }

    // ---------- отрисовка ----------
    function drawSwitch(c, el) {
      var on = !!el.on;   // в конструкторе показываем текущее положение
      var col = on ? el.colorOn : (el.colorOff || el.color);
      if (el.orient === 'h') {
        c.fillStyle = cssColor(el.color); c.fillRect(el.x, el.y, el.w, el.h);
        c.fillStyle = cssColor(col);
        c.beginPath(); c.arc(el.x + el.h / 2 + (on ? el.w - el.h : 0), el.y + el.h / 2, el.h / 2 - 1, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = cssColor(el.color); c.fillRect(el.x, el.y, el.w, el.h);
        c.fillStyle = cssColor(col);
        c.beginPath(); c.arc(el.x + el.w / 2, el.y + el.w / 2 + (on ? el.h - el.w : 0), el.w / 2 - 1, 0, Math.PI * 2); c.fill();
      }
    }

    function drawDial(c, el, n) {
      var cx = el.x, cy = el.y, R = el.r;
      var sweep = el.sweep || 270, half = sweep / 2, start = -half;
      c.strokeStyle = cssColor(el.colorBg); c.lineWidth = 1;
      c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.stroke();
      // риски
      var tk = Math.max(3, el.ticks || 9);
      c.strokeStyle = cssColor(el.color);
      for (var i = 0; i < tk; i++) {
        var a = (start + sweep * i / (tk - 1)) * Math.PI / 180;
        var r1 = R - 2, r2 = R - 7;
        c.beginPath();
        c.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
        c.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
        c.stroke();
      }
      // стрелка
      var an = (start + sweep * clamp01(n)) * Math.PI / 180;
      c.strokeStyle = cssColor(zoneColor(el, n)); c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx, cy);
      c.lineTo(cx + Math.sin(an) * (R - 8), cy - Math.cos(an) * (R - 8));
      c.stroke(); c.lineWidth = 1;
      c.fillStyle = cssColor(el.color);
      c.beginPath(); c.arc(cx, cy, 2, 0, Math.PI * 2); c.fill();
    }

    function drawGauge(c, el, n) {
      var h = el.orient === 'v';
      var w = h ? el.h : el.w, len = h ? el.h : el.w;
      var x = el.x, y = el.y;
      c.strokeStyle = cssColor(el.colorBg); c.lineWidth = 1;
      if (h) c.strokeRect(x + 0.5, y + 0.5, el.w, el.h);
      // деления
      var tk = Math.max(2, el.ticks || 5);
      c.strokeStyle = cssColor(el.color);
      for (var i = 0; i <= tk; i++) {
        var p = i / tk;
        if (el.orient === 'v') {
          var ty = y + el.h - el.h * p;
          c.beginPath(); c.moveTo(x, ty); c.lineTo(x + (i % 2 === 0 ? 7 : 4), ty); c.stroke();
        } else {
          var tx = x + el.w * p;
          c.beginPath(); c.moveTo(tx, y + el.h); c.lineTo(tx, y + el.h - (i % 2 === 0 ? 7 : 4)); c.stroke();
        }
      }
      // заливка
      c.fillStyle = cssColor(zoneColor(el, n));
      if (el.orient === 'v') c.fillRect(x + 8, y + el.h - (el.h - 2) * n, Math.max(1, el.w - 10), (el.h - 2) * n);
      else c.fillRect(x + 1, y + 1, Math.max(1, (el.w - 2) * n), el.h - 2);
    }

    function drawSegments(c, el, n, count, vertical) {
      var gap = 1, segs = Math.max(2, count);
      var total = vertical ? el.h : el.w;
      var sw = (total - gap * (segs - 1)) / segs;
      var lit = Math.round(n * segs);
      for (var i = 0; i < segs; i++) {
        var on = i < lit;
        c.fillStyle = cssColor(on ? zoneColor(el, n) : (el.colorOff || el.colorBg));
        if (vertical) c.fillRect(el.x, el.y + el.h - (i + 1) * sw - i * gap, el.w, sw);
        else c.fillRect(el.x + i * (sw + gap), el.y, sw, el.h);
      }
    }

    function drawSeg7Char(c, x, y, ch, w, h, on, off, col) {
      var segs = SEG7[ch] || '';
      var t = Math.max(1, Math.round(h / 6));
      var pts = {
        a: [x + t, y, w - 2 * t, t], b: [x + w - t, y + t, t, (h - 3 * t) / 2 + t],
        c: [x + w - t, y + h / 2, t, (h - 3 * t) / 2], d: [x + t, y + h - t, w - 2 * t, t],
        e: [x, y + h / 2, t, (h - 3 * t) / 2], f: [x, y + t, t, (h - 3 * t) / 2 + t],
        g: [x + t, y + h / 2 - t / 2, w - 2 * t, t]
      };
      for (var k in pts) if (pts.hasOwnProperty(k)) {
        c.fillStyle = cssColor(segs.indexOf(k) >= 0 && col ? col : off);
        c.fillRect(pts[k][0], pts[k][1], pts[k][2], pts[k][3]);
      }
    }

    function drawSeg7(c, el, n) {
      var digits = Math.max(1, Math.min(4, el.digits || 2));
      var dec = Math.max(0, Math.min(3, el.decimals || 0));
      var span = (+el.max || 0) - (+el.min || 0);
      var raw = (+el.min || 0) + span * n;
      var txt = dec > 0 ? raw.toFixed(dec) : String(Math.round(raw));
      var dash = 0; for (var q = 0; q < txt.length; q++) if (txt[q] === '.' || txt[q] === '-') dash++;
      while (txt.length - dash < digits) txt = ' ' + txt;
      var cw = Math.floor((el.w - 2 * (digits - 1)) / digits);
      for (var i = 0; i < txt.length; i++) {
        var ch = txt[i];
        var x = el.x + i * (cw + 2);
        if (ch === '.') { c.fillStyle = cssColor(zoneColor(el, n)); c.fillRect(x + cw - 2, el.y + el.h - 3, 2, 2); }
        else if (ch === '-') { c.fillStyle = cssColor(zoneColor(el, n)); c.fillRect(x + 2, el.y + el.h / 2 - 1, cw - 4, 2); }
        else drawSeg7Char(c, x, el.y, ch, cw, el.h, el.color, el.colorOff, zoneColor(el, n));
      }
    }

    function drawGraph(c, el, n) {
      var x = el.x, y = el.y, w = el.w, h = el.h, col = cssColor(zoneColor(el, n));
      c.fillStyle = cssColor(el.colorBg); c.fillRect(x, y, w, h);
      var N = 32, i, px, py;
      if (el.style === 'bars') {
        c.fillStyle = col;
        for (i = 0; i < N; i++) {
          var vv = clamp01(0.5 + 0.45 * Math.sin(i * 0.5));
          var bh = Math.max(1, h * vv);
          c.fillRect(x + i * (w / N), y + h - bh, Math.max(1, w / N - 1), bh);
        }
      } else {
        c.strokeStyle = col; c.beginPath();
        for (i = 0; i < N; i++) {
          var v2 = clamp01(0.5 + 0.45 * Math.sin(i * 0.5));
          px = x + (w - 1) * i / (N - 1); py = y + h - 1 - (h - 2) * v2;
          if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
        }
        c.stroke();
        if (el.style === 'fill') {
          c.lineTo(x + w - 1, y + h - 1); c.lineTo(x, y + h - 1); c.closePath();
          c.fillStyle = col; c.fill();
        }
      }
    }

    function drawElement(c, el, selected) {
      c.lineWidth = 1;
      var n = pct(el);
      if (el.type === 'text') { c.fillStyle = cssColor(el.textColor); c.font = '10px monospace'; c.textBaseline = 'top'; c.fillText(el.text, el.x, el.y); }
      else if (el.type === 'rect') { c.strokeStyle = cssColor(el.color); c.strokeRect(el.x + 0.5, el.y + 0.5, el.w, el.h); }
      else if (el.type === 'circle') { c.strokeStyle = cssColor(el.color); c.beginPath(); c.arc(el.x, el.y, el.r, 0, Math.PI * 2); c.stroke(); }
      else if (el.type === 'bar') {
        c.fillStyle = cssColor(el.colorBg); c.fillRect(el.x, el.y, el.w, el.h);
        c.fillStyle = cssColor(zoneColor(el, n)); c.fillRect(el.x, el.y, el.w * n, el.h);
        c.strokeStyle = cssColor(el.colorBg); c.strokeRect(el.x + 0.5, el.y + 0.5, el.w, el.h);
      }
      else if (el.type === 'gauge') drawGauge(c, el, n);
      else if (el.type === 'dial') drawDial(c, el, n);
      else if (el.type === 'graph') drawGraph(c, el, n);
      else if (el.type === 'seg7') drawSeg7(c, el, n);
      else if (el.type === 'segbar') drawSegments(c, el, n, el.segments || 8, false);
      else if (el.type === 'battery') {
        var innerW = el.w - 4;
        c.fillStyle = cssColor(el.colorOff); c.fillRect(el.x, el.y, el.w, el.h);
        drawSegments(c, { x: el.x + 2, y: el.y + 2, w: innerW, h: el.h - 4, colorOff: el.colorOff, color: el.color, c1: el.c1, c2: el.c2, t1: el.t1, t2: el.t2, invert: el.invert }, n, el.segments || 8, false);
        c.fillStyle = cssColor(el.colorBg); c.fillRect(el.x + el.w, el.y + el.h * 0.3, 2, el.h * 0.4);
      }
      else if (el.type === 'switch') drawSwitch(c, el);
      else if (el.type === 'lamp') {
        var cc = el.on ? el.colorOn : el.colorOff;
        if (el.shape === 'rect') { c.fillStyle = cssColor(cc); c.fillRect(el.x, el.y, el.w, el.h); }
        else { c.fillStyle = cssColor(cc); c.beginPath(); c.arc(el.x + el.w / 2, el.y + el.h / 2, el.w / 2, 0, Math.PI * 2); c.fill(); }
      }
      else { // button / toggle
        c.fillStyle = cssColor(el.on ? el.colorPressed : el.color); c.fillRect(el.x, el.y, el.w, el.h);
        c.fillStyle = cssColor(el.textColor); c.font = '10px monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(el.text, el.x + el.w / 2, el.y + el.h / 2 + 0.5);
        c.textAlign = 'left'; c.textBaseline = 'top';
      }
      if (el.label) { c.fillStyle = cssColor(el.textColor || [220, 228, 238]); c.font = '10px monospace'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(el.label, el.x, el.y - 11); }
      if (selected) {
        var b = bbox(el);
        c.strokeStyle = '#5ad1ff'; c.strokeRect(b.x - 2.5, b.y - 2.5, b.w + 5, b.h + 5);
      }
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

    function styleKeysFor(type) {
      if (type === 'button' || type === 'toggle') return ['color', 'colorPressed', 'textColor'];
      if (type === 'switch') return ['color', 'colorOn', 'colorOff'];
      if (type === 'lamp') return ['colorOff', 'colorOn'];
      if (type === 'text') return ['textColor'];
      if (type === 'bar') return ['color', 'colorBg', 'c1', 'c2'];
      if (type === 'segbar' || type === 'battery') return ['color', 'colorOff', 'c1', 'c2'];
      if (type === 'seg7') return ['color', 'colorOff', 'c1', 'c2'];
      if (type === 'rect' || type === 'circle') return ['color'];
      return ['color', 'colorBg', 'c1', 'c2'];
    }
    function typeName(t) { return TYPE_LABEL[t] || t; }

    function applyTheme(t) {
      state.bg = t.bg.slice();
      state.elements.forEach(function (el) {
        if (el.type === 'button' || el.type === 'toggle') { el.color = t.fill.slice(); el.colorPressed = t.pressed.slice(); el.textColor = t.text.slice(); }
        else if (el.type === 'text') { el.textColor = t.text.slice(); }
        else if (el.type === 'switch') { el.color = t.fill.slice(); el.colorOn = t.pressed.slice(); if (el.colorOff) el.colorOff = t.barBg.slice(); }
        else if (el.type === 'lamp') { el.colorOff = t.barBg.slice(); el.colorOn = t.pressed.slice(); }
        else if (VALUE_TYPES[el.type]) { el.color = t.accent.slice(); if (el.colorBg) el.colorBg = t.barBg.slice(); if (el.colorOff) el.colorOff = t.fill.slice(); }
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

    // ============================================================
    // ЧАСТЬ 2: интерфейс, свойства, обработчики, генерация Lua-кода
    // ============================================================
    var TYPE_TITLE = {
      text: 'Текст', button: 'Кнопка', toggle: 'Фиксатор', switch: 'Тумблер', lamp: 'Индикатор (bool)',
      bar: 'Полоса', gauge: 'Шкала', dial: 'Диал', graph: 'График', seg7: '7-сегментный индикатор',
      segbar: 'Сегментный индикатор', battery: 'Батарея', rect: 'Прямоугольник', circle: 'Круг'
    };
    var COLOR_LABEL = { color: 'Основной', colorPressed: 'Нажатие', colorOn: 'Вкл', colorOff: 'Выкл', colorBg: 'Фон', c1: 'Порог 1', c2: 'Порог 2', textColor: 'Текст' };

    function q(root, sel) { return root.querySelector(sel); }
    function num(v) { v = +v || 0; return Math.round(v * 1000) / 1000; }
    function triple(c) { c = c || [255, 255, 255]; return (c[0] | 0) + ', ' + (c[1] | 0) + ', ' + (c[2] | 0); }
    function luaStr(s) { return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"'; }
    function fmt(v) { v = +v || 0; return String(Math.round(v * 100) / 100); }

    // ---------- свойства выбранного элемента ----------
    function selEl() { return state.elements[state.selected]; }
    function fNum(p, label, step) {
      var v = selEl()[p]; if (v === undefined) v = '';
      return '<label>' + label + '<input type="number"' + (step ? ' step="' + step + '"' : '') + ' data-num="' + p + '" value="' + v + '"></label>';
    }
    function fText(p, label, ph) {
      var v = selEl()[p]; if (v === undefined) v = '';
      return '<label>' + label + '<input type="text" data-txt="' + p + '" value="' + String(v).replace(/"/g, '&quot;') + '"' + (ph ? ' placeholder="' + ph + '"' : '') + '></label>';
    }
    function fSel(p, label, opts) {
      var cur = String(selEl()[p]);
      var o = opts.map(function (x) { return '<option value="' + x[0] + '"' + (String(x[0]) === cur ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('');
      return '<label>' + label + '<select data-sel="' + p + '">' + o + '</select></label>';
    }
    function fCh(p, label, allowOff) {
      var cur = +selEl()[p] || 0, o = '';
      if (allowOff) o += '<option value="0"' + (cur === 0 ? ' selected' : '') + '>постоянное</option>';
      for (var i = 1; i <= 32; i++) o += '<option value="' + i + '"' + (cur === i ? ' selected' : '') + '>' + i + '</option>';
      return '<label>' + label + '<select data-ch="' + p + '">' + o + '</select></label>';
    }
    function fChk(p, label) {
      return '<label class="fld-chk wide"><input type="checkbox" data-chk="' + p + '"' + (selEl()[p] ? ' checked' : '') + '> ' + label + '</label>';
    }

    function renderProps() {
      var s = selEl();
      if (!s) { props.innerHTML = '<h3>Свойства</h3><p class="muted small">Выберите элемент на холсте или добавьте из палитры слева. Элементы перетаскиваются мышью, стрелки двигают, Delete удаляет.</p>'; return; }
      var h = [];
      h.push('<h3>' + (TYPE_TITLE[s.type] || s.type) + '</h3>');
      h.push('<div class="prop-grid">');
      h.push(fNum('x', 'X'), fNum('y', 'Y'));
      if (s.type === 'circle' || s.type === 'dial') h.push(fNum('r', 'Радиус'));
      else if (SIZE_TYPES[s.type]) { h.push(fNum('w', 'Ширина')); h.push(fNum('h', 'Высота')); }
      if (s.type === 'text' || s.type === 'button' || s.type === 'toggle') h.push(fText('text', 'Надпись', 'только латиница'));
      h.push(fText('label', 'Подпись', 'только латиница'));
      if (s.type === 'graph') h.push(fSel('style', 'Вид', [['line', 'Линия'], ['fill', 'Заливка'], ['bars', 'Столбики']]));
      if (s.type === 'dial') h.push(fSel('sweep', 'Разворот', [['180', '180°'], ['270', '270°'], ['360', '360°']]));
      if (s.type === 'switch') h.push(fSel('orient', 'Ориентация', [['v', 'Вертикально'], ['h', 'Горизонтально']]));
      if (s.type === 'lamp') h.push(fSel('shape', 'Форма', [['round', 'Круг'], ['rect', 'Квадрат']]));
      if (s.type === 'segbar' || s.type === 'battery') h.push(fNum('segments', 'Сегментов'));
      if (s.type === 'seg7') { h.push(fNum('digits', 'Разрядов')); h.push(fNum('decimals', 'Знаков после запятой')); }
      if (VALUE_TYPES[s.type]) {
        h.push(fNum('min', 'Мин')); h.push(fNum('max', 'Макс')); h.push(fNum('value', 'Значение'));
        if (s.type === 'gauge' || s.type === 'dial') h.push(fNum('ticks', 'Деления'));
      }
      h.push('</div>');

      if (VALUE_TYPES[s.type] || BOOL_TYPES[s.type] || INTERACTIVE[s.type]) {
        h.push('<div class="muted small sect">Привязка к композиту</div><div class="prop-grid">');
        if (VALUE_TYPES[s.type]) h.push(fCh('bind', 'Канал (число)', true));
        else h.push(fCh('bind', 'Канал (bool)', false));
        if (INTERACTIVE[s.type]) h.push(fCh('out', 'Выход (bool)', false));
        h.push('</div>');
      }

      h.push('<div class="muted small sect">Цвета</div><div class="prop-grid">');
      styleKeysFor(s.type).forEach(function (k) { h.push(colorRow(k, COLOR_LABEL[k] || k)); });
      h.push('</div>');

      if (VALUE_TYPES[s.type]) {
        h.push('<div class="muted small sect">Пороги цвета (доли 0..1)</div><div class="prop-grid">');
        h.push(fNum('t1', 'Порог 1', '0.05'));
        h.push(fNum('t2', 'Порог 2', '0.05'));
        h.push(fChk('invert', 'Инверсия (меньше — тревожнее)'));
        h.push('</div>');
      }

      h.push('<div class="prop-actions">' +
        '<button class="btn" data-act="copy">Копировать стиль</button>' +
        '<button class="btn" data-act="paste"' + (styleClip ? '' : ' disabled') + '>Вставить стиль</button>' +
        '<button class="btn" data-act="up">Выше</button>' +
        '<button class="btn" data-act="down">Ниже</button>' +
        '<button class="btn" data-act="dup">Дублировать</button>' +
        '<button class="btn" data-act="del">Удалить</button>' +
        '</div>');
      props.innerHTML = h.join('');
    }

    function doAction(a, s) {
      if (!s) return;
      var i = state.selected;
      if (a === 'del') { state.elements.splice(i, 1); state.selected = Math.min(i, state.elements.length - 1); render(); return; }
      if (a === 'dup') {
        var c = JSON.parse(JSON.stringify(s)); c._id = uid(); c.x += 10; c.y += 10;
        state.elements.splice(i + 1, 0, c); state.selected = i + 1; clampElement(c); render(); return;
      }
      if (a === 'up' && i > 0) { var t1 = state.elements[i - 1]; state.elements[i - 1] = s; state.elements[i] = t1; state.selected = i - 1; render(); return; }
      if (a === 'down' && i < state.elements.length - 1) { var t2 = state.elements[i + 1]; state.elements[i + 1] = s; state.elements[i] = t2; state.selected = i + 1; render(); return; }
      if (a === 'copy') { copyStyle(s); renderProps(); return; }
      if (a === 'paste') { pasteStyleTo(s); redraw(); renderCode(); return; }
    }
    function doAct(a) {
      if (a === 'clear') {
        if (state.elements.length && !window.confirm('Удалить все элементы с холста?')) return;
        state.elements = []; state.selected = -1; render(); return;
      }
      if (a === 'front') { var s = selEl(); if (!s) return; state.elements.splice(state.selected, 1); state.elements.push(s); state.selected = state.elements.length - 1; render(); return; }
      if (a === 'back') { var s2 = selEl(); if (!s2) return; state.elements.splice(state.selected, 1); state.elements.unshift(s2); state.selected = 0; render(); return; }
      doAction(a, selEl());
    }

    function onPropEdit(e) {
      var sel = selEl(); if (!sel) return;
      var t = e.target;
      if (t.dataset.num !== undefined) sel[t.dataset.num] = +t.value || 0;
      else if (t.dataset.txt !== undefined) sel[t.dataset.txt] = t.value;
      else if (t.dataset.c !== undefined) sel[t.dataset.c] = fromHex(t.value);
      else if (t.dataset.sel !== undefined) { var p = t.dataset.sel; sel[p] = (p === 'sweep') ? +t.value : t.value; }
      else if (t.dataset.ch !== undefined) sel[t.dataset.ch] = +t.value;
      else if (t.dataset.chk !== undefined) sel[t.dataset.chk] = t.checked;
      else return;
      clampElement(sel);
      redraw(); renderCode(); renderInfo();
    }

    function copyText(txt, btn) {
      try {
        navigator.clipboard.writeText(txt).then(function () {
          if (btn) { var o = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(function () { btn.textContent = o; }, 1200); }
        });
      } catch (e) { }
    }

    // ---------- генерация кода ----------
    function emitZoneVals(el, nvar, ind) {
      ind = ind || '  ';
      var L = [], t1 = el.t1 === undefined ? 2 : +el.t1, t2 = el.t2 === undefined ? 2 : +el.t2;
      L.push(ind + 'local rr, gg, bb');
      if (el.invert) {
        L.push(ind + 'if ' + nvar + ' <= ' + fmt(t2) + ' then rr, gg, bb = ' + triple(el.c2 || el.color));
        L.push(ind + 'elseif ' + nvar + ' <= ' + fmt(t1) + ' then rr, gg, bb = ' + triple(el.c1 || el.color));
        L.push(ind + 'else rr, gg, bb = ' + triple(el.color) + ' end');
      } else {
        L.push(ind + 'if ' + nvar + ' >= ' + fmt(t2) + ' then rr, gg, bb = ' + triple(el.c2 || el.color));
        L.push(ind + 'elseif ' + nvar + ' >= ' + fmt(t1) + ' then rr, gg, bb = ' + triple(el.c1 || el.color));
        L.push(ind + 'else rr, gg, bb = ' + triple(el.color) + ' end');
      }
      return L;
    }

    function genTick(el, i) {
      var L = [], d = '  ';
      if (el.type === 'button') {
        L.push(d + 'b' + i + ' = input.getBool(' + (el.bind || 1) + ')');
        L.push(d + 'output.setBool(' + (el.out || 1) + ', b' + i + ')');
      } else if (el.type === 'toggle' || el.type === 'switch') {
        L.push(d + 'local p' + i + ' = input.getBool(' + (el.bind || 1) + ')');
        L.push(d + 'if p' + i + ' and not q' + i + ' then b' + i + ' = not b' + i + ' end');
        L.push(d + 'q' + i + ' = p' + i);
        L.push(d + 'output.setBool(' + (el.out || 1) + ', b' + i + ')');
      } else if (el.type === 'graph') {
        var src = (el.bind > 0) ? ('input.getNumber(' + el.bind + ')') : fmt(el.value);
        L.push(d + 'table.insert(hist' + i + ', ' + src + ')');
        L.push(d + 'if #hist' + i + ' > 32 then table.remove(hist' + i + ', 1) end');
      }
      return L;
    }

    function genDraw(el, i, fn) {
      var L = [], d = '  ', t = el.type;
      var x = num(el.x), y = num(el.y);
      if (t === 'text') {
        L.push(d + 'screen.setColor(' + triple(el.textColor) + ')');
        L.push(d + 'screen.drawText(' + x + ', ' + y + ', ' + luaStr(el.text) + ')');
      } else if (t === 'rect') {
        L.push(d + 'screen.setColor(' + triple(el.color) + ')');
        L.push(d + 'screen.drawRect(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
      } else if (t === 'circle') {
        L.push(d + 'screen.setColor(' + triple(el.color) + ')');
        L.push(d + 'screen.drawCircle(' + x + ', ' + y + ', ' + num(el.r) + ')');
      } else if (t === 'button' || t === 'toggle') {
        L.push(d + 'if b' + i + ' then screen.setColor(' + triple(el.colorPressed) + ') else screen.setColor(' + triple(el.color) + ') end');
        L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
        L.push(d + 'screen.setColor(' + triple(el.textColor) + ')');
        L.push(d + 'screen.drawTextBox(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ', ' + luaStr(el.text) + ', 0, 0)');
      } else if (t === 'switch') {
        L.push(d + 'screen.setColor(' + triple(el.color) + ')');
        L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
        if (el.orient === 'h') {
          L.push(d + 'local kx' + i + ' = ' + num(el.x + el.h / 2) + ' + (b' + i + ' and ' + num(el.w - el.h) + ' or 0)');
          L.push(d + 'if b' + i + ' then screen.setColor(' + triple(el.colorOn) + ') else screen.setColor(' + triple(el.colorOff) + ') end');
          L.push(d + 'screen.drawCircleF(kx' + i + ', ' + num(el.y + el.h / 2) + ', ' + num(el.h / 2 - 1) + ')');
        } else {
          L.push(d + 'local ky' + i + ' = ' + num(el.y + el.w / 2) + ' + (b' + i + ' and ' + num(el.h - el.w) + ' or 0)');
          L.push(d + 'if b' + i + ' then screen.setColor(' + triple(el.colorOn) + ') else screen.setColor(' + triple(el.colorOff) + ') end');
          L.push(d + 'screen.drawCircleF(' + num(el.x + el.w / 2) + ', ky' + i + ', ' + num(el.w / 2 - 1) + ')');
        }
      } else if (t === 'lamp') {
        var src = (el.bind > 0) ? ('input.getBool(' + el.bind + ')') : (el.on ? 'true' : 'false');
        L.push(d + 'if ' + src + ' then screen.setColor(' + triple(el.colorOn) + ') else screen.setColor(' + triple(el.colorOff) + ') end');
        if (el.shape === 'rect') L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
        else L.push(d + 'screen.drawCircleF(' + num(el.x + el.w / 2) + ', ' + num(el.y + el.h / 2) + ', ' + num(el.w / 2) + ')');
      } else if (VALUE_TYPES[t]) {
        fn.shade = true;
        var nn = 'n' + i;
        if (t === 'graph') {
          L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
          L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
          L.push(d + 'local hn' + i + ' = #hist' + i);
          L.push(d + 'local ' + nn + ' = 0');
          L.push(d + 'if hn' + i + ' > 0 then ' + nn + ' = shade(hist' + i + '[hn' + i + '], ' + fmt(el.min) + ', ' + fmt(el.max) + ') end');
          L = L.concat(emitZoneVals(el, nn, d));
          L.push(d + 'screen.setColor(rr, gg, bb)');
          L.push(d + 'for k = 1, hn' + i + ' do');
          L.push(d + '  local hh = shade(hist' + i + '[k], ' + fmt(el.min) + ', ' + fmt(el.max) + ')');
          if (el.style === 'bars') {
            L.push(d + '  local bw = ' + num(el.w) + ' / 32');
            L.push(d + '  screen.drawRectF(' + x + ' + (k-1)*bw, ' + num(el.y + el.h) + ' - hh*' + num(el.h) + ', math.max(1, bw-1), hh*' + num(el.h) + ')');
          } else {
            L.push(d + '  local bx = ' + x + ' + (' + num(el.w) + '-1)*(k-1)/math.max(1, hn' + i + '-1)');
            if (el.style === 'fill') L.push(d + '  screen.drawRectF(bx, ' + num(el.y + el.h) + ' - hh*' + num(el.h) + ', 1, hh*' + num(el.h) + ')');
            else L.push(d + '  if k > 1 then screen.drawLine(bx, ' + num(el.y + el.h) + ' - hh*' + num(el.h) + ', bx-(' + num(el.w) + '-1)/math.max(1, hn' + i + '-1), ' + num(el.y + el.h) + ' - shade(hist' + i + '[k-1], ' + fmt(el.min) + ', ' + fmt(el.max) + ')*' + num(el.h) + ') end');
          }
          L.push(d + 'end');
          L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
          L.push(d + 'screen.drawRect(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
        } else {
          if (el.bind > 0) L.push(d + 'local v' + i + ' = input.getNumber(' + el.bind + ')');
          else L.push(d + 'local v' + i + ' = ' + fmt(el.value));
          L.push(d + 'local ' + nn + ' = shade(v' + i + ', ' + fmt(el.min) + ', ' + fmt(el.max) + ')');
          L = L.concat(emitZoneVals(el, nn, d));
          if (t === 'bar') {
            L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
            L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
            L.push(d + 'screen.setColor(rr, gg, bb)');
            L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + '*' + nn + ', ' + num(el.h) + ')');
            L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
            L.push(d + 'screen.drawRect(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
          } else if (t === 'gauge') {
            var tk = Math.max(2, el.ticks || 5);
            if (el.orient === 'v') {
              L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
              L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
              L.push(d + 'screen.setColor(rr, gg, bb)');
              L.push(d + 'screen.drawRectF(' + x + ', ' + y + ' + ' + num(el.h) + ' - ' + num(el.h) + '*' + nn + ', ' + num(el.w) + ', ' + num(el.h) + '*' + nn + ')');
              L.push(d + 'screen.setColor(' + triple(el.color) + ')');
              L.push(d + 'for k = 0, ' + tk + ' do screen.drawLine(' + x + ', ' + y + ' + ' + num(el.h) + ' - ' + num(el.h) + '*k/' + tk + ', ' + x + '+4, ' + y + ' + ' + num(el.h) + ' - ' + num(el.h) + '*k/' + tk + ') end');
            } else {
              L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
              L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
              L.push(d + 'screen.setColor(rr, gg, bb)');
              L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + '*' + nn + ', ' + num(el.h) + ')');
              L.push(d + 'screen.setColor(' + triple(el.color) + ')');
              L.push(d + 'for k = 0, ' + tk + ' do screen.drawLine(' + x + ' + ' + num(el.w) + '*k/' + tk + ', ' + y + ' + ' + num(el.h) + ', ' + x + ' + ' + num(el.w) + '*k/' + tk + ', ' + y + ' + ' + num(el.h) + '-4) end');
            }
          } else if (t === 'dial') {
            fn.shade = true;
            var sweep = el.sweep || 270, tkn = Math.max(3, el.ticks || 9), start = -sweep / 2;
            L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
            L.push(d + 'screen.drawCircle(' + x + ', ' + y + ', ' + num(el.r) + ')');
            L.push(d + 'screen.setColor(' + triple(el.color) + ')');
            L.push(d + 'for k = 0, ' + (tkn - 1) + ' do local a = math.rad(' + fmt(start) + ' + ' + fmt(sweep) + '*k/' + (tkn - 1) + ') screen.drawLine(' + x + '+math.sin(a)*' + num(el.r - 1) + ', ' + y + '-math.cos(a)*' + num(el.r - 1) + ', ' + x + '+math.sin(a)*' + num(el.r - 7) + ', ' + y + '-math.cos(a)*' + num(el.r - 7) + ') end');
            L.push(d + 'screen.setColor(rr, gg, bb)');
            L.push(d + 'local a' + i + ' = math.rad(' + fmt(start) + ' + ' + fmt(sweep) + '*' + nn + ')');
            L.push(d + 'screen.drawLine(' + x + ', ' + y + ', ' + x + '+math.sin(a' + i + ')*' + num(el.r - 8) + ', ' + y + '-math.cos(a' + i + ')*' + num(el.r - 8) + ')');
            L.push(d + 'screen.setColor(' + triple(el.color) + ')');
            L.push(d + 'screen.drawCircleF(' + x + ', ' + y + ', 2)');
          } else if (t === 'segbar') {
            var S = Math.max(2, el.segments || 8), sw = (el.w + 1) / S;
            L.push(d + 'screen.setColor(' + triple(el.colorOff) + ')');
            L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
            L.push(d + 'screen.setColor(rr, gg, bb)');
            L.push(d + 'local lit' + i + ' = math.floor(' + nn + '*' + S + '+0.5)');
            L.push(d + 'for k = 0, lit' + i + '-1 do screen.drawRectF(' + x + ' + k*' + num(sw) + ', ' + y + ', math.max(1, ' + num(sw - 1) + '), ' + num(el.h) + ') end');
          } else if (t === 'battery') {
            var Sb = Math.max(2, el.segments || 8), wb = Math.max(4, el.w - 4), swb = (wb + 1) / Sb;
            L.push(d + 'screen.setColor(' + triple(el.colorOff) + ')');
            L.push(d + 'screen.drawRectF(' + x + ', ' + y + ', ' + num(el.w) + ', ' + num(el.h) + ')');
            L.push(d + 'screen.setColor(' + triple(el.colorBg) + ')');
            L.push(d + 'screen.drawRectF(' + num(el.x + el.w) + ', ' + num(el.y + el.h * 0.3) + ', 2, ' + num(el.h * 0.4) + ')');
            L.push(d + 'screen.setColor(rr, gg, bb)');
            L.push(d + 'local lit' + i + ' = math.floor(' + nn + '*' + Sb + '+0.5)');
            L.push(d + 'for k = 0, lit' + i + '-1 do screen.drawRectF(' + num(el.x + 2) + ' + k*' + num(swb) + ', ' + num(el.y + 2) + ', math.max(1, ' + num(swb - 1) + '), ' + num(el.h - 4) + ') end');
          } else if (t === 'seg7') {
            fn.seg7 = true;
            var D = Math.max(1, Math.min(4, el.digits || 2)), dec = Math.max(0, Math.min(3, el.decimals || 0));
            L.push(d + 'local raw' + i + ' = ' + fmt(el.min) + ' + (' + fmt((+el.max || 0) - (+el.min || 0)) + ')*' + nn);
            L.push(d + 'local txt' + i + ' = string.format("%.' + dec + 'f", raw' + i + ')');
            L.push(d + 'while #txt' + i + ' < ' + D + ' do txt' + i + ' = " "..txt' + i + ' end');
            L.push(d + 'local cw' + i + ' = math.floor((' + num(el.w) + ' - 2*(' + D + '-1))/' + D + ')');
            L.push(d + 'for k = 1, #txt' + i + ' do');
            L.push(d + '  local ch = txt' + i + ':sub(k,k)');
            L.push(d + '  local cx = ' + x + ' + (k-1)*(cw' + i + '+2)');
            L.push(d + '  if ch == "." then screen.setColor(rr, gg, bb) screen.drawRectF(cx+cw' + i + '-2, ' + num(el.y + el.h - 3) + ', 2, 2)');
            L.push(d + '  else seg7(cx, ' + y + ', cw' + i + ', ' + num(el.h) + ', ch, rr, gg, bb, ' + triple(el.colorOff) + ') end');
            L.push(d + 'end');
          }
        }
      }
      if (el.label) {
        L.push(d + 'screen.setColor(' + triple(el.textColor || [220, 228, 238]) + ')');
        L.push(d + 'screen.drawText(' + x + ', ' + num(Math.max(0, el.y - 11)) + ', ' + luaStr(el.label) + ')');
      }
      return L;
    }

    function buildCode() {
      var fn = { shade: false, seg7: false };
      var decls = [], ticks = [], draws = [], i, el;
      for (i = 0; i < state.elements.length; i++) {
        el = state.elements[i];
        if (el.type === 'button') decls.push('local b' + i + ' = false');
        else if (el.type === 'toggle' || el.type === 'switch') { decls.push('local b' + i + ' = false'); decls.push('local q' + i + ' = false'); }
        else if (el.type === 'graph') decls.push('local hist' + i + ' = {}');
        ticks = ticks.concat(genTick(el, i));
        draws = draws.concat(genDraw(el, i, fn));
      }
      var out = [];
      out.push('-- Луна IDE · конструктор экранов');
      out.push('-- Экран: ' + state.monLabel + ' (' + state.monW + 'x' + state.monH + ' px), элементов: ' + state.elements.length);
      out.push('-- Текст на экране — только латиницей (шрифт игры).');
      out.push('');
      if (decls.length) { out = out.concat(decls); out.push(''); }
      if (fn.shade) {
        out.push('local function shade(v, lo, hi)');
        out.push('  if hi == lo then return 0 end');
        out.push('  local n = (v - lo) / (hi - lo)');
        out.push('  if n < 0 then return 0 elseif n > 1 then return 1 else return n end');
        out.push('end');
        out.push('');
      }
      if (fn.seg7) {
        out.push('local SEG7 = {["0"]="abcdef",["1"]="bc",["2"]="abdeg",["3"]="abcdg",["4"]="bcfg",["5"]="acdfg",["6"]="acdefg",["7"]="abc",["8"]="abcdefg",["9"]="abcdfg",["-"]="g",[" "]=""}');
        out.push('local function seg7(x, y, w, h, ch, rr, gg, bb, or_, og, ob)');
        out.push('  local s = SEG7[ch] or ""');
        out.push('  local t = math.max(1, math.floor(h / 6))');
        out.push('  local p = {');
        out.push('    {"a", x+t, y, w-2*t, t},');
        out.push('    {"b", x+w-t, y+t, t, math.max(1,(h-3*t)/2+t)},');
        out.push('    {"c", x+w-t, y+h/2, t, math.max(1,(h-3*t)/2)},');
        out.push('    {"d", x+t, y+h-t, w-2*t, t},');
        out.push('    {"e", x, y+h/2, t, math.max(1,(h-3*t)/2)},');
        out.push('    {"f", x, y+t, t, math.max(1,(h-3*t)/2+t)},');
        out.push('    {"g", x+t, y+h/2-t/2, w-2*t, t} }');
        out.push('  for k = 1, 7 do');
        out.push('    if s:find(p[k][1], 1, true) then screen.setColor(rr, gg, bb) else screen.setColor(or_, og, ob) end');
        out.push('    screen.drawRectF(p[k][2], p[k][3], p[k][4], p[k][5])');
        out.push('  end');
        out.push('end');
        out.push('');
      }
      if (ticks.length) { out.push('function onTick()'); out = out.concat(ticks); out.push('end'); out.push(''); }
      out.push('function onDraw()');
      out.push('  screen.drawClear(' + triple(state.bg) + ')');
      out = out.concat(draws);
      out.push('end');
      return out.join('\n');
    }

    function renderCode() {
      if (!codeOut) return;
      var code = buildCode();
      codeOut.value = code;
      if (lenOut) {
        var over = code.length > 8192;
        lenOut.textContent = code.length + ' символов' + (over ? ' — больше лимита игры (8192)!' : '');
        lenOut.style.color = over ? '#ff6b6b' : '';
      }
    }

    // ---------- построение интерфейса ----------
    function canvasPt(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
    }
    function hitTest(p) {
      for (var i = state.elements.length - 1; i >= 0; i--) {
        var el = state.elements[i];
        if (el.type === 'circle' || el.type === 'dial') {
          if (Math.sqrt((p.x - el.x) * (p.x - el.x) + (p.y - el.y) * (p.y - el.y)) <= el.r + 3) return i;
        } else {
          var b = bbox(el);
          if (p.x >= b.x - 3 && p.x <= b.x + b.w + 3 && p.y >= b.y - 3 && p.y <= b.y + b.h + 3) return i;
        }
      }
      return -1;
    }
    function isVisible() { return !!(container && container.offsetParent !== null); }

    function mount(root) {
      container = root;
      root.innerHTML =
        '<div class="builder">' +
          '<div class="builder-side">' +
            '<div class="panel">' +
              '<div class="fld"><label>Монитор</label><select data-role="mon"></select></div>' +
              '<div class="fld"><label>Фон экрана</label><input type="color" data-role="bg" value="' + hex(state.bg) + '"></div>' +
              '<div class="fld"><label>Тема оформления</label><select data-role="theme"></select></div>' +
            '</div>' +
            '<div class="panel">' +
              '<div class="muted small" style="margin-bottom:6px">Добавить элемент</div>' +
              '<div class="palette-grid" data-role="palette"></div>' +
            '</div>' +
          '</div>' +
          '<div class="builder-center">' +
            '<div class="panel">' +
              '<div class="row-between"><b data-role="info"></b></div>' +
              '<canvas data-role="canvas" style="display:block;background:#000;border:1px solid var(--border);border-radius:6px;margin-top:8px;cursor:crosshair;max-width:100%"></canvas>' +
              '<div class="prop-actions">' +
                '<button class="btn" data-act="dup">Дублировать</button>' +
                '<button class="btn" data-act="del">Удалить</button>' +
                '<button class="btn" data-act="front">Вперёд</button>' +
                '<button class="btn" data-act="back">Назад</button>' +
                '<button class="btn" data-act="clear">Очистить всё</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="builder-preview">' +
            '<div class="panel">' +
              '<div class="muted small" data-role="previnfo"></div>' +
              '<canvas data-role="preview" style="display:block;background:#000;border:1px solid var(--border);border-radius:6px;margin-top:6px;image-rendering:pixelated;max-width:100%"></canvas>' +
            '</div>' +
          '</div>' +
          '<div class="builder-props panel" data-role="props"></div>' +
        '</div>' +
        '<div class="builder-code">' +
          '<div class="row-between"><b>Готовый Lua-код</b>' +
            '<div class="row gap"><span class="muted small" data-role="len"></span>' +
            '<button class="btn" data-role="copycode">Скопировать код</button>' +
            '<button class="btn" data-role="opencode">Открыть в редакторе</button></div></div>' +
          '<textarea data-role="code" readonly spellcheck="false"></textarea>' +
        '</div>';

      canvas = q(root, '[data-role="canvas"]');
      ctx = canvas.getContext('2d');
      preview = q(root, '[data-role="preview"]');
      pctx = preview.getContext('2d');
      props = q(root, '[data-role="props"]');
      codeOut = q(root, '[data-role="code"]');
      info = q(root, '[data-role="info"]');
      prevInfo = q(root, '[data-role="previnfo"]');
      bgInput = q(root, '[data-role="bg"]');
      lenOut = q(root, '[data-role="len"]');

      var monSel = q(root, '[data-role="mon"]');
      var themeSel = q(root, '[data-role="theme"]');
      var paletteEl = q(root, '[data-role="palette"]');

      monSel.innerHTML = monitors().map(function (m, i) { return '<option value="' + i + '">' + m.label + '</option>'; }).join('');
      for (var mi = 0; mi < monitors().length; mi++) if (monitors()[mi].label === state.monLabel) monSel.value = String(mi);
      monSel.onchange = function () {
        var m = monitors()[+this.value]; if (!m) return;
        state.monW = m.w; state.monH = m.h; state.monLabel = m.label;
        clampElements(); render();
      };
      themeSel.innerHTML = THEMES.map(function (t, i) { return '<option value="' + i + '">' + t.name + '</option>'; }).join('');
      themeSel.value = '0';
      themeSel.onchange = function () { applyTheme(THEMES[+this.value]); };
      bgInput.oninput = function () { state.bg = fromHex(this.value); redraw(); renderCode(); };
      paletteEl.innerHTML = PALETTE.map(function (p, i) { return '<button class="btn" data-pal="' + i + '">' + p.label + '</button>'; }).join('');

      root.addEventListener('click', function (e) {
        var pal = e.target.closest('[data-pal]');
        if (pal) { var P = PALETTE[+pal.getAttribute('data-pal')]; addElement(P.t, P.p); return; }
        var act = e.target.closest('[data-act]');
        if (act) { doAct(act.getAttribute('data-act')); return; }
        var cp = e.target.closest('[data-role="copycode"]');
        if (cp) { copyText(codeOut.value, cp); return; }
        var op = e.target.closest('[data-role="opencode"]');
        if (op) { if (global.LunaApp && global.LunaApp.loadCode) global.LunaApp.loadCode(codeOut.value, 'Экран (конструктор)'); return; }
      });
      props.addEventListener('input', onPropEdit);
      props.addEventListener('change', onPropEdit);

      canvas.addEventListener('mousedown', function (e) {
        var p = canvasPt(e), i = hitTest(p);
        state.selected = i;
        if (i >= 0) { var el = state.elements[i]; drag = { i: i, dx: p.x - el.x, dy: p.y - el.y }; }
        else drag = null;
        renderProps(); drawCanvas();
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        var p = canvasPt(e), el = state.elements[drag.i];
        el.x = Math.round(p.x - drag.dx); el.y = Math.round(p.y - drag.dy);
        clampElement(el);
        drawCanvas(); drawPreview();
        var xi = props.querySelector('[data-num="x"]'), yi = props.querySelector('[data-num="y"]');
        if (xi) xi.value = el.x; if (yi) yi.value = el.y;
      });
      window.addEventListener('mouseup', function () { if (drag) { drag = null; renderCode(); renderInfo(); } });
      window.addEventListener('keydown', function (e) {
        if (!isVisible()) return;
        var a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'SELECT' || a.tagName === 'TEXTAREA')) return;
        var sel = selEl(); if (!sel) return;
        var step = e.shiftKey ? 5 : 1;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); doAction('del', sel); return; }
        if (e.key === 'ArrowLeft') sel.x -= step; else if (e.key === 'ArrowRight') sel.x += step;
        else if (e.key === 'ArrowUp') sel.y -= step; else if (e.key === 'ArrowDown') sel.y += step;
        else return;
        e.preventDefault(); clampElement(sel); redraw(); renderCode(); renderInfo();
        var xi = props.querySelector('[data-num="x"]'), yi = props.querySelector('[data-num="y"]');
        if (xi) xi.value = sel.x; if (yi) yi.value = sel.y;
      });

      render();
    }

    return { mount: mount, getCode: function () { return codeOut ? codeOut.value : ''; } };
  }

  global.LunaUIBuilder = { create: create };
})(window);
