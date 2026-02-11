const { execSync } = require('child_process');
const path = require('path');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMongoRunning() {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const serviceNames = ['MongoDB', 'MongoDBServer'];
      let serviceName = '';
      for (const candidate of serviceNames) {
        try {
          execSync(`sc query ${candidate}`, { stdio: 'ignore' });
          serviceName = candidate;
          break;
        } catch (_e) {
          // continue
        }
      }

      try {
        if (!serviceName) throw new Error('not-found');
      } catch (_e) {
        const script = path.resolve('scripts/windows/ensure-mongo.ps1');
        execSync(`powershell -ExecutionPolicy Bypass -File \"${script}\" -InstallIfMissing`, { stdio: 'ignore' });
        serviceName = 'MongoDB';
      }
      execSync(`sc config ${serviceName} start= auto`, { stdio: 'ignore' });
      execSync(`sc failure ${serviceName} reset= 86400 actions= restart/5000/restart/5000/restart/5000`, { stdio: 'ignore' });
      try {
        execSync(`net start ${serviceName}`, { stdio: 'ignore' });
      } catch (_e) {
        // service may already be running
      }
    } else if (platform === 'darwin') {
      try {
        execSync('brew services start mongodb-community', { stdio: 'ignore' });
      } catch (_e) {
        // fallback manual start if brew service isn't installed
      }
    }

    await wait(1000);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { ensureMongoRunning };
