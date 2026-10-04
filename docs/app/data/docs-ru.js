/*
 * Луна IDE — справочник по Lua и API Stormworks на русском языке.
 * Источник терминов и имён функций: официальная документация Stormworks.
 * Формат: window.LUNA_DOCS = [{ id, title, icon, articles: [{ id, title, body(html) }] }]
 */
window.LUNA_DOCS = [
  {
    id: 'intro', title: 'Начало работы', icon: '📘',
    articles: [
      {
        id: 'what-is-lua', title: 'Что такое Lua в Stormworks',
        body: '<p><b>Lua</b> — язык программирования, встроенный в Stormworks. Скрипт помещается в блок «Микроконтроллер», соединяется с логическими узлами (входами и выходами) и с мониторами.</p>' +
          '<p>Скрипт — это «чёрный ящик»: игра синхронизирует только входы и выходы, а внутри может происходить что угодно. Скрипты применяют для:</p>' +
          '<ul><li>автопилотов и стабилизаторов;</li><li>бортовых компьютеров и приборных панелей;</li><li>тахометров, альтиметров, спидометров, компасов;</li><li>сенсорных экранов (кнопки, переключатели прямо на мониторе);</li><li>обработки сигналов датчиков и логики механизмов.</li></ul>' +
          '<div class="callout">Скрипт пишется на Lua 5.3. В этой IDE скрипт исполняется прямо в браузере, поэтому можно сразу видеть результат.</div>'
      },
      {
        id: 'structure', title: 'Структура скрипта: onTick и onDraw',
        body: '<p>Игра сама вызывает ваши функции:</p>' +
          '<table class="api-table"><tr><th>Функция</th><th>Когда вызывается</th></tr>' +
          '<tr><td><code>function onTick()</code></td><td>Каждый физический тик игры (~60 раз в секунду). Здесь читают/пишут входы-выходы, свойства, работают с логикой. На паузе НЕ вызывается.</td></tr>' +
          '<tr><td><code>function onDraw()</code></td><td>Каждый кадр отрисовки монитора (~60 раз в секунду, зависит от FPS). Только здесь можно рисовать на экране. Вызывается даже на паузе.</td></tr></table>' +
          '<p>Пример минимального скрипта:</p><pre class="code">function onTick()\n    -- читаем число с канала 1 и утрояем его\n    local v = input.getNumber(1)\n    output.setNumber(1, v * 3)\nend\n\nfunction onDraw()\n    screen.setColor(0, 200, 0)\n    screen.drawText(4, 4, "Hello, Stormworks!")\nend</pre>' +
          '<div class="callout warn">Важно: <code>onTick</code> и <code>onDraw</code> должны быть <b>глобальными</b> функциями — не пишите перед ними <code>local</code>.</div>' +
          '<div class="callout warn"><b>Ограничение размера:</b> один Lua-скрипт может содержать не более <b>8192 символов</b>. Считаются <b>все</b> символы — буквы, знаки, пробелы, переводы строк и комментарии. В IDE счётчик и предел показаны в панели редактора; если код не влезает, нажмите «Минифицировать».</div>'
      },
      {
        id: 'first-script', title: 'Первая программа',
        body: '<p>Напишем «мигалку»: раз в секунду переключаем логический выход.</p>' +
          '<pre class="code">local t = 0          -- счётчик тиков\nlocal state = false\n\nfunction onTick()\n    t = t + 1\n    if t &gt;= 60 then   -- 60 тиков ≈ 1 секунда\n        t = 0\n        state = not state\n    end\n    output.setBool(1, state)\nend</pre>' +
          '<p>Нажмите <b>Запустить</b> — в панели «Композит» будет видно, как выход 1 меняет значение.</p>'
      }
    ]
  },
  {
    id: 'io', title: 'Ввод и вывод', icon: '🔌',
    articles: [
      {
        id: 'input', title: 'input — чтение входов',
        body: '<p>Композитный вход микроконтроллера имеет 32 числовых канала и 32 логических. Значения считываются так:</p>' +
          '<table class="api-table"><tr><th>Функция</th><th>Пример</th><th>Описание</th></tr>' +
          '<tr><td><code>input.getNumber(ch)</code></td><td><code>input.getNumber(1)</code></td><td>Возвращает <b>число</b> с канала <i>ch</i> (1–32).</td></tr>' +
          '<tr><td><code>input.getBool(ch)</code></td><td><code>input.getBool(3)</code></td><td>Возвращает <b>true/false</b> с логического канала <i>ch</i> (1–32).</td></tr></table>' +
          '<div class="callout">Значения входа приходят с задержкой в несколько тиков — она тем больше, чем больше логических соединений между датчиком и скриптом.</div>'
      },
      {
        id: 'output', title: 'output — запись выходов',
        body: '<table class="api-table"><tr><th>Функция</th><th>Пример</th><th>Описание</th></tr>' +
          '<tr><td><code>output.setNumber(ch, v)</code></td><td><code>output.setNumber(1, 3.14)</code></td><td>Записывает <b>число</b> в канал <i>ch</i> (1–32).</td></tr>' +
          '<tr><td><code>output.setBool(ch, v)</code></td><td><code>output.setBool(2, true)</code></td><td>Записывает <b>true/false</b> в логический канал <i>ch</i> (1–32).</td></tr></table>' +
          '<div class="callout">Выход тоже задерживается на несколько тиков. Читать собственный выход обратно внутри скрипта смысла нет — для этого держите состояние в переменных.</div>'
      },
      {
        id: 'delay', title: 'Задержка сигнала',
        body: '<p>Задержка в тиках равна числу логических соединений между выходом датчика и входом скрипта. <b>Входы и выходы микроконтроллера не считаются</b>: если кнопка подключена к входу микроконтроллера, а внутри — к скрипту, задержка равна 1.</p>' +
          '<p>Игровая симуляция задержки настраивается в «Настройках» этой IDE (поле «Задержка ввода»).</p>'
      }
    ]
  },
  {
    id: 'property', title: 'Свойства', icon: '⚙️',
    articles: [
      {
        id: 'property-api', title: 'property — чтение свойств',
        body: '<p>Скрипт может читать значения блоков «Свойство» (Property), находящихся в том же микроконтроллере. Доступ — по <b>метке</b> (label), регистр важен.</p>' +
          '<table class="api-table"><tr><th>Функция</th><th>Описание</th></tr>' +
          '<tr><td><code>property.getNumber("Метка")</code></td><td>Возвращает число свойства с указанной меткой.</td></tr>' +
          '<tr><td><code>property.getBool("Метка")</code></td><td>Возвращает логическое значение свойства.</td></tr>' +
          '<tr><td><code>property.getString("Метка")</code></td><td>Возвращает строку свойства.</td></tr></table>' +
          '<p>Пример:</p><pre class="code">function onTick()\n    local k = property.getNumber("Коэффициент")\n    output.setNumber(1, input.getNumber(1) * k)\nend</pre>' +
          '<div class="callout">В панели «Свойства» этой IDE задайте метки и значения, чтобы протестировать скрипт без запуска игры.</div>'
      }
    ]
  },
  {
    id: 'screen', title: 'Экран и графика', icon: '🖥️',
    articles: [
      {
        id: 'screen-api', title: 'screen — методы рисования',
        body: '<p>Работает только внутри <code>onDraw()</code>. Перед рисованием задайте цвет методом <code>setColor</code>.</p>' +
          '<table class="api-table"><tr><th>Метод</th><th>Описание</th></tr>' +
          '<tr><td><code>screen.setColor(r, g, b, a)</code></td><td>Цвет рисования. Значения 0–255, <i>a</i> — прозрачность (0–255).</td></tr>' +
          '<tr><td><code>screen.drawLine(x1, y1, x2, y2)</code></td><td>Линия из точки в точку.</td></tr>' +
          '<tr><td><code>screen.drawRect(x, y, w, h)</code></td><td>Прямоугольник (контур).</td></tr>' +
          '<tr><td><code>screen.drawRectF(x, y, w, h)</code></td><td>Прямоугольник (залитый).</td></tr>' +
          '<tr><td><code>screen.drawCircle(x, y, r)</code></td><td>Окружность (контур).</td></tr>' +
          '<tr><td><code>screen.drawCircleF(x, y, r)</code></td><td>Круг (залитый).</td></tr>' +
          '<tr><td><code>screen.drawTriangle(x1,y1,x2,y2,x3,y3)</code></td><td>Треугольник (контур).</td></tr>' +
          '<tr><td><code>screen.drawTriangleF(x1,y1,x2,y2,x3,y3)</code></td><td>Треугольник (залитый).</td></tr>' +
          '<tr><td><code>screen.drawText(x, y, текст)</code></td><td>Текст. Каждый символ ~4 px в ширину и 5 px в высоту.</td></tr>' +
          '<tr><td><code>screen.drawTextBox(x,y,w,h,текст,выравн_H,выравн_V)</code></td><td>Текст в рамке с переносом строк. Выравнивание: H: −1 слева, 0 по центру, 1 справа; V: −1 сверху, 0 по центру, 1 снизу.</td></tr>' +
          '<tr><td><code>screen.drawClear(r,g,b,a)</code></td><td>Заливает весь экран указанным цветом (очистка).</td></tr>' +
          '<tr><td><code>screen.getWidth()</code></td><td>Ширина монитора в пикселях.</td></tr>' +
          '<tr><td><code>screen.getHeight()</code></td><td>Высота монитора в пикселях.</td></tr></table>' +
          '<p>Фигуры рисуются друг поверх друга: последняя нарисованная — сверху.</p>' +
          '<div class="callout warn">Если у вас несколько мониторов, <code>onDraw()</code> вызовется отдельно для каждого, а размеры могут отличаться между вызовами.</div>' +
          '<div class="callout warn"><b>Текст на экране — только латиницей.</b> Шрифт Stormworks не поддерживает кириллицу: русские буквы превратятся в «квадратики». Пишите надписи по-английски (<code>"Speed"</code>, <code>"ON/OFF"</code>, <code>"DASHBOARD"</code>). Комментарии в коде — на русском, они на экран не попадают.</div>'
      },
      {
        id: 'map', title: 'Карта',
        body: '<table class="api-table"><tr><th>Метод</th><th>Описание</th></tr>' +
          '<tr><td><code>screen.drawMap(x, y, zoom)</code></td><td>Рисует карту мира с центром в координатах (x, y). zoom от 0.1 (близко) до 50 (далеко).</td></tr>' +
          '<tr><td><code>screen.setMapColorOcean(r,g,b,a)</code></td><td>Цвет океана на карте (и аналогично для остальных слоёв).</td></tr>' +
          '<tr><td><code>screen.setMapColorLand</code>, <code>setMapColorGrass</code>, <code>setMapColorSand</code>, <code>setMapColorRock</code>, <code>setMapColorSnow</code>, <code>setMapColorGravel</code>, <code>setMapColorShallows</code></td><td>Цвета слоёв карты.</td></tr></table>' +
          '<p>Карта рисуется на весь экран. Чтобы наложить поверх неё фигуры — рисуйте их <b>после</b> <code>drawMap</code>.</p>'
      },
      {
        id: 'sizes', title: 'Размеры мониторов в игре',
        body: '<p>В Stormworks <b>1 блок монитора = 32×32 пикселя</b>. Ниже — полный список мониторов, которые есть в игре (названия совпадают с компонентами на верстаке).</p>' +
          '<table class="api-table"><tr><th>Компонент</th><th>Разрешение, px</th></tr>' +
          '<tr><td>HUD 1×1</td><td>32 × 32</td></tr>' +
          '<tr><td>HUD 3×3</td><td>96 × 96</td></tr>' +
          '<tr><td>Monitor 1×1</td><td>32 × 32</td></tr>' +
          '<tr><td>Monitor 1×2</td><td>32 × 64</td></tr>' +
          '<tr><td>Monitor 1×3</td><td>32 × 96</td></tr>' +
          '<tr><td>Monitor 2×2</td><td>64 × 64</td></tr>' +
          '<tr><td>Monitor 2×3</td><td>64 × 96</td></tr>' +
          '<tr><td>Monitor 3×3</td><td>96 × 96</td></tr>' +
          '<tr><td>Monitor 3×5</td><td>160 × 96</td></tr>' +
          '<tr><td>Monitor 9×5</td><td>288 × 160</td></tr></table>' +
          '<p>Готовые размеры можно выбрать в панели «Монитор» → «Разрешение монитора», либо задать своё (поле «Другой размер…»).</p>' +
          '<div class="callout">Разрешение монитора — это <b>число пикселей</b>, которое видит скрипт через <code>screen.getWidth()</code> и <code>screen.getHeight()</code>. Кнопки масштаба в IDE (Вписать / 1:1 / ＋ / − / «Во весь экран», колесо мыши с Ctrl) меняют только <b>вид</b> и на скрипт не влияют. Масштаб запоминается отдельно для каждого разрешения — вернувшись к размеру, вы увидите его в прежнем виде.</div>'
      },
      {
        id: 'touch', title: 'Сенсорный экран (касания)',
        body: '<p>У монитора есть композитный выход с данными о нажатиях. Подключите его к скрипту и читайте так:</p>' +
          '<p><b>Числовые каналы:</b></p><ol><li>ширина монитора;</li><li>высота монитора;</li><li>X первого нажатия;</li><li>Y первого нажатия;</li><li>X второго нажатия;</li><li>Y второго нажатия.</li></ol>' +
          '<p><b>Логические каналы:</b> 1 — нажатие 1 (обычно <b>Q</b>), 2 — нажатие 2 (обычно <b>E</b>).</p>' +
          '<div class="callout">Пока палец/кнопка удерживается, координаты не меняются — перетаскивание (drag) реализовать нельзя. Используйте нажатие/отпускание.</div>' +
          '<p>Пример кнопки — в разделе «Примеры».</p>'
      }
    ]
  },
  {
    id: 'async', title: 'Запросы', icon: '🌐',
    articles: [
      {
        id: 'httpget', title: 'async.httpGet — HTTP-запросы',
        body: '<p>Позволяет отправлять HTTP-запрос на адрес <code>http://localhost:ПОРТ/путь</code> (для интеграций с внешними программами). Ответ приходит в функцию <code>httpReply</code>, которую вы объявляете сами.</p>' +
          '<pre class="code">function onTick()\n    -- отправить запрос (не чаще одного раза за тик)\n    async.httpGet(8000, "/status")\nend\n\n-- игра вызовет эту функцию, когда придёт ответ\nfunction httpReply(port, url, status, body)\n    print(status, body)\nend</pre>' +
          '<div class="callout warn">В браузерной IDE HTTP-запросы не выполняются (браузер запрещает обращения к localhost) — вызов выводит предупреждение в консоль. В игре всё работает.</div>'
      }
    ]
  },
  {
    id: 'debug', title: 'Отладка', icon: '🐞',
    articles: [
      {
        id: 'print', title: 'print и вывод в консоль',
        body: '<p><code>print(...)</code> выводит значения в консоль IDE. Можно передавать несколько значений через запятую.</p>' +
          '<pre class="code">print("Значение:", 42, true)\n-- В консоли: Значение:  42  true</pre>' +
          '<p>Цветной вывод в консоли «цвет — оттенок»:</p><pre class="code">print("Ошибка!", "red")   -- вторая строка-подсказка не влияет на игру</pre>'
      },
      {
        id: 'errors', title: 'Типичные ошибки',
        body: '<table class="api-table"><tr><th>Сообщение</th><th>Причина</th><th>Решение</th></tr>' +
          '<tr><td>attempt to index a nil value</td><td>Обращение к полю nil-переменной</td><td>Проверьте, что переменная инициализирована (не <code>nil</code>).</td></tr>' +
          '<tr><td>attempt to call a nil value</td><td>Вызов несуществующей функции</td><td>Проверьте имя функции (регистр и опечатки).</td></tr>' +
          '<tr><td>&#39;end&#39; expected</td><td>Не закрыт <code>if</code>/<code>for</code>/<code>function</code></td><td>Парность <code>end</code> — частая ошибка. Используйте автоотступ.</td></tr>' +
          '<tr><td>Превышен лимит выполнения</td><td>Бесконечный цикл</td><td>Убедитесь, что условие цикла рано или поздно станет ложным.</td></tr></table>'
      }
    ]
  },
  {
    id: 'stdlib', title: 'Стандартная библиотека', icon: '📚',
    articles: [
      {
        id: 'base', title: 'Базовые функции',
        body: '<table class="api-table"><tr><th>Функция</th><th>Описание</th></tr>' +
          '<tr><td><code>print(...)</code></td><td>Вывод в консоль.</td></tr>' +
          '<tr><td><code>type(v)</code></td><td>Тип значения: "nil", "boolean", "number", "string", "function", "table".</td></tr>' +
          '<tr><td><code>tonumber(v)</code></td><td>Преобразует строку в число (или nil).</td></tr>' +
          '<tr><td><code>tostring(v)</code></td><td>Преобразует значение в строку.</td></tr>' +
          '<tr><td><code>ipairs(t)</code></td><td>Перебор массива по порядку 1,2,3…</td></tr>' +
          '<tr><td><code>pairs(t)</code></td><td>Перебор всех пар ключ-значение.</td></tr>' +
          '<tr><td><code>#t</code></td><td>Длина массива (число элементов).</td></tr>' +
          '<tr><td><code>math.min(a,b)</code> / <code>math.max(a,b)</code></td><td>Минимум / максимум.</td></tr>' +
          '<tr><td><code>pcall(f, ...)</code></td><td>Вызов функции с перехватом ошибок.</td></tr></table>'
      },
      {
        id: 'math', title: 'math',
        body: '<table class="api-table"><tr><th>Функция</th><th>Описание</th></tr>' +
          '<tr><td><code>math.abs(x)</code></td><td>Модуль числа.</td></tr>' +
          '<tr><td><code>math.floor(x)</code> / <code>math.ceil(x)</code></td><td>Округление вниз / вверх.</td></tr>' +
          '<tr><td><code>math.round(x)</code> → <code>math.floor(x + 0.5)</code></td><td>Округление к ближайшему (готовой math.round нет).</td></tr>' +
          '<tr><td><code>math.min / math.max</code></td><td>Минимум / максимум из аргументов.</td></tr>' +
          '<tr><td><code>math.sqrt(x)</code></td><td>Квадратный корень.</td></tr>' +
          '<tr><td><code>math.sin(x)</code> / <code>math.cos(x)</code> / <code>math.tan(x)</code></td><td>Тригонометрия (радианы).</td></tr>' +
          '<tr><td><code>math.atan(y, x)</code></td><td>Арктангенс с учётом четверти — угол направления.</td></tr>' +
          '<tr><td><code>math.rad(deg)</code> / <code>math.deg(rad)</code></td><td>Градусы ↔ радианы.</td></tr>' +
          '<tr><td><code>math.random()</code></td><td>Случайное число 0…1.</td></tr>' +
          '<tr><td><code>math.random(m)</code></td><td>Целое 1…m.</td></tr>' +
          '<tr><td><code>math.random(m, n)</code></td><td>Целое m…n.</td></tr>' +
          '<tr><td><code>math.pi</code></td><td>Число π ≈ 3.14159.</td></tr></table>' +
          '<div class="callout">Число π также удобно получить как <code>math.pi</code>, а половину оборота — <code>math.pi</code> (180°).</div>'
      },
      {
        id: 'string', title: 'string',
        body: '<table class="api-table"><tr><th>Функция</th><th>Описание</th></tr>' +
          '<tr><td><code>string.format(fmt, ...)</code></td><td>Форматирование. <code>%d</code> — целое, <code>%.2f</code> — 2 знака после запятой, <code>%s</code> — строка, <code>%x</code> — hex.</td></tr>' +
          '<tr><td><code>string.sub(s, i, j)</code></td><td>Подстрока с i по j (индексы с 1).</td></tr>' +
          '<tr><td><code>string.len(s)</code> / <code>#s</code></td><td>Длина строки.</td></tr>' +
          '<tr><td><code>string.upper(s)</code> / <code>string.lower(s)</code></td><td>Верхний / нижний регистр.</td></tr>' +
          '<tr><td><code>string.find(s, pattern)</code></td><td>Поиск подстроки/шаблона.</td></tr>' +
          '<tr><td><code>string.gsub(s, pat, repl)</code></td><td>Замена по шаблону.</td></tr>' +
          '<tr><td><code>..</code></td><td>Конкатенация (склейка) строк: <code>"a".."b"</code>.</td></tr></table>' +
          '<p>Пример: <code>string.format("Скорость: %.1f км/ч", v)</code></p>'
      },
      {
        id: 'table', title: 'table',
        body: '<table class="api-table"><tr><th>Функция</th><th>Описание</th></tr>' +
          '<tr><td><code>table.insert(t, v)</code></td><td>Добавляет значение в конец массива.</td></tr>' +
          '<tr><td><code>table.insert(t, i, v)</code></td><td>Вставляет значение на позицию i.</td></tr>' +
          '<tr><td><code>table.remove(t, i)</code></td><td>Удаляет элемент с позиции i (по умолчанию последний).</td></tr>' +
          '<tr><td><code>table.concat(t, sep)</code></td><td>Склеивает элементы массива в строку.</td></tr>' +
          '<tr><td><code>table.sort(t, cmp)</code></td><td>Сортирует массив.</td></tr>' +
          '<tr><td><code>#t</code></td><td>Количество элементов в массиве.</td></tr></table>'
      }
    ]
  },
  {
    id: 'mp', title: 'Мультиплеер и оптимизация', icon: '🎮',
    articles: [
      {
        id: 'multiplayer', title: 'Особенности многопользовательской игры',
        body: '<p>Скрипты исполняются <b>у каждого игрока на его компьютере</b>. Синхронизируются только логические входы и выходы (они считаются на сервере).</p>' +
          '<ul><li>Механизмы могут быть синхронны, а картинка на мониторе — разной у разных игроков.</li>' +
          '<li>Случайные числа (<code>math.random</code>) приводят к рассинхрону — используйте осторожно.</li>' +
          '<li>При пересоздании транспорта скрипт запускается заново и теряет своё состояние. Для сохранения значений используйте логические «регистры памяти».</li></ul>'
      },
      {
        id: 'perf', title: 'Производительность',
        body: '<p>Лимит выполнения скрипта — 1000 мс, но тяжёлый код тормозит игру. Правила:</p>' +
          '<ul><li>Не делайте тяжёлых вычислений в <code>onDraw()</code> — считайте в <code>onTick()</code>, а рисуйте готовое.</li>' +
          '<li>Избегайте создания больших таблиц каждый тик.</li>' +
          '<li>Не вызывайте <code>print</code> каждый тик «на всякий случай» — это тоже нагрузка.</li></ul>'
      },
      {
        id: 'savedata', title: 'Сохранение данных (g_savedata)',
        body: '<p>В «миссионном» Lua таблица <code>g_savedata</code> сохраняется между запусками (в файл <code>lua_data.xml</code>). Для обычного Lua-скрипта транспорта это не работает — там состояние не сохраняется.</p>' +
          '<pre class="code">-- работает только в серверном/миссионном Lua\nfunction onTick()\n    g_savedata.launches = (g_savedata.launches or 0) + 1\nend</pre>'
      }
    ]
  }
];
