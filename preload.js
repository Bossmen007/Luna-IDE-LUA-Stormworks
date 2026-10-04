/*
 * Мост между интерфейсом и Electron: кнопки управления окном.
 * В обычном браузере этого объекта нет — кнопки просто не показываются.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lunaDesktop', {
  isDesktop: true,
  minimize: function () { ipcRenderer.send('win:minimize'); },
  toggleMaximize: function () { ipcRenderer.send('win:toggle-maximize'); },
  close: function () { ipcRenderer.send('win:close'); },
  about: function () { ipcRenderer.send('win:about'); },
  onMaximized: function (cb) { ipcRenderer.on('win:maximized', function (e, v) { cb(!!v); }); }
});
