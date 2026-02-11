const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let backendProcess;
let isQuitting = false;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Exiting.');
  app.quit();
}

// Focus existing window if second instance tries to start
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function startBackend() {
  backendProcess = spawn(process.execPath, [path.join(__dirname, '..', 'app/backend/src/index.js')], {
    stdio: 'inherit'
  });

  backendProcess.on('exit', () => {
    if (!isQuitting) {
      setTimeout(startBackend, 1000);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:4000');
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 1500);
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});
