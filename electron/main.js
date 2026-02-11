const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow;
let loadingWindow;
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
  console.log('Starting backend server...');
  backendProcess = spawn(process.execPath, [path.join(__dirname, '..', 'app/backend/src/index.js')], {
    stdio: 'inherit'
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    if (!isQuitting) {
      console.log('Restarting backend in 1 second...');
      setTimeout(startBackend, 1000);
    }
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: rgba(255, 255, 255, 0.95);
          border-radius: 12px;
        }
        .container {
          text-align: center;
          padding: 30px;
        }
        .logo {
          font-size: 48px;
          margin-bottom: 20px;
        }
        h2 {
          color: #8b6b3f;
          margin: 0 0 10px 0;
        }
        p {
          color: #5f5140;
          margin: 5px 0;
        }
        .spinner {
          border: 3px solid #f3f3f3;
          border-top: 3px solid #8b6b3f;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .status {
          font-size: 12px;
          color: #999;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">🏨</div>
        <h2>Vira Villas Rooms</h2>
        <p>Starting application...</p>
        <div class="spinner"></div>
        <p class="status">Please wait while we start MongoDB and the server</p>
      </div>
    </body>
    </html>
  `)}`);
}

function checkBackendReady(retries = 30) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get('http://localhost:4000', (res) => {
        console.log('Backend is ready!');
        resolve();
      }).on('error', (err) => {
        if (retries > 0) {
          console.log(`Backend not ready yet, retrying... (${retries} attempts left)`);
          setTimeout(() => {
            retries--;
            attempt();
          }, 1000);
        } else {
          console.error('Backend failed to start after 30 seconds');
          reject(new Error('Backend failed to start'));
        }
      });
    };
    attempt();
  });
}

async function createWindow() {
  try {
    console.log('Waiting for backend to be ready...');
    await checkBackendReady();

    console.log('Creating main window...');
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    mainWindow.loadURL('http://localhost:4000');

    mainWindow.once('ready-to-show', () => {
      console.log('Main window ready to show');
      if (loadingWindow && !loadingWindow.isDestroyed()) {
        loadingWindow.close();
      }
      mainWindow.show();
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', errorCode, errorDescription);
      setTimeout(() => {
        mainWindow.reload();
      }, 2000);
    });

  } catch (err) {
    console.error('Failed to start application:', err);
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close();
    }

    dialog.showErrorBox(
      'Startup Error',
      'Failed to start Vira Villas Rooms.\n\n' +
      'Please ensure:\n' +
      '1. MongoDB is installed and running\n' +
      '2. Port 4000 is not in use\n' +
      '3. Dependencies are installed (run: npm install)\n\n' +
      'The application will now close.'
    );
    app.quit();
  }
}

app.whenReady().then(() => {
  console.log('Electron app ready');
  createLoadingWindow();
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});
