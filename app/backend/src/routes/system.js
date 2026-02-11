const express = require('express');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { requireAdmin } = require('../middleware/auth');
const { repoUrl, repoBranch, mongoUri } = require('../config/env');

const router = express.Router();

function safeExec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (_e) {
    return '';
  }
}

function getPackageVersion() {
  const pkgPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

function getLocalGitHash() {
  return safeExec('git rev-parse HEAD');
}

function getRemoteGitHash() {
  return safeExec(`git ls-remote ${repoUrl} refs/heads/${repoBranch}`).split('\t')[0] || '';
}

router.get('/version', (_req, res) => {
  res.json({
    version: getPackageVersion(),
    branch: repoBranch,
    localHash: getLocalGitHash() || 'unknown'
  });
});

router.get('/update/check', async (_req, res) => {
  const localHash = getLocalGitHash();
  const remoteHash = getRemoteGitHash();

  res.json({
    version: getPackageVersion(),
    branch: repoBranch,
    localHash: localHash || 'unknown',
    remoteHash: remoteHash || 'unknown',
    updateAvailable: Boolean(localHash && remoteHash && localHash !== remoteHash)
  });
});

router.post('/update/run', requireAdmin, async (_req, res, next) => {
  try {
    if (process.platform !== 'win32') {
      return res.status(400).json({ message: 'Update run endpoint is intended for Windows runtime only.' });
    }

    const script = path.resolve('scripts/windows/update-app.ps1');
    if (!fs.existsSync(script)) {
      return res.status(404).json({ message: 'Windows update script not found.' });
    }

    const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script, '-RepoUrl', repoUrl, '-Branch', repoBranch], {
      detached: false,
      stdio: 'ignore'
    });

    child.on('error', (err) => {
      console.error('Update process failed to start:', err.message);
    });

    res.json({ message: 'Update started. Server will restart automatically if update succeeds.' });

    child.on('close', (code) => {
      if (code === 0) {
        setTimeout(() => process.exit(0), 1200);
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/mongo/ensure', requireAdmin, async (_req, res, next) => {
  try {
    if (process.platform !== 'win32') {
      return res.status(400).json({ message: 'Mongo ensure endpoint is intended for Windows runtime only.' });
    }

    const script = path.resolve('scripts/windows/ensure-mongo.ps1');
    if (!fs.existsSync(script)) {
      return res.status(404).json({ message: 'Mongo ensure script not found.' });
    }

    execSync(`powershell -ExecutionPolicy Bypass -File "${script}" -InstallIfMissing -MongoUri "${mongoUri}"`, { stdio: 'ignore' });
    res.json({ message: 'MongoDB service ensured and started.' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
