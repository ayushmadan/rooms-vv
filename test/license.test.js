const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { machineCode, isValidKey } = require('../app/backend/src/services/license');
const { startApp } = require('./helpers');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUBLIC_PEM = publicKey.export({ format: 'pem', type: 'spki' });
const issue = (code) => crypto.sign(null, Buffer.from(code), privateKey).toString('base64url');

test('license: machine codes are stable, typeable and machine-specific', () => {
  const a = machineCode('8f1c0b6e-1111-2222-3333-444455556666');
  assert.match(a, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(a, machineCode('8F1C0B6E-1111-2222-3333-444455556666 '));
  assert.notEqual(a, machineCode('another-machine'));
});

test('license: only a key signed for this machine code is accepted', () => {
  const code = machineCode('pc-1');
  assert.equal(isValidKey(code, issue(code), PUBLIC_PEM), true);
  assert.equal(isValidKey(machineCode('pc-2'), issue(code), PUBLIC_PEM), false, 'key copied to another PC is rejected');
  assert.equal(isValidKey(code, 'not-a-key', PUBLIC_PEM), false);
});

test('license: an unactivated install refuses everything except activation', async () => {
  const { api, stop } = await startApp({ setup: false, license: { required: true, machineId: 'front-desk-pc', publicKeyPem: PUBLIC_PEM } });
  try {
    const boot = (await api.get('/api/bootstrap')).data;
    assert.deepEqual([boot.license.required, boot.license.valid], [true, false]);
    assert.equal((await api.get('/api/units')).status, 423);
    assert.equal((await api.post('/api/setup', {})).status, 423);
    assert.equal((await api.post('/api/license/activate', { key: issue(machineCode('some-other-pc')) })).status, 400);
    const ok = await api.post('/api/license/activate', { key: issue(boot.license.machineCode) });
    assert.equal(ok.data.valid, true);
    assert.equal((await api.get('/api/units')).status, 200);
  } finally {
    await stop();
  }
});
