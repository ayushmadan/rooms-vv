const { execSync } = require('child_process');
const path = require('path');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMongoRunning() {
  const platform = process.platform;

  console.log('[MongoDB] Checking MongoDB status...');

  try {
    if (platform === 'win32') {
      const serviceNames = ['MongoDB', 'MongoDBServer'];
      let serviceName = '';

      // Find MongoDB service
      for (const candidate of serviceNames) {
        try {
          execSync(`sc query ${candidate}`, { stdio: 'ignore' });
          serviceName = candidate;
          console.log(`[MongoDB] Found service: ${serviceName}`);
          break;
        } catch (_e) {
          // continue
        }
      }

      // Install MongoDB if not found
      if (!serviceName) {
        console.log('[MongoDB] MongoDB not found. Installing...');
        try {
          const script = path.resolve('scripts/windows/ensure-mongo.ps1');
          console.log('[MongoDB] Running installation script...');
          execSync(`powershell -ExecutionPolicy Bypass -File \"${script}\" -InstallIfMissing`, { stdio: 'inherit' });
          serviceName = 'MongoDB';
          console.log('[MongoDB] Installation complete');

          // Wait longer after fresh install
          console.log('[MongoDB] Waiting for MongoDB service to initialize...');
          await wait(5000);
        } catch (installErr) {
          console.error('[MongoDB] Installation failed:', installErr.message);
          throw new Error('MongoDB installation failed');
        }
      }

      // Configure service
      try {
        execSync(`sc config ${serviceName} start= auto`, { stdio: 'ignore' });
        execSync(`sc failure ${serviceName} reset= 86400 actions= restart/5000/restart/5000/restart/5000`, { stdio: 'ignore' });
      } catch (_e) {
        console.log('[MongoDB] Service configuration skipped (may require admin)');
      }

      // Start service
      try {
        console.log('[MongoDB] Starting MongoDB service...');
        execSync(`net start ${serviceName}`, { stdio: 'ignore' });
        console.log('[MongoDB] Service start command executed');
      } catch (_e) {
        console.log('[MongoDB] Service may already be running');
      }

      // Wait for MongoDB to be ready
      console.log('[MongoDB] Waiting for MongoDB to be ready...');
      await wait(3000);

    } else if (platform === 'darwin') {
      console.log('[MongoDB] Starting MongoDB on macOS...');
      try {
        execSync('brew services start mongodb-community', { stdio: 'ignore' });
      } catch (_e) {
        console.log('[MongoDB] Brew service start failed, may already be running');
      }
      await wait(2000);
    }

    console.log('[MongoDB] MongoDB should be ready');
    return true;
  } catch (e) {
    console.error('[MongoDB] Failed to ensure MongoDB running:', e.message);
    return false;
  }
}

module.exports = { ensureMongoRunning };
