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
  onMaximized: function (cb) { ipcRenderer.on('win:maximized', function (e, v) { cb(!!v); }); },
  // автообновление
  updateCheck: function () { ipcRenderer.send('update:check'); },
  updateDownload: function () { ipcRenderer.send('update:download'); },
  updateInstall: function () { ipcRenderer.send('update:install'); },
  updateAuto: function (on) { ipcRenderer.send('update:auto', !!on); },
  updateGet: function () { ipcRenderer.send('update:get'); },
  onUpdateState: function (cb) { ipcRenderer.on('update:state', function (e, st) { cb(st || {}); }); }
});
