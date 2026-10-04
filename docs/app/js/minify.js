/*
 * Луна IDE — минификатор Lua.
 * Безопасно удаляет комментарии и лишние пробелы, не меняя смысл программы.
 * Подход: токенизация -> склейка токенов с пробелом только там, где он нужен.
 */
(function (global) {
  'use strict';

  function isSpace(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'; }
  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isAlpha(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
  function isAlnum(c) { return isAlpha(c) || isDigit(c); }

  // Возвращает {end} если на позиции i находится длинная скобка [[ ... ]] / [=[ ... ]=]
  function matchLongBracket(s, i) {
    if (s[i] !== '[') return null;
    var j = i + 1, level = 0;
    while (s[j] === '=') { level++; j++; }
    if (s[j] !== '[') return null;
    j++;
    var close = ']' + new Array(level + 1).join('=') + ']';
    var idx = s.indexOf(close, j);
    if (idx === -1) return null;
    return { end: idx + close.length };
  }

  function tokenize(src) {
    var t = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (isSpace(c)) { i++; continue; }

      // комментарии
      if (c === '-' && src[i + 1] === '-') {
        i += 2;
        var m = matchLongBracket(src, i);
        if (m) { i = m.end; continue; }
        while (i < n && src[i] !== '\n') i++;
        continue;
      }

      // длинные строки
      if (c === '[') {
        var m2 = matchLongBracket(src, i);
        if (m2) { t.push({ type: 'string', text: src.slice(i, m2.end) }); i = m2.end; continue; }
      }

      // обычные строки
      if (c === '"' || c === "'") {
        var j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === c) { j++; break; }
          if (src[j] === '\n') { break; }
          j++;
        }
        t.push({ type: 'string', text: src.slice(i, j) });
        i = j; continue;
      }

      // числа
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        var k = i;
        if (c === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
          k = i + 2;
          while (k < n && /[0-9a-fA-F.]/.test(src[k])) k++;
          if (src[k] === 'p' || src[k] === 'P') { k++; if (src[k] === '+' || src[k] === '-') k++; while (k < n && isDigit(src[k])) k++; }
        } else {
          while (k < n && (isDigit(src[k]) || src[k] === '.')) k++;
          if (src[k] === 'e' || src[k] === 'E') { k++; if (src[k] === '+' || src[k] === '-') k++; while (k < n && isDigit(src[k])) k++; }
        }
        t.push({ type: 'number', text: src.slice(i, k) });
        i = k; continue;
      }

      // имена/ключевые слова
      if (isAlpha(c)) {
        var p = i;
        while (p < n && isAlnum(src[p])) p++;
        t.push({ type: 'name', text: src.slice(i, p) });
        i = p; continue;
      }

      // операторы
      var three = src.substr(i, 3), two = src.substr(i, 2);
      if (three === '...') { t.push({ type: 'op', text: three }); i += 3; continue; }
      if (two === '==' || two === '~=' || two === '<=' || two === '>=' || two === '//' ||
          two === '::' || two === '..' || two === '<<' || two === '>>') {
        t.push({ type: 'op', text: two }); i += 2; continue;
      }
      t.push({ type: 'op', text: c }); i++;
    }
    return t;
  }

  function isWord(tok) { return tok.type === 'name' || tok.type === 'number'; }

  function needSpace(a, b) {
    if (isWord(a) && isWord(b)) return true;                 // local x, return 1
    var ea = a.text.charAt(a.text.length - 1), sb = b.text.charAt(0);
    if (ea === '-' && sb === '-') return true;               // -- (комментарий)
    if ((ea === '[' || ea === '=') && (sb === '[' || sb === '=')) return true; // [[ или [=[
    if (ea === '/' && sb === '/') return true;               // //
    if (ea === ':' && sb === ':') return true;               // ::
    if ((ea === '<' && sb === '<') || (ea === '>' && sb === '>')) return true;
    if (ea === '.' && sb === '.') return true;               // .. не должно склеиваться из . .
    if (isWord(a) && b.type === 'string') return false;      // f"str" допустимо
    return false;
  }

  /**
   * Минифицирует код Lua.
   * @param {string} code
   * @param {{keepShebang?:boolean}} [opts]
   * @returns {{code:string, originalLength:number, minifiedLength:number, ratio:number}}
   */
  function minify(code, opts) {
    opts = opts || {};
    var original = code.length;
    var tokens = tokenize(code);
    var out = '';
    for (var i = 0; i < tokens.length; i++) {
      if (i > 0 && needSpace(tokens[i - 1], tokens[i])) out += ' ';
      out += tokens[i].text;
    }
    var minified = out.length;
    return {
      code: out,
      originalLength: original,
      minifiedLength: minified,
      ratio: original > 0 ? (1 - minified / original) : 0
    };
  }

  global.LuaMinify = { minify: minify, tokenize: tokenize };
})(window);
