/*
 * Луна IDE — среда выполнения Lua-скриптов для Stormworks в браузере.
 * Эмулирует объекты input/output/property/screen/async и вызывает onTick()/onDraw().
 * Lua исполняется движком Fengari (Lua 5.3, скомпилирован в JavaScript).
 */
(function (global) {
  'use strict';

  var F = global.fengari;
  if (!F) { console.error('Луна IDE: fengari не загружен'); return; }
  var lua = F.lua, lauxlib = F.lauxlib, lualib = F.lualib;
  var to_luastring = F.to_luastring, to_jsstring = F.to_jsstring;

  // ------------------------------------------------------------------
  // Виртуальный монитор (canvas 2D). Реализует методы screen.* из Stormworks.
  // ------------------------------------------------------------------
  function SWScreen(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = { r: 255, g: 255, b: 255, a: 255 };
    this.fontSize = 10;
    this.mapColors = {
      ocean: [28, 52, 84, 255], land: [96, 120, 72, 255], grass: [82, 124, 64, 255],
      sand: [196, 180, 120, 255], rock: [110, 110, 110, 255], snow: [230, 230, 235, 255],
      gravel: [140, 130, 110, 255], shallows: [60, 110, 140, 255]
    };
  }
  SWScreen.prototype.setSize = function (w, h) { this.canvas.width = w; this.canvas.height = h; };
  SWScreen.prototype.getWidth = function () { return this.canvas.width; };
  SWScreen.prototype.getHeight = function () { return this.canvas.height; };
  SWScreen.prototype._rgba = function (r, g, b, a) {
    if (a === undefined) a = 255;
    return 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (a / 255) + ')';
  };
  SWScreen.prototype._c = function () { return this._rgba(this.color.r, this.color.g, this.color.b, this.color.a); };
  SWScreen.prototype.setColor = function (r, g, b, a) {
    this.color = { r: r | 0, g: g | 0, b: b | 0, a: (a === undefined ? 255 : a | 0) };
  };
  SWScreen.prototype.clear = function () { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); };
  SWScreen.prototype.drawClear = function (r, g, b, a) {
    this.ctx.fillStyle = (r === undefined) ? this._c() : this._rgba(r, g, b, a);
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  };
  SWScreen.prototype.drawLine = function (x1, y1, x2, y2) {
    this.ctx.strokeStyle = this._c(); this.ctx.lineWidth = 1;
    this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
  };
  SWScreen.prototype.drawRect = function (x, y, w, h) {
    this.ctx.strokeStyle = this._c(); this.ctx.lineWidth = 1; this.ctx.strokeRect(x, y, w, h);
  };
  SWScreen.prototype.drawRectF = function (x, y, w, h) {
    this.ctx.fillStyle = this._c(); this.ctx.fillRect(x, y, w, h);
  };
  SWScreen.prototype.drawCircle = function (x, y, r) {
    this.ctx.strokeStyle = this._c(); this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.stroke();
  };
  SWScreen.prototype.drawCircleF = function (x, y, r) {
    this.ctx.fillStyle = this._c(); this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2); this.ctx.fill();
  };
  SWScreen.prototype.drawTriangle = function (x1, y1, x2, y2, x3, y3) {
    this.ctx.strokeStyle = this._c(); this.ctx.beginPath();
    this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.lineTo(x3, y3);
    this.ctx.closePath(); this.ctx.stroke();
  };
  SWScreen.prototype.drawTriangleF = function (x1, y1, x2, y2, x3, y3) {
    this.ctx.fillStyle = this._c(); this.ctx.beginPath();
    this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.lineTo(x3, y3);
    this.ctx.closePath(); this.ctx.fill();
  };
  SWScreen.prototype.drawText = function (x, y, text) {
    this.ctx.fillStyle = this._c();
    this.ctx.font = this.fontSize + 'px monospace';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(String(text), x, y);
  };
  SWScreen.prototype.drawTextBox = function (x, y, w, h, text, ha, va) {
    text = String(text);
    this.ctx.fillStyle = this._c();
    this.ctx.font = this.fontSize + 'px monospace';
    this.ctx.textBaseline = 'top';
    var lineH = this.fontSize + 2;
    var words = text.split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var test = cur ? cur + ' ' + words[i] : words[i];
      if (this.ctx.measureText(test).width > w && cur) { lines.push(cur); cur = words[i]; }
      else cur = test;
    }
    lines.push(cur);
    var totalH = lines.length * lineH, startY = y;
    if (va === 0) startY = y + (h - totalH) / 2; else if (va === 1) startY = y + h - totalH;
    for (var j = 0; j < lines.length; j++) {
      var tw = this.ctx.measureText(lines[j]).width, tx = x;
      if (ha === 0) tx = x + (w - tw) / 2; else if (ha === 1) tx = x + w - tw;
      this.ctx.fillText(lines[j], tx, startY + j * lineH);
    }
  };
  SWScreen.prototype._hash = function (x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  SWScreen.prototype.drawMap = function (cx, cy, zoom) {
    var W = this.canvas.width, H = this.canvas.height, z = zoom || 1;
    var oc = this.mapColors.ocean, lc = this.mapColors.land;
    this.ctx.fillStyle = this._rgba(oc[0], oc[1], oc[2], 255);
    this.ctx.fillRect(0, 0, W, H);
    var step = Math.max(4, Math.round(28 / z));
    for (var py = 0; py < H; py += step) {
      for (var px = 0; px < W; px += step) {
        var wx = cx + (px - W / 2) * z, wy = cy + (py - H / 2) * z;
        var n = this._hash(Math.floor(wx / 32), Math.floor(wy / 32));
        if (n > 0.58) { this.ctx.fillStyle = this._rgba(lc[0], lc[1], lc[2], 255); this.ctx.fillRect(px, py, step, step); }
      }
    }
  };
  SWScreen.prototype.setMapColor = function (kind, r, g, b, a) {
    if (this.mapColors[kind]) this.mapColors[kind] = [r | 0, g | 0, b | 0, (a === undefined ? 255 : a | 0)];
  };
  SWScreen.prototype.call = function (method, a) {
    switch (method) {
      case 'setColor': this.setColor(a[0], a[1], a[2], a[3]); return;
      case 'clear': this.clear(); return;
      case 'drawClear': this.drawClear(a[0], a[1], a[2], a[3]); return;
      case 'drawLine': this.drawLine(a[0], a[1], a[2], a[3]); return;
      case 'drawRect': this.drawRect(a[0], a[1], a[2], a[3]); return;
      case 'drawRectF': this.drawRectF(a[0], a[1], a[2], a[3]); return;
      case 'drawCircle': this.drawCircle(a[0], a[1], a[2]); return;
      case 'drawCircleF': this.drawCircleF(a[0], a[1], a[2]); return;
      case 'drawTriangle': this.drawTriangle(a[0], a[1], a[2], a[3], a[4], a[5]); return;
      case 'drawTriangleF': this.drawTriangleF(a[0], a[1], a[2], a[3], a[4], a[5]); return;
      case 'drawText': this.drawText(a[0], a[1], a[2]); return;
      case 'drawTextBox': this.drawTextBox(a[0], a[1], a[2], a[3], a[4], a[5], a[6]); return;
      case 'drawMap': this.drawMap(a[0], a[1], a[2]); return;
      case 'getWidth': return this.getWidth();
      case 'getHeight': return this.getHeight();
      case 'setMapColorOcean': this.setMapColor('ocean', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorLand': this.setMapColor('land', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorGrass': this.setMapColor('grass', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorSand': this.setMapColor('sand', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorRock': this.setMapColor('rock', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorSnow': this.setMapColor('snow', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorGravel': this.setMapColor('gravel', a[0], a[1], a[2], a[3]); return;
      case 'setMapColorShallows': this.setMapColor('shallows', a[0], a[1], a[2], a[3]); return;
      default: return;
    }
  };

  // ------------------------------------------------------------------
  // PRELUDE — Lua-окружение, связывающее скрипт с движком.
  // ------------------------------------------------------------------
  var PRELUDE = [
    'input = {',
    '  getNumber = function(ch) return __sw.getNumber(ch) end,',
    '  getBool   = function(ch) return __sw.getBool(ch) end,',
    '}',
    'output = {',
    '  setNumber = function(ch, v) __sw.setNumber(ch, v) end,',
    '  setBool   = function(ch, v) __sw.setBool(ch, v) end,',
    '}',
    'property = {',
    '  getNumber = function(label) return __sw.getPropNumber(label) end,',
    '  getBool   = function(label) return __sw.getPropBool(label) end,',
    '  getString = function(label) return __sw.getPropString(label) end,',
    '}',
    'screen = setmetatable({}, { __index = function(_, k)',
    '  return function(...) return __sw.screen(k, ...) end',
    'end })',
    'async = {',
    '  httpGet = function(port, url) return __sw.httpGet(port, url) end,',
    '}',
    'if g_savedata == nil then g_savedata = {} end'
  ].join('\n');

  // ------------------------------------------------------------------
  // Runtime — управляет состоянием ВМ и вызовами onTick/onDraw.
  // ------------------------------------------------------------------
  function Runtime(opts) {
    opts = opts || {};
    this.onPrint = opts.onPrint || function () { };
    this.swScreen = opts.screen || null;
    this.maxInstructions = opts.maxInstructions || 20000000;
    this.reset();
    this.L = null;
  }
  Runtime.prototype.reset = function () {
    this.numIn = new Array(33); this.boolIn = new Array(33);
    this.numOut = new Array(33); this.boolOut = new Array(33);
    for (var i = 0; i <= 32; i++) { this.numIn[i] = 0; this.boolIn[i] = false; this.numOut[i] = 0; this.boolOut[i] = false; }
    this.props = {};
    this.tick = 0;
  };
  Runtime.prototype.print = function (text, css) { this.onPrint({ text: String(text), css: css || '' }); };

  Runtime.prototype.compile = function (code) {
    if (this.L) { try { lua.lua_close(this.L); } catch (e) { } this.L = null; }
    var L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    this.L = L;
    var self = this;
    this.hookCounter = 0;
    try {
      lua.lua_sethook(L, function (L) {
        self.hookCounter++;
        if (self.hookCounter * 20000 > self.maxInstructions) {
          lua.lua_pushstring(L, to_luastring('Превышен лимит выполнения: возможно, бесконечный цикл.'));
          lua.lua_error(L);
        }
      }, lua.LUA_MASKCOUNT, 20000);
    } catch (e) { /* hook недоступен — работаем без защиты */ }

    this._register(L);

    // окружение (prelude)
    var st = lauxlib.luaL_loadstring(L, to_luastring(PRELUDE));
    if (st !== lua.LUA_OK) { var m = lua.lua_tojsstring(L, -1) || 'ошибка окружения'; lua.lua_pop(L, 1); return { ok: false, error: m }; }
    this.hookCounter = 0;
    var p = lua.lua_pcall(L, 0, 0, 0);
    if (p !== lua.LUA_OK) { var m2 = lua.lua_tojsstring(L, -1) || 'ошибка окружения'; lua.lua_pop(L, 1); return { ok: false, error: m2 }; }

    // код пользователя
    st = lauxlib.luaL_loadstring(L, to_luastring(code));
    if (st !== lua.LUA_OK) { var m3 = lua.lua_tojsstring(L, -1) || 'Ошибка компиляции'; lua.lua_pop(L, 1); return { ok: false, error: m3 }; }
    return { ok: true };
  };

  Runtime.prototype.runInit = function () {
    if (!this.L) return { ok: false, error: 'Скрипт не скомпилирован' };
    this.hookCounter = 0;
    var p = lua.lua_pcall(this.L, 0, 0, 0);
    if (p !== lua.LUA_OK) { var m = lua.lua_tojsstring(this.L, -1) || 'Ошибка выполнения'; lua.lua_pop(this.L, 1); return { ok: false, error: m }; }
    return { ok: true };
  };

  Runtime.prototype.hasFunction = function (name) {
    var L = this.L; if (!L) return false;
    lua.lua_getglobal(L, to_luastring(name));
    var t = lua.lua_type(L, -1);
    lua.lua_pop(L, 1);
    return t === lua.LUA_TFUNCTION;
  };

  Runtime.prototype.call = function (name) {
    var L = this.L; if (!L) return { ok: true, present: false };
    lua.lua_getglobal(L, to_luastring(name));
    if (lua.lua_type(L, -1) !== lua.LUA_TFUNCTION) { lua.lua_pop(L, 1); return { ok: true, present: false }; }
    this.hookCounter = 0;
    var p = lua.lua_pcall(L, 0, 0, 0);
    if (p !== lua.LUA_OK) { var m = lua.lua_tojsstring(L, -1) || 'Ошибка выполнения'; lua.lua_pop(L, 1); return { ok: false, error: m }; }
    return { ok: true, present: true };
  };

  Runtime.prototype._toStr = function (L, i) {
    var t = lua.lua_type(L, i);
    if (t === lua.LUA_TNIL) return 'nil';
    if (t === lua.LUA_TBOOLEAN) return lua.lua_toboolean(L, i) ? 'true' : 'false';
    if (t === lua.LUA_TNUMBER) return String(lua.lua_tonumber(L, i));
    var s = lua.lua_tojsstring(L, i);
    return (s === null || s === undefined) ? '(таблица/функция)' : s;
  };

  Runtime.prototype._register = function (L) {
    var self = this;

    // таблица-мост __sw
    lua.lua_createtable(L, 0, 0);
    var setfd = function (name, fn) { lua.lua_pushcfunction(L, fn); lua.lua_setfield(L, -2, to_luastring(name)); };

    setfd('getNumber', function (L) { var c = lua.lua_tonumber(L, 1) | 0; lua.lua_pushnumber(L, self.numIn[c] || 0); return 1; });
    setfd('getBool', function (L) { var c = lua.lua_tonumber(L, 1) | 0; lua.lua_pushboolean(L, !!self.boolIn[c]); return 1; });
    setfd('setNumber', function (L) { var c = lua.lua_tonumber(L, 1) | 0; var v = lua.lua_tonumber(L, 2); if (c >= 1 && c <= 32) self.numOut[c] = v; return 0; });
    setfd('setBool', function (L) { var c = lua.lua_tonumber(L, 1) | 0; var v = !!lua.lua_toboolean(L, 2); if (c >= 1 && c <= 32) self.boolOut[c] = v; return 0; });
    setfd('getPropNumber', function (L) { var k = lua.lua_tojsstring(L, 1); var v = self.props[k]; lua.lua_pushnumber(L, v ? (Number(v) || 0) : 0); return 1; });
    setfd('getPropBool', function (L) { var k = lua.lua_tojsstring(L, 1); lua.lua_pushboolean(L, !!(self.props[k])); return 1; });
    setfd('getPropString', function (L) { var k = lua.lua_tojsstring(L, 1); var v = self.props[k]; lua.lua_pushstring(L, to_luastring(v === undefined ? '' : String(v))); return 1; });

    setfd('screen', function (L) {
      var method = lua.lua_tojsstring(L, 1);
      var top = lua.lua_gettop(L), args = [];
      for (var i = 2; i <= top; i++) {
        var t = lua.lua_type(L, i);
        if (t === lua.LUA_TNUMBER) args.push(lua.lua_tonumber(L, i));
        else if (t === lua.LUA_TBOOLEAN) args.push(!!lua.lua_toboolean(L, i));
        else if (t === lua.LUA_TSTRING) args.push(lua.lua_tojsstring(L, i));
        else args.push(null);
      }
      if (!self.swScreen) return 0;
      var res = self.swScreen.call(method, args);
      if (res === undefined) return 0;
      if (typeof res === 'number') { lua.lua_pushnumber(L, res); return 1; }
      if (typeof res === 'boolean') { lua.lua_pushboolean(L, res); return 1; }
      if (typeof res === 'string') { lua.lua_pushstring(L, to_luastring(res)); return 1; }
      return 0;
    });

    setfd('httpGet', function (L) {
      var port = lua.lua_tonumber(L, 1), url = lua.lua_tojsstring(L, 2);
      self.print('async.httpGet(' + (port || '') + ', "' + (url || '') + '") — HTTP-запросы доступны только в игре, в браузере пропущены.', 'sw-warn');
      return 0;
    });

    lua.lua_setglobal(L, to_luastring('__sw'));

    // print
    lua.lua_pushcfunction(L, function (L) {
      var n = lua.lua_gettop(L), parts = [];
      for (var i = 1; i <= n; i++) parts.push(self._toStr(L, i));
      self.print(parts.join('  '), '');
      return 0;
    });
    lua.lua_setglobal(L, to_luastring('print'));
  };

  global.SWScreen = SWScreen;
  global.LunaRuntime = Runtime;
})(window);
