// Remote updates: the version in package.json on the main branch is the source of truth.
// CI publishes a GitHub release "v<version>" with the Windows installer for every version
// pushed to main; this module finds it, verifies the download and runs it silently.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const REPO = 'ayushmadan/rooms-vv';
// GitHub redirects the old "master" name to "main", the repository's default branch.
const BRANCH = 'main';
const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/package.json`;
const RELEASE_URL = (version) => `https://api.github.com/repos/${REPO}/releases/tags/v${version}`;
const DOWNLOAD_PREFIX = `https://github.com/${REPO}/releases/download/`;
const INSTALLER_PATTERN = /Setup.*\.exe$/i;
const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

/** Compares dotted numeric versions: 1 if a > b, -1 if a < b, 0 if equal. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { 'User-Agent': 'vira-villas-rooms-updater', Accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Update server answered ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{current:string, latest:string, updateAvailable:boolean, ready:boolean, installer?:object, notes?:string}>}
 */
async function check(currentVersion, { fetchImpl = fetch } = {}) {
  let remote;
  try {
    remote = await getJson(VERSION_URL, fetchImpl);
  } catch (err) {
    throw new Error('Could not reach GitHub. Connect to the internet and try again.', { cause: err });
  }
  const latest = remote?.version;
  if (!latest) throw new Error('Could not read the latest version');
  const result = { current: currentVersion, latest, updateAvailable: compareVersions(latest, currentVersion) > 0, ready: false };
  if (!result.updateAvailable) return result;

  const release = await getJson(RELEASE_URL(latest), fetchImpl);
  const asset = release?.assets?.find((a) => INSTALLER_PATTERN.test(a.name));
  if (!asset || !asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)) return result;
  const digest = typeof asset.digest === 'string' && asset.digest.startsWith('sha256:') ? asset.digest.slice(7) : null;
  return {
    ...result,
    ready: true,
    notes: (release.body || '').slice(0, 2000),
    installer: { name: asset.name, url: asset.browser_download_url, size: asset.size, sha256: digest }
  };
}

/** Streams the installer to disk, reporting progress, then verifies size and checksum. */
async function download(installer, destDir, { onProgress = () => {}, fetchImpl = fetch } = {}) {
  if (!installer.url.startsWith(DOWNLOAD_PREFIX)) throw new Error('Refusing to download from an unexpected address');
  const file = path.join(destDir, `rooms-update-${path.basename(installer.name).replace(/[^\w.-]/g, '')}`);
  const res = await fetchImpl(installer.url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(file);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk);
      received += chunk.length;
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      onProgress(installer.size ? Math.min(99, Math.floor((received / installer.size) * 100)) : 0);
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  } catch (err) {
    out.destroy();
    fs.rmSync(file, { force: true });
    throw err;
  }
  if (installer.size && received !== installer.size) {
    fs.rmSync(file, { force: true });
    throw new Error('Download was incomplete. Try again.');
  }
  if (installer.sha256 && hash.digest('hex') !== installer.sha256) {
    fs.rmSync(file, { force: true });
    throw new Error('Downloaded file failed its integrity check and was deleted.');
  }
  onProgress(100);
  return file;
}

/** Runs the per-user NSIS installer silently; --force-run reopens the app when it finishes. */
function runInstaller(file) {
  const child = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
}

module.exports = { check, download, runInstaller, compareVersions, BRANCH, REPO };
