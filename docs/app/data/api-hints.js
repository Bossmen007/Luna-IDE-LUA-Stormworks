/*
 * Луна IDE — подсказки API в редакторе (автодополнение по Ctrl+Space и после точки).
 *
 * Формат:
 *   LUNA_HINTS.keywords      — ключевые слова Lua
 *   LUNA_HINTS.globals       — глобальные объекты и функции
 *   LUNA_HINTS.objects[name] — методы объекта: { doc, items: [{ name, sig, doc }] }
 *
 * Только то, что реально есть в игре и в эмуляции js/stormworks.js.
 * Сигнатуры сверены с SWScreen.prototype и PRELUDE.
 */
window.LUNA_HINTS = {
  keywords: [
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'goto',
    'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while'
  ],

  globals: [
    { name: 'onTick', sig: '()', doc: 'Вызывается каждый тик игры (~60 раз в секунду). Логика.' },
    { name: 'onDraw', sig: '()', doc: 'Вызывается каждый кадр. Только здесь можно рисовать.' },
    { name: 'input', sig: '', doc: 'Входы микроконтроллера: числа и логика по каналам 1–32.' },
    { name: 'output', sig: '', doc: 'Выходы микроконтроллера: числа и логика по каналам 1–32.' },
    { name: 'property', sig: '', doc: 'Свойства микроконтроллера (задаются в игре по имени).' },
    { name: 'screen', sig: '', doc: 'Рисование на мониторе: цвет, фигуры, текст, карта.' },
    { name: 'async', sig: '', doc: 'Асинхронные операции игры (HTTP).' },
    { name: 'g_savedata', sig: '', doc: 'Постоянные данные сохранения (таблица).' },
    { name: 'print', sig: '(…)', doc: 'Вывод в консоль IDE и в лог игры.' },
    { name: 'tostring', sig: '(v)', doc: 'Любое значение в строку.' },
    { name: 'tonumber', sig: '(v, base?)', doc: 'Строка в число, nil если не получилось.' },
    { name: 'type', sig: '(v)', doc: 'Тип значения: "number", "string", "table", "nil"…' },
    { name: 'pairs', sig: '(t)', doc: 'Обход таблицы: for k, v in pairs(t) do' },
    { name: 'ipairs', sig: '(t)', doc: 'Обход массива по порядку: for i, v in ipairs(t) do' },
    { name: 'next', sig: '(t, k)', doc: 'Следующая пара таблицы (служебная).' },
    { name: 'select', sig: '("#"|n, …)', doc: 'Число аргументов или аргументы с n-го.' },
    { name: 'error', sig: '(msg)', doc: 'Прервать скрипт с сообщением об ошибке.' },
    { name: 'assert', sig: '(v, msg)', doc: 'Упасть, если v ложно.' },
    { name: 'pcall', sig: '(f, …)', doc: 'Вызов с перехватом ошибки: ok, err = pcall(f).' },
    { name: 'math', sig: '', doc: 'Математика: floor, abs, min, max, sin, cos, sqrt…' },
    { name: 'string', sig: '', doc: 'Строки: format, sub, len, rep, upper, lower…' },
    { name: 'table', sig: '', doc: 'Таблицы: insert, remove, concat, sort, unpack.' }
  ],

  objects: {
    screen: {
      doc: 'Монитор. Рисовать можно только в onDraw.',
      items: [
        { name: 'setColor', sig: '(r, g, b, a)', doc: 'Цвет для следующих фигур и текста, 0–255.' },
        { name: 'drawClear', sig: '(r, g, b, a)', doc: 'Залить весь экран цветом (обычно в начале onDraw).' },
        { name: 'drawLine', sig: '(x1, y1, x2, y2)', doc: 'Линия между точками.' },
        { name: 'drawRect', sig: '(x, y, w, h)', doc: 'Рамка прямоугольника.' },
        { name: 'drawRectF', sig: '(x, y, w, h)', doc: 'Залитый прямоугольник.' },
        { name: 'drawCircle', sig: '(x, y, r)', doc: 'Окружность (контур).' },
        { name: 'drawCircleF', sig: '(x, y, r)', doc: 'Залитый круг.' },
        { name: 'drawTriangle', sig: '(x1, y1, x2, y2, x3, y3)', doc: 'Треугольник (контур).' },
        { name: 'drawTriangleF', sig: '(x1, y1, x2, y2, x3, y3)', doc: 'Залитый треугольник.' },
        { name: 'drawText', sig: '(x, y, text)', doc: 'Текст. Только латиница: кириллицу игра не отрисует.' },
        { name: 'drawTextBox', sig: '(x, y, w, h, text, ha, va)', doc: 'Текст в рамке с переносом; ha/va — выравнивание.' },
        { name: 'drawMap', sig: '(cx, cy, zoom)', doc: 'Карта мира: центр в cx, cy, zoom 0.1–50.' },
        { name: 'getWidth', sig: '()', doc: 'Ширина монитора в пикселях.' },
        { name: 'getHeight', sig: '()', doc: 'Высота монитора в пикселях.' },
        { name: 'setMapColorOcean', sig: '(r, g, b, a)', doc: 'Цвет океана на карте.' },
        { name: 'setMapColorLand', sig: '(r, g, b, a)', doc: 'Цвет суши на карте.' },
        { name: 'setMapColorGrass', sig: '(r, g, b, a)', doc: 'Цвет травы на карте.' },
        { name: 'setMapColorSand', sig: '(r, g, b, a)', doc: 'Цвет песка на карте.' },
        { name: 'setMapColorRock', sig: '(r, g, b, a)', doc: 'Цвет скал на карте.' },
        { name: 'setMapColorSnow', sig: '(r, g, b, a)', doc: 'Цвет снега на карте.' },
        { name: 'setMapColorGravel', sig: '(r, g, b, a)', doc: 'Цвет гравия на карте.' },
        { name: 'setMapColorShallows', sig: '(r, g, b, a)', doc: 'Цвет отмелей на карте.' }
      ]
    },
    input: {
      doc: 'Чтение входов. Каналы 1–32.',
      items: [
        { name: 'getNumber', sig: '(channel)', doc: 'Число с канала (0, если не подключён).' },
        { name: 'getBool', sig: '(channel)', doc: 'Логическое значение с канала.' }
      ]
    },
    output: {
      doc: 'Запись выходов. Каналы 1–32.',
      items: [
        { name: 'setNumber', sig: '(channel, value)', doc: 'Выдать число на канал.' },
        { name: 'setBool', sig: '(channel, value)', doc: 'Выдать логическое значение на канал.' }
      ]
    },
    property: {
      doc: 'Свойства микроконтроллера, заданные в игре по имени.',
      items: [
        { name: 'getNumber', sig: '("name")', doc: 'Числовое свойство.' },
        { name: 'getBool', sig: '("name")', doc: 'Логическое свойство.' },
        { name: 'getString', sig: '("name")', doc: 'Текстовое свойство.' }
      ]
    },
    async: {
      doc: 'Асинхронные операции игры.',
      items: [
        { name: 'httpGet', sig: '(port, url)', doc: 'HTTP-запрос; в IDE — заглушка.' }
      ]
    },
    math: {
      doc: 'Стандартная библиотека math.',
      items: [
        { name: 'abs', sig: '(x)', doc: 'Модуль числа.' },
        { name: 'ceil', sig: '(x)', doc: 'Округление вверх.' },
        { name: 'floor', sig: '(x)', doc: 'Округление вниз.' },
        { name: 'max', sig: '(a, b, …)', doc: 'Наибольшее значение.' },
        { name: 'min', sig: '(a, b, …)', doc: 'Наименьшее значение.' },
        { name: 'sqrt', sig: '(x)', doc: 'Квадратный корень.' },
        { name: 'sin', sig: '(x)', doc: 'Синус (радианы).' },
        { name: 'cos', sig: '(x)', doc: 'Косинус (радианы).' },
        { name: 'atan', sig: '(y, x)', doc: 'Арктангенс двух аргументов.' },
        { name: 'fmod', sig: '(a, b)', doc: 'Остаток от деления.' },
        { name: 'random', sig: '(m, n)', doc: 'Случайное число от m до n.' },
        { name: 'pi', sig: '', doc: 'Число π.' },
        { name: 'huge', sig: '', doc: 'Бесконечность (inf).' }
      ]
    },
    string: {
      doc: 'Стандартная библиотека string.',
      items: [
        { name: 'format', sig: '("fmt", …)', doc: 'Форматирование: "%d", "%0.2f", "%s".' },
        { name: 'sub', sig: '(s, i, j)', doc: 'Подстрока с i-го по j-й символ.' },
        { name: 'len', sig: '(s)', doc: 'Длина строки.' },
        { name: 'rep', sig: '(s, n)', doc: 'Повторить строку n раз.' },
        { name: 'upper', sig: '(s)', doc: 'В верхний регистр.' },
        { name: 'lower', sig: '(s)', doc: 'В нижний регистр.' },
        { name: 'find', sig: '(s, pattern)', doc: 'Индекс первого вхождения.' }
      ]
    },
    table: {
      doc: 'Стандартная библиотека table.',
      items: [
        { name: 'insert', sig: '(t, v)', doc: 'Добавить значение в конец.' },
        { name: 'remove', sig: '(t, i)', doc: 'Удалить элемент по индексу.' },
        { name: 'concat', sig: '(t, sep)', doc: 'Склеить массив в строку.' },
        { name: 'sort', sig: '(t)', doc: 'Отсортировать массив.' },
        { name: 'unpack', sig: '(t)', doc: 'Развернуть массив в аргументы.' }
      ]
    }
  }
};
