const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const fs = require('fs');

let mainWindow;
let loadingWindow;
let backendProcess;
let isQuitting = false;
let backendRestartCount = 0;
const MAX_BACKEND_RESTARTS = 3;

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

// Check if a port is available
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

// Kill process on a specific port (cross-platform)
async function killPortProcess(port) {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows
      ? `FOR /F "tokens=5" %P IN ('netstat -ano ^| findstr :${port}') DO taskkill /F /PID %P`
      : `lsof -ti:${port} | xargs kill -9`;

    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const args = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, args, { stdio: 'ignore' });
    proc.on('close', () => {
      console.log(`Attempted to kill process on port ${port}`);
      setTimeout(resolve, 500); // Wait a bit for port to be released
    });
    proc.on('error', () => resolve()); // Ignore errors, port might not be in use
  });
}

async function startBackend() {
  console.log('Starting backend server...');

  // Check if port 4000 is available
  const portAvailable = await checkPortAvailable(4000);

  if (!portAvailable) {
    console.log('Port 4000 is in use. Attempting to kill orphaned process...');
    await killPortProcess(4000);

    // Check again after killing
    const stillInUse = !(await checkPortAvailable(4000));
    if (stillInUse) {
      console.error('Port 4000 is still in use after cleanup attempt');
      backendRestartCount++;

      if (backendRestartCount >= MAX_BACKEND_RESTARTS) {
        dialog.showErrorBox(
          'Port Conflict',
          'Port 4000 is already in use and could not be freed.\n\n' +
          'Another instance of the application may be running.\n\n' +
          'Please:\n' +
          '1. Close all instances of this application\n' +
          '2. Restart your computer if the issue persists\n\n' +
          'The application will now exit.'
        );
        app.quit();
        return;
      }
    }
  }

  backendProcess = spawn(process.execPath, [path.join(__dirname, '..', 'app/backend/src/index.js')], {
    stdio: 'inherit'
  });

  backendProcess.on('exit', (code) => {
    console.log(`Backend exited with code ${code}`);
    if (!isQuitting) {
      backendRestartCount++;

      if (backendRestartCount >= MAX_BACKEND_RESTARTS) {
        console.error(`Backend failed to start after ${MAX_BACKEND_RESTARTS} attempts`);

        // Close loading window if it's still open
        if (loadingWindow && !loadingWindow.isDestroyed()) {
          loadingWindow.close();
        }

        dialog.showErrorBox(
          'Backend Startup Failed',
          `The backend server failed to start after ${MAX_BACKEND_RESTARTS} attempts.\n\n` +
          'This may be due to:\n' +
          '- MongoDB not installed or not running\n' +
          '- Port 4000 being used by another application\n' +
          '- Missing dependencies\n\n' +
          'To fix this:\n' +
          '1. Download and install MongoDB from:\n' +
          '   https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi\n' +
          '2. Restart your computer\n' +
          '3. Run this application as Administrator\n\n' +
          'The application will now exit.'
        );
        app.quit();
        return;
      }

      console.log(`Restarting backend in 5 seconds... (attempt ${backendRestartCount}/${MAX_BACKEND_RESTARTS})`);
      setTimeout(startBackend, 5000); // Increased cooldown to 5 seconds
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

function checkBackendReady(retries = 90, interval = 2000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const maxAttempts = retries;

    const attempt = () => {
      attempts++;
      http.get('http://localhost:4000', (res) => {
        console.log('Backend is ready!');
        resolve();
      }).on('error', (err) => {
        if (retries > 0) {
          const elapsed = ((maxAttempts - retries) * interval) / 1000;
          console.log(`Backend not ready yet (${Math.floor(elapsed)}s elapsed, ${retries} retries left)...`);

          // Update loading window status
          if (loadingWindow && !loadingWindow.isDestroyed()) {
            let status = 'Starting MongoDB and server...';
            if (elapsed > 30) status = 'MongoDB is starting (this may take a minute)...';
            if (elapsed > 60) status = 'Almost ready, please wait...';

            loadingWindow.webContents.executeJavaScript(`
              document.querySelector('.status').textContent = '${status}';
            `).catch(() => {});
          }

          setTimeout(() => {
            retries--;
            attempt();
          }, interval);
        } else {
          console.error(`Backend failed to start after ${(maxAttempts * interval) / 1000} seconds`);
          reject(new Error('Backend failed to start. MongoDB may not be installed or port 4000 is in use.'));
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

    // Reset restart count on successful backend startup
    backendRestartCount = 0;
    console.log('Backend is healthy. Reset restart counter.');

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

    const errorDetails = err.message || 'Unknown error';
    dialog.showErrorBox(
      'Vira Villas Rooms - Startup Failed',
      `The application failed to start after 3 minutes.\n\n` +
      `Error: ${errorDetails}\n\n` +
      `Common solutions:\n` +
      `1. Download and install MongoDB from:\n` +
      `   https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi\n` +
      `2. Restart your computer to clear port 4000\n` +
      `3. Run the application as Administrator\n` +
      `4. Check Windows Firewall settings\n\n` +
      `If this persists, please contact support.\n\n` +
      `The application will now close.`
    );
    app.quit();
  }
}

// First-run setup: ensure MongoDB and .env are configured
async function runFirstTimeSetup() {
  const appPath = app.getAppPath();
  const setupCompletedMarker = path.join(app.getPath('userData'), '.setup-completed');
  const envPath = path.join(appPath, '.env');

  // Check if setup has already been completed
  if (fs.existsSync(setupCompletedMarker) && fs.existsSync(envPath)) {
    console.log('Setup already completed, skipping first-run setup');
    return;
  }

  console.log('Running first-time setup...');

  // Only run setup on Windows
  if (process.platform === 'win32') {
    // Check for post-install script in multiple locations
    let postInstallScript = path.join(appPath, 'resources', 'post-install.ps1');

    if (!fs.existsSync(postInstallScript)) {
      postInstallScript = path.join(appPath, 'scripts', 'windows', 'post-install.ps1');
    }

    if (fs.existsSync(postInstallScript)) {
      return new Promise((resolve) => {
        console.log('Executing post-install setup script...');

        const setupProcess = spawn('powershell.exe', [
          '-ExecutionPolicy', 'Bypass',
          '-NoProfile',
          '-File', postInstallScript,
          '-InstallDir', appPath
        ], {
          stdio: 'inherit',
          shell: true
        });

        setupProcess.on('close', (code) => {
          if (code === 0) {
            console.log('First-time setup completed successfully');
            // Create marker file to indicate setup is complete
            fs.writeFileSync(setupCompletedMarker, new Date().toISOString());
          } else {
            console.log(`Setup script exited with code ${code}`);
          }
          resolve();
        });

        setupProcess.on('error', (err) => {
          console.error('Failed to run setup script:', err.message);
          resolve(); // Continue anyway
        });

        // Timeout after 3 minutes
        setTimeout(() => {
          console.log('Setup script timeout - continuing...');
          setupProcess.kill();
          resolve();
        }, 180000);
      });
    } else {
      console.log('Post-install script not found, skipping automated setup');
    }
  }

  // For non-Windows or if script doesn't exist, just ensure .env exists
  if (!fs.existsSync(envPath)) {
    const envExamplePath = path.join(appPath, '.env.example');
    if (fs.existsSync(envExamplePath)) {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('Created .env from .env.example');
    }
  }

  // Mark setup as completed
  fs.writeFileSync(setupCompletedMarker, new Date().toISOString());
}

app.whenReady().then(async () => {
  console.log('Electron app ready');

  // Run first-time setup if needed
  await runFirstTimeSetup();

  createLoadingWindow();
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  if (backendProcess && !backendProcess.killed) {
    console.log('Sending SIGTERM to backend for graceful shutdown...');
    backendProcess.kill('SIGTERM');

    // Force kill if graceful shutdown takes too long
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        console.log('Force killing backend process');
        backendProcess.kill('SIGKILL');
      }
    }, 5000);
  }
  if (process.platform !== 'darwin') app.quit();
});
