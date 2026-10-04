/*
 * Луна IDE — коллекция готовых примеров Lua для Stormworks (на русском).
 * Формат: window.LUNA_EXAMPLES = [{ id, title, tags:[], desc, code }]
 */
window.LUNA_EXAMPLES = [
  {
    id: 'blink', title: 'Мигалка', tags: ['основы', 'onTick'],
    desc: 'Раз в секунду переключает логический выход 1. Базовый пример работы с состоянием и таймером тиков.',
    code: `-- Мигалка: переключаем выход раз в секунду
local ticks = 0
local state = false

function onTick()
    ticks = ticks + 1
    if ticks >= 60 then      -- 60 тиков ≈ 1 секунда
        ticks = 0
        state = not state
    end
    output.setBool(1, state)
end`
  },
  {
    id: 'button', title: 'Кнопка на мониторе', tags: ['экран', 'касание'],
    desc: 'Сенсорная кнопка в центре экрана. Удерживается, пока игрок жмёт Q (или E) над кнопкой.',
    code: `-- Кнопка на сенсорном экране (нажатие — Q/E над кнопкой)
local btn = { x = 0, y = 0, w = 120, h = 50 }
local pressed = false

local function inBox(px, py, x, y, w, h)
    return px >= x and px <= x + w and py >= y and py <= y + h
end

function onTick()
    local w, h = input.getNumber(1), input.getNumber(2)  -- размеры монитора
    local x1, y1 = input.getNumber(3), input.getNumber(4) -- координаты нажатия
    local click = input.getBool(1)

    btn.x = (w - btn.w) / 2
    btn.y = (h - btn.h) / 2

    pressed = click and inBox(x1, y1, btn.x, btn.y, btn.w, btn.h)
    output.setBool(1, pressed)
end

function onDraw()
    screen.drawClear(20, 20, 30, 255)
    if pressed then
        screen.setColor(60, 200, 80)
    else
        screen.setColor(90, 90, 110)
    end
    screen.drawRectF(btn.x, btn.y, btn.w, btn.h)
    screen.setColor(255, 255, 255)
    screen.drawTextBox(btn.x, btn.y, btn.w, btn.h, "PRESS", 0, 0)
end`
  },
  {
    id: 'toggle', title: 'Переключатель (toggle)', tags: ['экран', 'касание'],
    desc: 'Кнопка-фиксатор: каждое нажатие переключает состояние вкл/выкл. Учимся ловить момент нажатия.',
    code: `-- Переключатель: каждое нажатие меняет состояние
local state = false
local wasPressed = false
local btn = { x = 40, y = 60, w = 140, h = 50 }

local function inBox(px, py, x, y, w, h)
    return px >= x and px <= x + w and py >= y and py <= y + h
end

function onTick()
    local x1, y1 = input.getNumber(3), input.getNumber(4)
    local pressed = input.getBool(1)

    -- важно: реагируем на ПЕРЕХОД от «не нажато» к «нажато»
    if pressed and not wasPressed then
        if inBox(x1, y1, btn.x, btn.y, btn.w, btn.h) then
            state = not state
        end
    end
    wasPressed = pressed
    output.setBool(1, state)
end

function onDraw()
    screen.drawClear(24, 24, 32, 255)
    if state then screen.setColor(60, 170, 90) else screen.setColor(80, 80, 95) end
    screen.drawRectF(btn.x, btn.y, btn.w, btn.h)
    screen.setColor(255, 255, 255)
    screen.drawTextBox(btn.x, btn.y, btn.w, btn.h,
        state and "ON" or "OFF", 0, 0)
end`
  },
  {
    id: 'altimeter', title: 'Альтиметр (стрелочный)', tags: ['экран', 'прибор'],
    desc: 'Круговая шкала со стрелкой. Высота приходит на канал 1 (0…1000 м). Демонстрирует вращение точки вокруг центра.',
    code: `-- Альтиметр: стрелка от 0 до 1000 м
local altitude = 0

function onTick()
    altitude = input.getNumber(1)   -- высота в метрах
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    local cx, cy = w / 2, h / 2
    local r = math.min(w, h) / 2 - 10

    screen.drawClear(10, 12, 16, 255)

    -- циферблат
    screen.setColor(70, 80, 90)
    screen.drawCircle(cx, cy, r)
    screen.drawCircle(cx, cy, r - 2)

    -- угол стрелки: 0 м -> верх, 1000 м -> полный оборот
    local a = (altitude / 1000) * math.pi * 2 - math.pi / 2
    screen.setColor(235, 70, 70)
    screen.drawLine(cx, cy, cx + math.cos(a) * r * 0.92, cy + math.sin(a) * r * 0.92)

    screen.setColor(255, 255, 255)
    screen.drawTextBox(0, h - 14, w, 12, string.format("%.0f m", altitude), 0, -1)
end`
  },
  {
    id: 'speed', title: 'Спидометр с дугой', tags: ['экран', 'прибор'],
    desc: 'Скорость на канале 1 (м/с). Показывает стрелку и числовое значение в км/ч.',
    code: `-- Спидометр: скорость на канале 1 (м/с)
local speed = 0
local MAX = 60   -- максимальная шкала, м/с

function onTick()
    speed = math.max(0, input.getNumber(1))
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    local cx, cy = w / 2, h * 0.7
    local r = math.min(w, h) * 0.5

    screen.drawClear(12, 12, 18, 255)

    -- шкала: линия по дуге
    for m = 0, MAX, 5 do
        local a = math.pi + (m / MAX) * math.pi   -- от 180° до 360°
        local x1 = cx + math.cos(a) * (r - 6)
        local y1 = cy + math.sin(a) * (r - 6)
        local x2 = cx + math.cos(a) * r
        local y2 = cy + math.sin(a) * r
        screen.setColor(90, 90, 105)
        screen.drawLine(x1, y1, x2, y2)
    end

    local a = math.pi + math.min(speed, MAX) / MAX * math.pi
    screen.setColor(80, 200, 255)
    screen.drawLine(cx, cy, cx + math.cos(a) * (r - 4), cy + math.sin(a) * (r - 4))

    screen.setColor(255, 255, 255)
    screen.drawTextBox(0, 2, w, 12,
        string.format("%.0f km/h", speed * 3.6), 0, -1)
end`
  },
  {
    id: 'compass', title: 'Компас', tags: ['экран', 'прибор'],
    desc: 'Показывает направление (канал 1, градусы 0…360) с буквами С/В/Ю/З и меткой курса.',
    code: `-- Компас: курс в градусах на канале 1
local heading = 0

function onTick()
    heading = input.getNumber(1) % 360
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    local cx, cy = w / 2, h / 2
    local r = math.min(w, h) / 2 - 12

    screen.drawClear(10, 14, 12, 255)
    screen.setColor(60, 120, 80)
    screen.drawCircle(cx, cy, r)

    -- метки: С(0), В(90), Ю(180), З(270)
    local names = { [0] = "N", [90] = "E", [180] = "S", [270] = "W" }
    for dir = 0, 270, 90 do
        local a = math.rad(dir - 90)
        local x = cx + math.cos(a) * (r - 10)
        local y = cy + math.sin(a) * (r - 10)
        screen.setColor(255, 255, 255)
        screen.drawTextBox(x - 8, y - 4, 16, 10, names[dir], 0, 0)
    end

    -- стрелка курса
    local a = math.rad(heading - 90)
    screen.setColor(230, 60, 60)
    screen.drawLine(cx, cy, cx + math.cos(a) * (r - 4), cy + math.sin(a) * (r - 4))

    screen.setColor(255, 255, 255)
    screen.drawTextBox(0, h - 14, w, 12, string.format("%.0f deg", heading), 0, -1)
end`
  },
  {
    id: 'bar', title: 'Индикатор уровня (полоса)', tags: ['экран', 'hud'],
    desc: 'Горизонтальная полоса заполнения — удобно для топлива, заряда, температуры. Значение на канале 1 (0…1).',
    code: `-- Индикатор уровня: значение 0..1 на канале 1
local level = 0

function onTick()
    level = math.min(1, math.max(0, input.getNumber(1)))
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    local m = 20
    local bw, bh = w - m * 2, 24
    local bx, by = m, h / 2 - bh / 2

    screen.drawClear(18, 18, 24, 255)

    -- рамка
    screen.setColor(120, 120, 130)
    screen.drawRect(bx, by, bw, bh)

    -- заполнение
    local fill = (bw - 4) * level
    if level > 0.5 then screen.setColor(80, 200, 90)
    elseif level > 0.2 then screen.setColor(230, 190, 60)
    else screen.setColor(220, 70, 70) end
    screen.drawRectF(bx + 2, by + 2, fill, bh - 4)

    screen.setColor(255, 255, 255)
    screen.drawTextBox(bx, by, bw, bh, string.format("%d%%", math.floor(level * 100 + 0.5)), 0, 0)
end`
  },
  {
    id: 'map', title: 'Карта мира', tags: ['экран', 'карта'],
    desc: 'Рисует карту в координатах X/Y (каналы 1 и 2) с зумом. Поверх карты — прицел в центре.',
    code: `-- Карта: центр в X/Y (каналы 1,2), зум задаётся свойством или клавишами
local mx, my = 0, 0
local zoom = 4

function onTick()
    mx = input.getNumber(1)
    my = input.getNumber(2)
    -- приближаем/удаляем кнопками Q и E
    if input.getBool(1) then zoom = math.max(0.5, zoom - 0.1) end
    if input.getBool(2) then zoom = math.min(50, zoom + 0.1) end
end

function onDraw()
    screen.drawClear(10, 10, 14, 255)
    screen.drawMap(mx, my, zoom)

    -- прицел в центре
    local w, h = screen.getWidth(), screen.getHeight()
    screen.setColor(255, 60, 60)
    screen.drawLine(w / 2 - 8, h / 2, w / 2 + 8, h / 2)
    screen.drawLine(w / 2, h / 2 - 8, w / 2, h / 2 + 8)
end`
  },
  {
    id: 'random', title: 'Генератор случайных чисел', tags: ['math', 'график'],
    desc: 'Рисует распределение случайных чисел. Показывает, что math.random равномерна. Клик — новая серия.',
    code: `-- Распределение math.random: чем больше бросков, тем ровнее
local results = { 0, 0, 0, 0 }
local MAX = 4
local counter = 0

function onTick()
    counter = counter + 1
    local r = math.random(MAX)
    results[r] = results[r] + 1
    output.setNumber(1, results[r])
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    screen.drawClear(16, 16, 22, 255)

    -- нормируем по максимуму
    local mx = 1
    for i = 1, MAX do if results[i] > mx then mx = results[i] end end

    local bw = w / MAX
    for i = 1, MAX do
        local frac = results[i] / mx
        local bh = frac * (h - 20)
        screen.setColor(40 + i * 40, 200 - i * 30, 120)
        screen.drawRectF((i - 1) * bw + 2, h - bh, bw - 4, bh)
    end

    screen.setColor(255, 255, 255)
    screen.drawTextBox(0, 2, w, 14, "random(1..4) distribution", 0, -1)
end`
  },
  {
    id: 'timer', title: 'Секундомер', tags: ['отладка', 'время'],
    desc: 'Считает прошедшее время. Учимся измерять производительность и вести отсчёт.',
    code: `-- Секундомер: считаем тики и секунды
local ticks = 0
local running = true

function onTick()
    if input.getBool(1) then running = not running end   -- пауза/пуск по каналу 1
    if running then ticks = ticks + 1 end
    output.setNumber(1, ticks / 60)   -- секунды
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    screen.drawClear(12, 12, 12, 255)
    screen.setColor(80, 220, 120)
    screen.drawTextBox(0, 0, w, h,
        string.format("%.1f s", ticks / 60), 0, 0)
end`
  },
  {
    id: 'hud', title: 'Текстовый HUD', tags: ['экран', 'hud'],
    desc: 'Панель с несколькими показателями: скорость, высота, заряд. Удобная заготовка приборной панели.',
    code: `-- HUD: несколько показателей на одном экране
local v, alt, bat = 0, 0, 0

function onTick()
    v = input.getNumber(1)      -- скорость, м/с
    alt = input.getNumber(2)    -- высота, м
    bat = input.getNumber(3)    -- заряд, %
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    screen.drawClear(8, 12, 18, 255)

    -- заголовок
    screen.setColor(0, 180, 255)
    screen.drawRectF(0, 0, w, 14)
    screen.setColor(0, 0, 0)
    screen.drawTextBox(0, 0, w, 14, "DASHBOARD", 0, 0)

    local y = 22
    local items = {
        { "Speed",    string.format("%.1f km/h", v * 3.6) },
        { "Altitude", string.format("%.0f m", alt) },
        { "Charge",   string.format("%.0f %%", bat) },
    }
    for i, it in ipairs(items) do
        screen.setColor(180, 200, 220)
        screen.drawText(8, y, it[1])
        screen.setColor(255, 255, 255)
        screen.drawText(w - 70, y, it[2])
        y = y + 16
    end
end`
  },
  {
    id: 'pid', title: 'ПИД-регулятор (упрощённый)', tags: ['автоматика'],
    desc: 'Пропорционально-интегрально-дифференциальный регулятор стабилизации. Основа автопилотов и термостатов.',
    code: `-- Упрощённый ПИД-регулятор
-- Цель — установить выход так, чтобы input[2] стремился к input[1]
local Kp, Ki, Kd = 1.0, 0.05, 0.2

local integral, prevError = 0, 0

function onTick()
    local target = input.getNumber(1)     -- желаемое значение
    local current = input.getNumber(2)    -- текущее значение

    local error = target - current
    integral = integral + error
    local derivative = error - prevError
    prevError = error

    local u = Kp * error + Ki * integral + Kd * derivative
    u = math.max(-1, math.min(1, u))      -- ограничиваем -1..1
    output.setNumber(1, u)
end`
  },
  {
    id: 'rotate', title: 'Вращение вокруг точки', tags: ['тригонометрия'],
    desc: 'Ключевой приём для приборов: поворот координат. Вращает спутник вокруг центра экрана.',
    code: `-- Вращение точки вокруг центра — основа стрелочных приборов
local angle = 0

-- повернуть точку (x,y) вокруг (cx,cy) на угол angle
local function rotatePoint(cx, cy, x, y, angle)
    local s, c = math.sin(angle), math.cos(angle)
    local dx, dy = x - cx, y - cy
    return cx + dx * c - dy * s, cy + dx * s + dy * c
end

function onTick()
    angle = angle + 0.02
end

function onDraw()
    local w, h = screen.getWidth(), screen.getHeight()
    local cx, cy = h / 2, h / 2
    screen.drawClear(14, 14, 20, 255)

    -- центр
    screen.setColor(120, 120, 130)
    screen.drawCircle(cx, cy, 3)

    -- «спутник» на расстоянии 70 px
    local x, y = rotatePoint(cx, cy, cx + 70, cy, angle)
    screen.setColor(80, 200, 255)
    screen.drawCircleF(x, y, 6)
    screen.drawLine(cx, cy, x, y)
end`
  }
];
