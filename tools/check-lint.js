/*
 * Проверка линта кода (js/lint.js) — без Electron, чистые функции.
 *
 *   node tools/check-lint.js   (или npm run check-lint)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = { console };
ctx.globalThis = ctx;
ctx.window = ctx;   // data/*.js пишут в window.LUNA_*
vm.createContext(ctx);

// данные подсказок нужны линту, чтобы знать список методов screen.*
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data', 'api-hints.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'lint.js'), 'utf8'), ctx);

const Lint = ctx.LunaLint;
if (!Lint || typeof Lint.check !== 'function') {
  console.error('линт не загрузился: нет LunaLint.check');
  process.exit(1);
}

const cases = [
  {
    name: 'кириллица в drawText',
    code: 'function onDraw()\n    screen.drawText(4, 4, "Привет")\nend',
    expect: [{ level: 'error', line: 2, match: /кириллица/ }]
  },
  {
    name: 'латиница в drawText — чисто',
    code: 'function onDraw()\n    screen.drawText(4, 4, "Hello")\nend',
    expect: []
  },
  {
    name: 'кириллица в комментарии — не ошибка',
    code: 'function onDraw()\n    -- тут русский текст\n    screen.drawText(4, 4, "OK")\nend',
    expect: []
  },
  {
    name: 'кириллица в строке вне монитора — не ошибка',
    code: 'function onTick()\n    local s = "Привет"\n    print(s)\nend',
    expect: []
  },
  {
    name: 'канал 33 у input',
    code: 'function onTick()\n    local v = input.getNumber(33)\nend',
    expect: [{ level: 'error', line: 2, match: /канал 33/ }]
  },
  {
    name: 'канал 0 у output',
    code: 'function onTick()\n    output.setBool(0, true)\nend',
    expect: [{ level: 'error', line: 2, match: /канал 0/ }]
  },
  {
    name: 'каналы 1 и 32 — чисто',
    code: 'function onTick()\n    output.setNumber(1, input.getNumber(32))\nend',
    expect: []
  },
  {
    name: 'опечатка в методе screen',
    code: 'function onDraw()\n    screen.drawTxt(4, 4, "Hello")\nend',
    expect: [{ level: 'warn', line: 2, match: /нет метода «drawTxt»/ }]
  },
  {
    name: 'local function onTick',
    code: 'local function onTick()\nend',
    expect: [{ level: 'error', line: 1, match: /local/ }]
  },
  {
    name: 'нормальный скрипт — без замечаний',
    code: [
      'function onTick()',
      '    local v = input.getNumber(1)',
      '    output.setNumber(1, v * 2)',
      'end',
      '',
      'function onDraw()',
      '    screen.setColor(0, 200, 120)',
      '    screen.drawText(4, 4, "OK " .. string.format("%.0f", 42))',
      'end'
    ].join('\n'),
    expect: []
  },
  {
    name: 'несколько замечаний сортируются по строкам',
    code: 'function onTick()\n    local a = input.getNumber(40)\nend\nfunction onDraw()\n    screen.drawText(1, 1, "Текст")\nend',
    expect: [
      { level: 'error', line: 2, match: /канал 40/ },
      { level: 'error', line: 5, match: /кириллица/ }
    ]
  }
];

let ok = true;
cases.forEach(function (c) {
  const res = Lint.check(c.code);
  const good = res.length === c.expect.length && c.expect.every(function (e, i) {
    const got = res[i];
    return got && got.level === e.level && got.line === e.line && e.match.test(got.message);
  });
  if (!good) ok = false;
  console.log((good ? '  OK    ' : '  ПЛОХО ') + c.name);
  if (!good) {
    console.log('        ожидалось: ' + JSON.stringify(c.expect.map(function (e) { return e.level + '@' + e.line; })));
    console.log('        получено:  ' + JSON.stringify(res.map(function (r) { return r.level + '@' + r.line + ' ' + r.message; }), null, 0));
  }
});

console.log(ok ? 'РЕЗУЛЬТАТ: OK' : 'РЕЗУЛЬТАТ: ПРОВАЛ');
process.exit(ok ? 0 : 1);
