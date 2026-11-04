// Desktop shell: runs the local server in-process and shows it in a locked-down window.
// Data lives in %APPDATA%\Vira Villas Rooms\data — never in the install folder.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const { createServer } = require('../app/backend/src/server');
const logger = require('../app/backend/src/lib/logger');
const updater = require('./updater');

const PREFERRED_PORT = 47800;
const PRELOAD = path.join(__dirname, 'preload.js');
const ICON = path.join(__dirname, '..', 'app', 'frontend', 'assets', 'logo.png');
const PAPER = '#f4f0e8';
const GMAIL_COMPOSE = 'https://mail.google.com/mail/?view=cm';

let server = null;
let baseUrl = '';
let mainWindow = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(start).catch(fatal);
}

/** Stable per-installation-of-Windows id, readable without admin rights. */
function readMachineId() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true });
      return out.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)[1];
    }
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      return out.match(/"IOPlatformUUID" = "([^"]+)"/)[1];
    }
    return fs.readFileSync('/etc/machine-id', 'utf8').trim();
  } catch (err) {
    logger.warn('Could not read machine id', { error: err.message });
    return `fallback-${os.hostname()}`;
  }
}

function dataDir() {
  return path.join(app.getPath('userData'), 'data');
}

async function start() {
  logger.configure({ dir: path.join(dataDir(), 'logs') });
  logger.info('Starting', { version: app.getVersion(), dataDir: dataDir() });

  server = createServer({ dataDir: dataDir(), appVersion: app.getVersion(), license: { required: app.isPackaged, machineId: readMachineId() } });
  const listening = await server.listen({ port: PREFERRED_PORT }).catch((err) => {
    if (err.code !== 'EADDRINUSE') throw err;
    logger.warn('Preferred port busy; using a free port', { port: PREFERRED_PORT });
    return server.listen({ port: 0 });
  });
  baseUrl = listening.url;

  lockDownSessions();
  registerIpc();
  Menu.setApplicationMenu(buildMenu());
  mainWindow = createWindow(`${baseUrl}/`, { width: 1360, height: 880, minWidth: 1024, minHeight: 680 });
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function isOwnUrl(url) {
  return url === baseUrl || url.startsWith(`${baseUrl}/`) || url.startsWith(`${baseUrl}?`) || url.startsWith(`${baseUrl}#`);
}

function createWindow(url, size) {
  const win = new BrowserWindow({
    ...size,
    show: false,
    backgroundColor: PAPER,
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });

  // Same-origin pop-ups (print documents) open as app windows; everything else is refused.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!isOwnUrl(target)) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 980, height: 960, backgroundColor: '#e9e5dc', icon: ICON, autoHideMenuBar: true,
        webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false }
      }
    };
  });
  win.webContents.on('will-navigate', (event, target) => {
    if (!isOwnUrl(target)) event.preventDefault();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logger.error('Window crashed', details);
    if (!win.isDestroyed()) win.reload();
  });
  win.loadURL(url);
  return win;
}

function lockDownSessions() {
  // Offline desktop app: no location, notifications or other permissions.
  // Only the camera, and only for our own pages (photographing guest IDs).
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(permission === 'media' && isOwnUrl(details.requestingUrl || wc.getURL()) && !(details.mediaTypes || []).includes('audio'));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission, origin) => permission === 'media' && isOwnUrl(`${origin}/`));
  session.defaultSession.on('will-download', (item) => {
    item.once('done', (_event, state) => logger.info('Download finished', { state, file: path.basename(item.getSavePath() || '') }));
  });
}

function registerIpc() {
  ipcMain.handle('pdf:save', async (event, title) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isOwnUrl(event.sender.getURL())) return { saved: false };
    const safeName = String(title || 'document').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { saved: false };
    const thermal = /^(KOT|Bill) /.test(safeName);
    const pdf = await event.sender.printToPDF({
      printBackground: true,
      pageSize: thermal ? { width: 3.15, height: 11 } : 'A4',
      landscape: /^Guest register/.test(safeName)
    });
    fs.writeFileSync(filePath, pdf);
    shell.showItemInFolder(filePath);
    return { saved: true };
  });
  ipcMain.handle('app:open-data-folder', () => shell.openPath(dataDir()));
  ipcMain.handle('update:check', async () => {
    try {
      return { ok: true, ...(await updater.check(app.getVersion())) };
    } catch (err) {
      logger.warn('Update check failed', { error: err.message });
      return { ok: false, message: err.message };
    }
  });
  ipcMain.handle('update:install', async (event, token) => {
    if (!server.isAdminToken(String(token || ''))) return { ok: false, message: 'Unlock admin to install updates.' };
    if (process.platform !== 'win32') return { ok: false, message: 'Updates install automatically on Windows only.' };
    try {
      const info = await updater.check(app.getVersion());
      if (!info.updateAvailable) return { ok: false, message: 'Already up to date.' };
      if (!info.ready) return { ok: false, message: `Version ${info.latest} is still being prepared. Try again in a few minutes.` };
      const file = await updater.download(info.installer, app.getPath('temp'), {
        onProgress: (percent) => !event.sender.isDestroyed() && event.sender.send('update:progress', percent)
      });
      server.backupNow('before-update');
      logger.info('Installing update', { from: app.getVersion(), to: info.latest });
      updater.runInstaller(file);
      setTimeout(() => app.quit(), 500);
      return { ok: true, installing: info.latest };
    } catch (err) {
      logger.error('Update failed', { error: err.message });
      return { ok: false, message: err.message };
    }
  });
  // Opens Gmail's compose page in the default browser, where the user is signed in.
  ipcMain.handle('app:compose-email', (_event, url) => {
    if (!String(url).startsWith(GMAIL_COMPOSE)) return false;
    shell.openExternal(url);
    return true;
  });
}

function buildMenu() {
  const viewItems = [
    { role: 'reload' }, { type: 'separator' },
    { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }
  ];
  if (!app.isPackaged) viewItems.push({ role: 'toggleDevTools' });
  return Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Open data folder', click: () => shell.openPath(dataDir()) }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: viewItems },
    {
      label: 'Help',
      submenu: [
        { label: 'Open log file', click: () => logger.file && shell.openPath(logger.file) },
        { label: `About (version ${app.getVersion()})`, click: () => dialog.showMessageBox({ message: `Vira Villas Rooms ${app.getVersion()}`, detail: `Data folder:\n${dataDir()}` }) }
      ]
    }
  ]);
}

function fatal(err) {
  logger.error('Startup failed', { error: err.stack || err.message });
  dialog.showErrorBox('Vira Villas Rooms could not start', `${err.message}\n\nDetails were written to:\n${logger.file || dataDir()}`);
  app.exit(1);
}

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
  if (quitting || !server) return;
  event.preventDefault();
  quitting = true;
  server.close().catch((err) => logger.error('Shutdown error', { error: err.message })).finally(() => app.quit());
});
