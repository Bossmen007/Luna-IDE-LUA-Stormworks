/*
 * Луна IDE — уроки по Lua для Stormworks (на русском).
 * Формат: window.LUNA_TUTORIALS = [{ id, title, desc, minutes, body(html) }]
 * Внутри body код в <pre class="code">, символы < и > экранированы (&lt; &gt;).
 */
window.LUNA_TUTORIALS = [
  {
    id: 'variables', title: 'Переменные и типы данных', minutes: 6,
    desc: 'Как хранить значения: числа, строки, логические. Локальные и глобальные переменные.',
    body:
      '<p>Переменная — это «коробка» с именем, в которой лежит значение. Тип определяется автоматически.</p>' +
      '<table class="api-table"><tr><th>Тип</th><th>Пример</th><th>Смысл</th></tr>' +
      '<tr><td>number</td><td><code>local x = 42</code>, <code>local pi = 3.14</code></td><td>число (целое или дробное)</td></tr>' +
      '<tr><td>string</td><td><code>local s = "Привет"</code></td><td>строка</td></tr>' +
      '<tr><td>boolean</td><td><code>local on = true</code></td><td>истина/ложь</td></tr>' +
      '<tr><td>table</td><td><code>local t = {1, 2, 3}</code></td><td>таблица (массив/структура)</td></tr>' +
      '<tr><td>nil</td><td><code>local n = nil</code></td><td>«пусто», отсутствие значения</td></tr></table>' +
      '<p><b>local</b> — переменная видна только внутри блока; без него переменная глобальная. В Stormworks <code>onTick</code> и <code>onDraw</code> обязательно должны быть глобальными.</p>' +
      '<pre class="code">local speed = 0        -- сохраняется между кадрами\nlocal name = "Лодка"\nlocal active = true\n\nfunction onTick()\n    speed = speed + 1\n    print(name, speed, active)\nend</pre>' +
      '<div class="callout">Счётчик, объявленный вне функций, «живёт» между тиками — это основной способ хранить состояние скрипта.</div>'
  },
  {
    id: 'conditions', title: 'Условия (if / else)', minutes: 7,
    desc: 'Ветвление: выполнять код в зависимости от значений. Операторы сравнения и логические.',
    body:
      '<p>Условие позволяет выполнять разный код в зависимости от ситуации.</p>' +
      '<pre class="code">local v = input.getNumber(1)\n\nif v &gt; 10 then\n    print("быстро")\nelseif v &gt; 0 then\n    print("медленно")\nelse\n    print("стоим или назад")\nend</pre>' +
      '<p>Операторы сравнения: <code>==</code> равно, <code>~=</code> не равно, <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code>.</p>' +
      '<p>Логические: <code>and</code> (и), <code>or</code> (или), <code>not</code> (не).</p>' +
      '<pre class="code">if v &gt; 5 and v &lt; 20 then print("рабочий диапазон") end\nif not active then print("выключено") end</pre>' +
      '<div class="callout">В Lua любое значение, кроме <code>false</code> и <code>nil</code>, считается истинным. Даже <code>0</code> — это «истина»!</div>'
  },
  {
    id: 'loops', title: 'Циклы (while и for)', minutes: 8,
    desc: 'Повторение действий: перебор каналов, отрисовка делений шкалы, поиск в таблице.',
    body:
      '<p><b>while</b> повторяет, пока условие истинно:</p>' +
      '<pre class="code">local i = 1\nwhile i &lt;= 5 do\n    print(i)\n    i = i + 1\nend</pre>' +
      '<p><b>for</b> по числам — когда число повторов известно:</p>' +
      '<pre class="code">for i = 1, 10 do          -- 1,2,...,10\n    output.setNumber(i, 0)\nend\n\nfor i = 10, 1, -1 do     -- с шагом -1 (обратный отсчёт)\n    print(i)\nend</pre>' +
      '<p><b>for</b> по таблице — перебор элементов:</p>' +
      '<pre class="code">local colors = { "красный", "зелёный", "синий" }\nfor i, c in ipairs(colors) do\n    print(i, c)\nend</pre>' +
      '<div class="callout warn">Осторожно с <code>while true do end</code> — это бесконечный цикл. IDE прервёт его с сообщением «Превышен лимит выполнения».</div>'
  },
  {
    id: 'functions', title: 'Функции', minutes: 8,
    desc: 'Свои команды: выносим повторяющийся код, получаем результат через return.',
    body:
      '<p>Функция — именованный блок кода, который можно вызывать много раз.</p>' +
      '<pre class="code">-- функция без аргументов\nfunction hello()\n    print("Привет!")\nend\n\n-- с аргументами и возвратом значения\nlocal function add(a, b)\n    return a + b\nend\n\nhello()\nlocal s = add(2, 3)   -- 5</pre>' +
      '<p>Функции-помощники удобно объявлять как <code>local</code> (до их использования):</p>' +
      '<pre class="code">local function clamp(v, lo, hi)\n    return math.max(lo, math.min(hi, v))\nend\n\nfunction onTick()\n    output.setNumber(1, clamp(input.getNumber(1), 0, 1))\nend</pre>' +
      '<div class="callout">Порядок важен: <code>local</code>-функцию нужно объявить <b>до</b> строки, где она вызывается.</div>'
  },
  {
    id: 'tables', title: 'Таблицы', minutes: 9,
    desc: 'Главная структура данных Lua: массивы, словари и объекты в одном.',
    body:
      '<p>Таблица — «универсальный контейнер». Бывает массивом:</p>' +
      '<pre class="code">local t = { 10, 20, 30 }   -- t[1]=10, t[2]=20, t[3]=30\nprint(#t)                  -- длина = 3</pre>' +
      '<p>А бывает словарём (ключ → значение):</p>' +
      '<pre class="code">local player = { name = "Иван", score = 5 }\nprint(player.name)        -- "Иван"\nplayer.score = player.score + 1</pre>' +
      '<p>Вложенные таблицы — удобный способ хранить настройки приборов:</p>' +
      '<pre class="code">local gauges = {\n    { name = "Скорость", value = 0, max = 60 },\n    { name = "Высота",   value = 0, max = 1000 },\n}\n\nfunction onTick()\n    gauges[1].value = input.getNumber(1)\n    gauges[2].value = input.getNumber(2)\nend</pre>' +
      '<div class="callout">Обращение к несуществующему ключу даёт <code>nil</code>, а попытка прочитать поле у <code>nil</code> — ошибку.</div>'
  },
  {
    id: 'tick-draw', title: 'onTick и onDraw: когда что делать', minutes: 7,
    desc: 'Разделение обязанностей: логика в onTick, рисование в onDraw.',
    body:
      '<p>Запомните правило:</p>' +
      '<ul><li><b>onTick</b> — чтение входов, запись выходов, работа со свойствами, логика. Не рисует.</li>' +
      '<li><b>onDraw</b> — только рисование на <code>screen</code>. Не трогает входы/выходы.</li></ul>' +
      '<p>Причины: <code>onTick</code> не вызывается на паузе, а <code>onDraw</code> — вызывается. И задержка логики не должна зависеть от FPS.</p>' +
      '<pre class="code">local speed = 0\n\nfunction onTick()\n    speed = input.getNumber(1)      -- считаем здесь\nend\n\nfunction onDraw()\n    screen.drawText(4, 4, string.format("V = %.1f", speed))  -- рисуем здесь\nend</pre>' +
      '<div class="callout">Хитрость: если нужно только рисовать (индикатор), считать в onDraw допустимо, но тяжёлые вычисления всё равно оставьте в onTick.</div>'
  },
  {
    id: 'io-channels', title: 'Композитные каналы ввода-вывода', minutes: 8,
    desc: '32 числа и 32 логических канала. Как читать входы и писать выходы.',
    body:
      '<p>Композитный кабель несёт 32 числовых и 32 логических канала. Доступ к ним:</p>' +
      '<pre class="code">-- чтение входа\nlocal v = input.getNumber(1)     -- число с канала 1\nlocal on = input.getBool(1)      -- логика с канала 1\n\n-- запись выхода\noutput.setNumber(1, v * 2)\noutput.setBool(1, on)</pre>' +
      '<p>Частый приём — «прочитать состояние, изменить, записать»:</p>' +
      '<pre class="code">local counter = 0\nfunction onTick()\n    if input.getBool(1) then\n        counter = counter + 1\n    end\n    output.setNumber(1, counter)\nend</pre>' +
      '<p>В панели «Композит» этой IDE задайте значения входов — и мотор сразу покажет, как работают ваши каналы.</p>'
  },
  {
    id: 'drawing', title: 'Рисование на экране', minutes: 9,
    desc: 'Цвет, фигуры, текст. Как из примитивов собрать приборную панель.',
    body:
      '<p>Рисование идёт в <code>onDraw()</code>. Сначала цвет, потом фигура:</p>' +
      '<pre class="code">function onDraw()\n    screen.drawClear(16, 16, 22, 255)   -- очистка фона\n\n    screen.setColor(255, 0, 0)          -- красный\n    screen.drawRectF(10, 10, 60, 30)    -- залитый прямоугольник\n\n    screen.setColor(0, 255, 0)\n    screen.drawCircle(100, 60, 20)      -- окружность\n\n    screen.setColor(255, 255, 255)\n    screen.drawText(10, 80, "Text")\nend</pre>' +
      '<p>Текст с выравниванием — через <code>drawTextBox</code> (H: −1 слева, 0 центр, 1 справа; V: −1 верх, 0 центр, 1 низ):</p>' +
      '<pre class="code">screen.drawTextBox(0, 0, screen.getWidth(), 12,\n    "CENTER", 0, 0)</pre>' +
      '<div class="callout">Цвет задаётся как <code>setColor(r, g, b, a)</code>, где значения 0–255, а <code>a</code> — прозрачность. Четвёртый аргумент можно опустить.</div>'
  },
  {
    id: 'trig', title: 'Тригонометрия: вращение и стрелки', minutes: 9,
    desc: 'sin/cos для стрелок приборов, круговых шкал и направления на цель.',
    body:
      '<p>Чтобы поставить точку по углу, используют <code>cos</code> и <code>sin</code>:</p>' +
      '<pre class="code">-- точка на окружности радиуса r под углом a (радианы)\nlocal x = cx + math.cos(a) * r\nlocal y = cy + math.sin(a) * r</pre>' +
      '<p>Поворот точки вокруг центра — формула, без которой не обходится стрелочный прибор:</p>' +
      '<pre class="code">local function rotatePoint(cx, cy, x, y, angle)\n    local s, c = math.sin(angle), math.cos(angle)\n    local dx, dy = x - cx, y - cy\n    return cx + dx * c - dy * s, cy + dx * s + dy * c\nend</pre>' +
      '<p>Диапазон 0…1 превращается в полный оборот так: <code>a = value * math.pi * 2 - math.pi / 2</code> (минус 90°, чтобы ноль был сверху).</p>' +
      '<div class="callout">Углы в Lua — в <b>радианах</b>. Перевод: <code>math.rad(90)</code> → 1.57, <code>math.deg(math.pi)</code> → 180.</div>'
  },
  {
    id: 'debug', title: 'Отладка и поиск ошибок', minutes: 6,
    desc: 'print, измерение времени, типичные ошибки новичка и как их читать.',
    body:
      '<p>Главный инструмент — <code>print</code>: вывод в консоль IDE.</p>' +
      '<pre class="code">function onTick()\n    local v = input.getNumber(1)\n    print("вход 1 =", v)\nend</pre>' +
      '<div class="callout warn">Не оставляйте <code>print</code> в каждом тик в готовом скрипте — это лишняя нагрузка.</div>' +
      '<p>Частые ошибки:</p>' +
      '<ul><li><code>attempt to index a nil value</code> — переменная пустая, сначала присвойте ей значение;</li>' +
      '<li><code>attempt to call a nil value</code> — опечатка в имени функции;</li>' +
      '<li><code>&#39;end&#39; expected</code> — где-то забыт <code>end</code>;</li>' +
      '<li>«Превышен лимит выполнения» — бесконечный цикл.</li></ul>' +
      '<p>Полезно: измеряйте время своей функции, чтобы понять её стоимость.</p>' +
      '<pre class="code">local t0 = 0\nfunction onTick()\n    t0 = 0  -- (в игре: t0 = timer())\n    -- ... ваш код ...\nend</pre>'
  }
];
