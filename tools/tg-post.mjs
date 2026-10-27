/*
 * Публикация постов в Telegram-канал Луна IDE через Bot API.
 *
 * Токен берётся из переменной окружения TG_BOT_TOKEN или из файла
 * (по умолчанию %LOCALAPPDATA%\Temp\agenthere\telegram-token.txt).
 * В коде токена нет, в консоль он не печатается.
 *
 * Канал: переменная TG_CHAT (по умолчанию @luna_ide).
 *
 * Команды:
 *   node tools/tg-post.mjs check                      проверить бота и права в канале
 *   node tools/tg-post.mjs send "текст поста"          отправить текст
 *   node tools/tg-post.mjs send --file post.md         отправить текст из файла
 *   node tools/tg-post.mjs send --photo shot.png "подпись"
 *   node tools/tg-post.mjs send --pin "текст"          отправить и закрепить
 *   node tools/tg-post.mjs edit 123 "новый текст"      изменить сообщение
 *   node tools/tg-post.mjs delete 123                  удалить сообщение
 *
 * Флаги: --chat @канал  --photo путь|url  --file путь  --pin  --silent  --html  --dry
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const CHAT = process.env.TG_CHAT || '@luna_ide';

function readToken() {
  if (process.env.TG_BOT_TOKEN) return process.env.TG_BOT_TOKEN.trim();
  const candidates = [
    process.env.TG_BOT_TOKEN_FILE,
    path.join(process.env.LOCALAPPDATA || os.homedir(), 'Temp', 'agenthere', 'telegram-token.txt'),
    path.join(os.homedir(), '.agenthere', 'telegram-token.txt')
  ].filter(Boolean);
  for (const f of candidates) if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  console.error('Не найден токен бота.\nСохраните его в файл: ' +
    path.join(process.env.LOCALAPPDATA || os.homedir(), 'Temp', 'agenthere', 'telegram-token.txt') +
    '\nили задайте переменную окружения TG_BOT_TOKEN.');
  process.exit(1);
}

const TOKEN = readToken();
const API = 'https://api.telegram.org/bot' + TOKEN + '/';

async function call(method, payload, isForm) {
  const url = API + method;
  const init = isForm
    ? { method: 'POST', body: payload }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { ok: false, description: text }; }
  if (!data || !data.ok) {
    const msg = data && data.description ? data.description : text;
    const err = new Error(method + ': ' + msg);
    err.code = data && data.error_code;
    throw err;
  }
  return data.result;
}

// ---------------- разбор аргументов ----------------
function parseArgs(argv) {
  const out = { pos: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out.pos.push(a); continue; }
    const name = a.slice(2);
    if (['pin', 'silent', 'html', 'dry'].includes(name)) { out.flags[name] = true; continue; }
    out.flags[name] = argv[++i];
  }
  return out;
}

function readText(flags, pos) {
  if (flags.file) {
    const f = path.resolve(flags.file);
    if (!fs.existsSync(f)) { console.error('нет файла ' + f); process.exit(1); }
    return fs.readFileSync(f, 'utf8').trim();
  }
  return pos.join(' ').trim();
}

// ---------------- команды ----------------
async function cmdInfo() {
  const me = await call('getMe', {});
  const chat = await call('getChat', { chat_id: CHAT });
  const link = chat.username ? 'https://t.me/' + chat.username : (chat.invite_link || '—');

  console.log('КАНАЛ');
  console.log('  название:   ' + (chat.title || '—'));
  console.log('  username:   ' + (chat.username ? '@' + chat.username : '— (приватный)'));
  console.log('  id:         ' + chat.id);
  console.log('  тип:        ' + chat.type);
  console.log('  ссылка:     ' + link);
  if (chat.invite_link) console.log('  приглашение: ' + chat.invite_link);
  console.log('  описание:   ' + (chat.description || '— не задано'));

  try {
    const count = await call('getChatMemberCount', { chat_id: CHAT });
    console.log('  участников: ' + count);
  } catch (e) { console.log('  участников: не удалось узнать (' + e.message + ')'); }

  const pm = chat.pinned_message;
  if (pm) {
    const txt = (pm.text || pm.caption || '').replace(/\s+/g, ' ').slice(0, 70);
    console.log('  закреплено: сообщение ' + pm.message_id + ' — ' + txt + (txt ? '…' : ''));
  } else {
    console.log('  закреплено: нет');
  }

  console.log('');
  console.log('БОТ');
  console.log('  имя:        ' + me.first_name);
  console.log('  username:   @' + me.username);
  console.log('  id:         ' + me.id);
  const member = await call('getChatMember', { chat_id: CHAT, user_id: me.id });
  console.log('  статус:     ' + member.status);
  const rights = ['can_post_messages', 'can_edit_messages', 'can_delete_messages',
    'can_pin_messages', 'can_invite_users', 'can_manage_chat', 'can_change_info']
    .filter((r) => member[r]);
  console.log('  права:      ' + (rights.length ? rights.map((r) => r.replace(/^can_/, '')).join(', ') : '—'));
  console.log('');
  console.log('Публиковать можно: ' + (member.can_post_messages ? 'да' : 'НЕТ (нужно право «Публикация сообщений»)'));
}

async function cmdCheck() {
  const me = await call('getMe', {});
  console.log('бот: @' + me.username + '  (' + me.first_name + ', id ' + me.id + ')');

  const chat = await call('getChat', { chat_id: CHAT });
  console.log('канал: ' + (chat.title || chat.username) + '  @' + (chat.username || '—') +
    '  (id ' + chat.id + ', тип ' + chat.type + ')');

  try {
    const member = await call('getChatMember', { chat_id: CHAT, user_id: me.id });
    const rights = member.status === 'administrator' ? Object.keys(member).filter((k) =>
      k.startsWith('can_') && member[k]) : [];
    console.log('статус бота в канале: ' + member.status);
    if (rights.length) console.log('права: ' + rights.map((r) => r.replace(/^can_/, '')).join(', '));
    if (member.status !== 'administrator' && member.status !== 'creator') {
      console.log('ВНИМАНИЕ: бот не админ — публиковать не сможет. Добавьте его админом с правом «Публикация сообщений».');
    } else if (!member.can_post_messages) {
      console.log('ВНИМАНИЕ: у бота нет права «Публикация сообщений».');
    } else {
      console.log('бот может публиковать.');
    }
  } catch (e) {
    console.log('не удалось узнать статус: ' + e.message);
  }
}

async function cmdSend(flags, pos) {
  const text = readText(flags, pos);
  const chat = flags.chat || CHAT;
  if (!text && !flags.photo) { console.error('пустой текст: укажите текст или --file'); process.exit(1); }
  if (flags.dry) { console.log('--dry: ничего не отправляю. Текст:\n' + text); return; }

  const opts = { chat_id: chat };
  if (flags.html) opts.parse_mode = 'HTML';
  if (flags.silent) opts.disable_notification = true;

  let msg;
  if (flags.photo) {
    const src = flags.photo;
    const form = new FormData();
    for (const [k, v] of Object.entries(opts)) form.append(k, String(v));
    if (text) form.append('caption', text);
    if (/^https?:\/\//i.test(src)) {
      form.append('photo', src);
    } else {
      const f = path.resolve(src);
      if (!fs.existsSync(f)) { console.error('нет файла ' + f); process.exit(1); }
      const buf = fs.readFileSync(f);
      form.append('photo', new Blob([buf]), path.basename(f));
    }
    msg = await call('sendPhoto', form, true);
    console.log('отправлено фото с подписью.');
  } else {
    opts.text = text;
    msg = await call('sendMessage', opts);
    console.log('отправлено сообщение.');
  }

  console.log('  id: ' + msg.message_id + '  дата: ' + new Date(msg.date * 1000).toLocaleString('ru-RU'));

  if (flags.pin) {
    await call('pinChatMessage', { chat_id: chat, message_id: msg.message_id, disable_notification: true });
    console.log('  сообщение закреплено.');
  }

  // ссылка — на канал (в приватном канале Telegram сам подставит формат /c/…)
  const uname = (msg.chat && msg.chat.username) || CHAT.replace(/^@/, '');
  const link = 'https://t.me/' + String(uname).replace(/^@/, '') + '/' + msg.message_id;
  console.log('  ссылка: ' + link);
}

async function cmdEdit(flags, pos) {
  const id = Number(pos[0]);
  const text = pos.slice(1).join(' ').trim() || (flags.file ? readText(flags, []) : '');
  if (!id || !text) { console.error('формат: edit <message_id> "текст"'); process.exit(1); }
  if (flags.dry) { console.log('--dry: не меняю.'); return; }
  const opts = { chat_id: flags.chat || CHAT, message_id: id, text };
  if (flags.html) opts.parse_mode = 'HTML';
  const msg = await call('editMessageText', opts);
  console.log('сообщение ' + msg.message_id + ' изменено.');
}

async function cmdDelete(flags, pos) {
  const id = Number(pos[0]);
  if (!id) { console.error('формат: delete <message_id>'); process.exit(1); }
  if (flags.dry) { console.log('--dry: не удаляю.'); return; }
  await call('deleteMessage', { chat_id: flags.chat || CHAT, message_id: id });
  console.log('сообщение ' + id + ' удалено.');
}

const [cmd, ...rest] = process.argv.slice(2);
const { pos, flags } = parseArgs(rest);
try {
  if (cmd === 'check') await cmdCheck();
  else if (cmd === 'info') await cmdInfo();
  else if (cmd === 'send') await cmdSend(flags, pos);
  else if (cmd === 'edit') await cmdEdit(flags, pos);
  else if (cmd === 'delete') await cmdDelete(flags, pos);
  else {
    console.log('Команды: check | send | edit | delete');
    console.log('  node tools/tg-post.mjs check');
    console.log('  node tools/tg-post.mjs send "текст поста"');
    console.log('  node tools/tg-post.mjs send --file post.md --pin');
    console.log('  node tools/tg-post.mjs send --photo shot.png "подпись"');
    console.log('Канал по умолчанию: ' + CHAT + '  (переопределить: --chat @канал или TG_CHAT)');
  }
} catch (e) {
  console.error('ОШИБКА: ' + e.message);
  process.exit(1);
}
