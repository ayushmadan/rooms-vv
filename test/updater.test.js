const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const updater = require('../electron/updater');

const INSTALLER = Buffer.from('fake installer bytes');
const SHA = crypto.createHash('sha256').update(INSTALLER).digest('hex');
const ASSET_URL = 'https://github.com/ayushmadan/rooms-vv/releases/download/v2.1.0/Vira-Villas-Rooms-Setup-2.1.0.exe';

function fakeFetch({ remoteVersion = '2.1.0', release = true, digest = `sha256:${SHA}`, body = INSTALLER } = {}) {
  return async (url) => {
    const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (url.endsWith('/package.json')) return json({ version: remoteVersion });
    if (url.includes('/releases/tags/')) {
      return release ? json({ body: 'Fixes', assets: [{ name: 'Vira-Villas-Rooms-Setup-2.1.0.exe', browser_download_url: ASSET_URL, size: INSTALLER.length, digest }] }) : json({}, 404);
    }
    if (url === ASSET_URL) return { ok: true, status: 200, body: (async function* () { yield body.subarray(0, 5); yield body.subarray(5); })() };
    throw new Error(`unexpected ${url}`);
  };
}

test('updater: version comparison', () => {
  assert.equal(updater.compareVersions('2.0.10', '2.0.9'), 1);
  assert.equal(updater.compareVersions('2.0.0', '2.0'), 0);
  assert.equal(updater.compareVersions('1.9.9', '2.0.0'), -1);
});

test('updater: reports up to date, not ready, and ready with installer', async () => {
  assert.equal((await updater.check('2.1.0', { fetchImpl: fakeFetch() })).updateAvailable, false);
  const notReady = await updater.check('2.0.0', { fetchImpl: fakeFetch({ release: false }) });
  assert.deepEqual([notReady.updateAvailable, notReady.ready], [true, false]);
  const ready = await updater.check('2.0.0', { fetchImpl: fakeFetch() });
  assert.equal(ready.ready, true);
  assert.equal(ready.installer.sha256, SHA);
});

test('updater: download verifies checksum and deletes tampered files', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-upd-'));
  try {
    const progress = [];
    const { installer } = await updater.check('2.0.0', { fetchImpl: fakeFetch() });
    const file = await updater.download(installer, dir, { fetchImpl: fakeFetch(), onProgress: (p) => progress.push(p) });
    assert.ok(fs.readFileSync(file).equals(INSTALLER));
    assert.equal(progress.at(-1), 100);

    const tampered = Buffer.from('evil installer bytes');
    await assert.rejects(updater.download(installer, dir, { fetchImpl: fakeFetch({ body: tampered }) }), /integrity/);
    assert.equal(fs.existsSync(file), false, 'tampered download removed');
    await assert.rejects(updater.download({ ...installer, url: 'https://evil.example/x.exe' }, dir, { fetchImpl: fakeFetch() }), /unexpected address/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
