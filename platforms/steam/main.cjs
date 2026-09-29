/**
 * VERTIGO for Steam: an Electron shell around the game build, with Steamworks in the main
 * process (steamworks.js). The renderer reaches Steam only through the narrow bridge in
 * preload.cjs; it never gets Node or the Steam client object.
 */
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');

const APP_ID = Number(process.env.VERTIGO_STEAM_APP_ID || require('./steam.json').appId);
// Must match STEAM_AUTH_IDENTITY on the server (GetAuthTicketForWebApi identity).
const AUTH_IDENTITY = require('./steam.json').authIdentity;

let steam = null;
let steamworks = null;
try {
  steamworks = require('steamworks.js');
  steam = steamworks.init(APP_ID);
} catch (e) {
  // Not launched through Steam (or no Steam client running): the game still runs; Steam
  // features (achievements, purchases, sign-in) report unavailable.
  console.warn('[steam] unavailable:', e && e.message);
  steam = null;
}

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#07090d',
    title: 'VERTIGO: Above the Fall',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      spellcheck: false,
    },
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  // Alt+Enter / F11 toggle fullscreen, as players expect on PC
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if ((input.key === 'Enter' && input.alt) || input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  // external links open in the browser, never inside the game window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- bridge handlers

ipcMain.handle('steam:available', () => !!steam);
ipcMain.handle('steam:name', () => (steam ? steam.localplayer.getName() : ''));
ipcMain.handle('steam:ticket', async () => {
  if (!steam) throw new Error('steam unavailable');
  // A Web API ticket for the backend to check with ISteamUserAuth/AuthenticateUserTicket.
  const t = steam.auth.getAuthTicketForWebApi ? await steam.auth.getAuthTicketForWebApi(AUTH_IDENTITY) : await steam.auth.getSessionTicketWithSteamId(steam.localplayer.getSteamId().steamId64);
  return Buffer.from(t.getBytes()).toString('hex');
});
ipcMain.handle('steam:achievement', (_e, name) => {
  if (!steam || typeof name !== 'string' || !/^ACH_[A-Z0-9_]+$/.test(name)) return false;
  return steam.achievement.activate(name);
});
ipcMain.handle('steam:language', () => (steam ? steam.apps.currentGameLanguage() : 'english'));
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (_e, on) => {
  if (win && typeof on === 'boolean' && win.isFullScreen() !== on) win.setFullScreen(on);
});

function forwardMicroTxn() {
  if (!steam || !steamworks.SteamCallback || steamworks.SteamCallback.MicroTxnAuthorizationResponse === undefined) {
    console.warn('[steam] MicroTxnAuthorizationResponse callback not available in this steamworks.js build');
    return;
  }
  // The Steam overlay asks the player to authorize an order the server initiated (InitTxn);
  // the answer goes to the renderer, which asks the server to FinalizeTxn.
  steam.callback.register(steamworks.SteamCallback.MicroTxnAuthorizationResponse, (r) => {
    if (win && !win.isDestroyed()) win.webContents.send('steam:microtxn', { orderId: String(r.order_id), authorized: !!r.authorized });
  });
}

if (steamworks && steam) steamworks.electronEnableSteamOverlay();

app.whenReady().then(() => {
  forwardMicroTxn();
  createWindow();
});
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on('window-all-closed', () => app.quit());
