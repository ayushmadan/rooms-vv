const { execSync } = require('child_process');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureMongoRunning() {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      execSync('sc query MongoDB', { stdio: 'ignore' });
      try {
        execSync('net start MongoDB', { stdio: 'ignore' });
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
