/*
 * Луна IDE — проверка кода перед запуском (линт).
 *
 * Ловит то, что в игре выстрелит молча или в самый неподходящий момент:
 *   • кириллица в строках для screen.drawText / drawTextBox — шрифт игры её не рисует;
 *   • канал вне диапазона 1–32 у input/output;
 *   • обращение к несуществующему методу screen.*;
 *   • local function onTick/onDraw — игра такие функции не вызовет.
 *
 * Функция чистая: (код) → массив { level, line, message }. Работает и в браузере,
 * и в Node (проверка tools/check-lint.js прогоняет её без Electron).
 */
(function (root) {
  'use strict';

  var CYR = /[А-Яа-яЁё]/;

  function lines(code) { return String(code).split('\n'); }

  // Позиция найденного фрагмента → номер строки
  function lineAt(code, index) {
    var n = 1;
    for (var i = 0; i < index && i < code.length; i++) if (code.charCodeAt(i) === 10) n++;
    return n;
  }

  function knownScreenMethods() {
    var hints = root.LUNA_HINTS;
    if (!hints || !hints.objects || !hints.objects.screen) return null;
    var names = {};
    hints.objects.screen.items.forEach(function (it) { names[it.name] = true; });
    return names;
  }

  // Строковые литералы внутри фрагмента (учитываем экранирование)
  function stringLiterals(text) {
    var out = [];
    var re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
    var m;
    while ((m = re.exec(text)) !== null) out.push(m[1] !== undefined ? m[1] : m[2]);
    return out;
  }

  function check(code) {
    var src = String(code || '');
    var found = [];
    var i, m;

    // 1. кириллица в тексте, который уходит на монитор
    var drawRe = /\b(screen\.(?:drawText|drawTextBox))\s*\(/g;
    while ((m = drawRe.exec(src)) !== null) {
      var nl = src.indexOf('\n', m.index);
      var tail = src.slice(m.index, nl === -1 ? src.length : nl);
      var bad = stringLiterals(tail).filter(function (s) { return CYR.test(s); })[0];
      if (bad) {
        found.push({
          level: 'error',
          line: lineAt(src, m.index),
          message: 'кириллица в тексте для монитора («' + trim(bad) + '») — шрифт игры её не отрисует, замените на латиницу'
        });
      }
    }

    // 2. каналы вне 1–32
    var chRe = /\b(input|output)\.(getNumber|getBool|setNumber|setBool)\s*\(\s*(-?\d+(?:\.\d+)?)/g;
    while ((m = chRe.exec(src)) !== null) {
      var ch = Number(m[3]);
      if (!(ch >= 1 && ch <= 32)) {
        found.push({
          level: 'error',
          line: lineAt(src, m.index),
          message: 'канал ' + m[3] + ' у ' + m[1] + '.' + m[2] + ' — в игре каналы только 1–32'
        });
      }
    }

    // 3. несуществующие методы screen.*
    var known = knownScreenMethods();
    if (known) {
      var smRe = /\bscreen\.([A-Za-z_]\w*)/g;
      while ((m = smRe.exec(src)) !== null) {
        var name = m[1];
        if (name === 'drawText' || name === 'drawTextBox') continue;
        if (!known[name]) {
          found.push({
            level: 'warn',
            line: lineAt(src, m.index),
            message: 'у screen нет метода «' + name + '» — проверьте написание (Ctrl+Space покажет список)'
          });
        }
      }
    }

    // 4. local onTick/onDraw — игра их не увидит
    var localRe = /^[ \t]*local\s+function\s+(onTick|onDraw)\b/gm;
    while ((m = localRe.exec(src)) !== null) {
      found.push({
        level: 'error',
        line: lineAt(src, m.index),
        message: m[1] + ' объявлена как local — игра вызывает только глобальные onTick/onDraw'
      });
    }

    // стабильный порядок: по строкам, ошибки раньше предупреждений
    return found.sort(function (a, b) {
      return a.line - b.line || (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1);
    });
  }

  function trim(s) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 37) + '…' : s;
  }

  root.LunaLint = { check: check, lines: lines };
})(typeof globalThis !== 'undefined' ? globalThis : this);
