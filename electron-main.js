/*
 * Луна IDE — точка входа настольного приложения (Electron).
 * Окно без системной рамки и меню: свой тёмный заголовок со свернуть/развернуть/закрыть.
 */
'use strict';

const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// один экземпляр приложения
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;

function click(id) {
  if (win && !win.isDestroyed()) win.webContents.executeJavaScript("var b=document.getElementById('" + id + "'); if(b) b.click();");
}

function createWindow() {
  const iconPng = path.join(__dirname, 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#0e1015',
    title: 'Луна IDE — редактор Lua для Stormworks',
    icon: fs.existsSync(iconPng) ? iconPng : undefined,
    show: false,
    frame: false,               // без системной рамки и меню
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());

  // всё, что ведёт в интернет — открываем в системном браузере
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });

  // горячие клавиши (меню убрано, поэтому обрабатываем сами)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key;
    const take = () => event.preventDefault();
    if (key === 'F5') { take(); input.shift ? click('btnStop') : click('btnRun'); return; }
    if (key === 'F10') { take(); click('btnStep'); return; }
    if (key === 'F11') { take(); win.setFullScreen(!win.isFullScreen()); return; }
    if (key === 'F12') { take(); win.webContents.toggleDevTools(); return; }
    if (!ctrl) return;
    if (key === 'n' || key === 'N') { take(); click('btnNew'); return; }
    if (key === 's' || key === 'S') { take(); click('btnSave'); return; }
    if (key === 'o' || key === 'O') { take(); click('btnOpen'); return; }
    if (key === 'r' || key === 'R') { take(); win.webContents.reload(); return; }
    if (input.shift && (key === 'i' || key === 'I')) { take(); win.webContents.toggleDevTools(); return; }
  });

  const notifyMax = (v) => { if (!win.isDestroyed()) win.webContents.send('win:maximized', v); };
  win.on('maximize', () => notifyMax(true));
  win.on('unmaximize', () => notifyMax(false));
  win.on('closed', () => { win = null; });
}

function showAbout() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'О программе',
    message: 'Луна IDE',
    detail:
      'Русский редактор Lua для Stormworks: Build and Rescue.\n\n' +
      'Разработчик: СтаричЁк\n' +
      'Версия ' + app.getVersion() + '\n' +
      'Lua 5.3 (Fengari) · CodeMirror 5\n\n' +
      'Работает полностью офлайн.\n' +
      'Неофициальный инструмент, не связанный с разработчиками Stormworks.',
    buttons: ['ОК']
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);   // системного меню нет вообще
  createWindow();
});

// управление окном из интерфейса (кнопки в правом верхнем углу)
ipcMain.on('win:minimize', () => { if (win) win.minimize(); });
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize(); else win.maximize();
});
ipcMain.on('win:close', () => { if (win) win.close(); });
ipcMain.on('win:about', () => showAbout());

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
