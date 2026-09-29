/**
 * The only thing the game page can see of Steam: `window.vertigoSteam`, matching the
 * SteamBridge interface in src/client/platform/platform.ts.
 */
const { contextBridge, ipcRenderer } = require('electron');

const txnListeners = [];
ipcRenderer.on('steam:microtxn', (_e, m) => {
  for (const cb of txnListeners) cb(m.orderId, m.authorized);
});

contextBridge.exposeInMainWorld('vertigoSteam', {
  available: () => ipcRenderer.invoke('steam:available'),
  playerName: () => ipcRenderer.invoke('steam:name'),
  authTicket: () => ipcRenderer.invoke('steam:ticket'),
  activateAchievement: (name) => ipcRenderer.invoke('steam:achievement', name),
  quit: () => ipcRenderer.send('app:quit'),
  setFullscreen: (on) => ipcRenderer.send('app:fullscreen', !!on),
  onMicroTxnAuthorization: (cb) => {
    if (typeof cb === 'function') txnListeners.push(cb);
  },
  language: () => ipcRenderer.invoke('steam:language'),
});
