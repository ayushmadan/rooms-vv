const { execSync } = require('child_process');

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
        console.error('[MongoDB] ===================================');
        console.error('[MongoDB] MongoDB is not installed!');
        console.error('[MongoDB] ===================================');
        console.error('[MongoDB]');
        console.error('[MongoDB] Please install MongoDB manually from:');
        console.error('[MongoDB] https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi');
        console.error('[MongoDB]');
        console.error('[MongoDB] Or visit: https://www.mongodb.com/try/download/community');
        console.error('[MongoDB]');
        console.error('[MongoDB] After installing MongoDB:');
        console.error('[MongoDB] 1. Restart your computer');
        console.error('[MongoDB] 2. Run this application again');
        console.error('[MongoDB] ===================================');

        throw new Error(
          'MongoDB is not installed.\n\n' +
          'Download MongoDB from:\n' +
          'https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-8.0.4-signed.msi\n\n' +
          'Then restart your computer and try again.'
        );
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
