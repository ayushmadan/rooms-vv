const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { startApp, unitByCode } = require('./helpers');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ format: 'pem', type: 'spki' });
const PRIV = privateKey.export({ format: 'pem', type: 'pkcs8' });
const GUEST = { fullName: 'Sync Guest', phone: '9876500000', idType: 'Aadhaar', idNumber: '1111 2222 3333' };
const tick = () => new Promise((r) => setTimeout(r, 5));

async function makeHub() {
  const app = await startApp({ publicKeyPem: PUB });
  await app.api.unlock();
  const loaded = await app.api.raw('PUT', '/api/owner/key', { raw: Buffer.from(PRIV), admin: true });
  assert.equal(loaded.status, 200, JSON.stringify(loaded.data));
  const status = (await app.api.get('/api/sync/status')).data;
  assert.equal(status.role, 'hub');
  return { app, address: `127.0.0.1:${status.hub.port}` };
}

async function pairDesk(hub, desk, label = 'Desk 1') {
  const { code } = (await hub.app.api.post('/api/sync/pairing-code', {}, { admin: true })).data;
  const res = await desk.api.post('/api/sync/pair', { address: hub.address, code, label });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data;
}

async function book(api, code, checkIn = '2026-11-02', checkOut = '2026-11-04') {
  const unit = await unitByCode(api, code);
  const res = await api.post('/api/bookings', { unitIds: [unit.id], checkIn, checkOut, guest: GUEST });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data.bookings[0];
}

const syncNow = (desk) => desk.api.post('/api/sync/run', {});
const codes = async (api) => (await api.get('/api/bookings?limit=500')).data.map((b) => b.code).sort();

test('sync: a desk pairs, copies the hotel data, then exchanges changes both ways', async () => {
  const hub = await makeHub();
  const desk = await startApp({ setup: false, publicKeyPem: PUB });
  try {
    const first = await book(hub.app.api, '101');
    assert.equal((await desk.api.post('/api/sync/pair', { address: hub.address, code: 'WRON-GCOD', label: 'x' })).status, 400);
    const paired = await pairDesk(hub, desk);
    assert.equal(paired.role, 'desk');
    assert.equal((await desk.api.get('/api/bootstrap')).data.setupCompleted, true, 'desk took the hotel setup');
    assert.deepEqual(await codes(desk.api), [first.code]);

    await desk.api.unlock(); // the PIN came with the hotel data
    const fromDesk = await book(desk.api, '102');
    assert.match(fromDesk.code, /^VV1-/, 'desk bookings use their own series');
    assert.ok(fromDesk.id > 1e12, 'desk ids come from their own block');
    const fromHub = await book(hub.app.api, '103');

    const run = await syncNow(desk);
    assert.equal(run.status, 200, JSON.stringify(run.data));
    assert.equal(run.data.state, 'ok');
    assert.deepEqual(await codes(desk.api), [first.code, fromDesk.code, fromHub.code].sort());
    assert.deepEqual(await codes(hub.app.api), [first.code, fromDesk.code, fromHub.code].sort());

    // Latest edit wins on both sides.
    await hub.app.api.patch(`/api/bookings/${first.id}`, { notes: 'edited at the admin PC' });
    await tick();
    await desk.api.patch(`/api/bookings/${first.id}`, { notes: 'edited at the desk' });
    await syncNow(desk);
    assert.equal((await hub.app.api.get(`/api/bookings/${first.id}`)).data.notes, 'edited at the desk');
    assert.equal((await desk.api.get(`/api/bookings/${first.id}`)).data.notes, 'edited at the desk');

    // Deletions travel too.
    await hub.app.api.post('/api/meal-rates', { date: '2026-12-25', breakfast: 300, lunch: 400, dinner: 500 }, { admin: true });
    await syncNow(desk);
    const range = '/api/meal-rates?from=2026-12-01&to=2026-12-31';
    assert.equal((await desk.api.get(range)).data.length, 1);
    await hub.app.api.post('/api/meal-rates', { date: '2026-12-25', clear: true }, { admin: true });
    await syncNow(desk);
    assert.equal((await desk.api.get(range)).data.length, 0);

    // GST invoices: each desk is its own consecutive series.
    const laundry = (await desk.api.get('/api/menu?type=SERVICE')).data[0];
    const bill = (await desk.api.post('/api/orders', { kind: 'TAKEAWAY', customerName: 'Walk-in' })).data;
    await desk.api.post(`/api/orders/${bill.id}/items`, { menuItemId: laundry.id, qty: 1 });
    const settled = await desk.api.post(`/api/orders/${bill.id}/settle`, { payments: [{ amount: 1000, mode: 'CASH' }] });
    assert.match(settled.data.invoice.number, /^VV-D1\/26-27\/0001$/);
    await syncNow(desk);
    const hubInvoices = (await hub.app.api.get('/api/invoices?from=2026-11-01&to=2026-11-30', { admin: true })).data;
    assert.ok(hubInvoices.some((i) => i.number === 'VV-D1/26-27/0001'), 'desk invoice reached the admin PC');

    // Two desks booking the same room while out of touch: both kept, flagged.
    await book(hub.app.api, '104', '2026-11-10', '2026-11-12');
    await book(desk.api, '104', '2026-11-11', '2026-11-13');
    await syncNow(desk);
    const conflicts = (await desk.api.get('/api/sync/conflicts')).data;
    assert.equal(conflicts.overlaps.length, 1);
    assert.equal(conflicts.overlaps[0].unit, 'Room 104');

    // A desk removed at the admin PC is cut off.
    await hub.app.api.raw('DELETE', '/api/sync/devices/1', { admin: true });
    const refused = await syncNow(desk);
    assert.equal(refused.status, 502);
    assert.match(refused.data.message, /removed/);
    assert.equal((await desk.api.get('/api/sync/status')).data.role, 'standalone');
  } finally {
    await desk.stop();
    await hub.app.stop();
  }
});

test('sync: desks check in, the admin PC asks for a sync on demand, and both keep a history', async () => {
  const hub = await makeHub();
  const desk = await startApp({ setup: false, publicKeyPem: PUB });
  try {
    await pairDesk(hub, desk, 'Reception');
    const deskRow = async () => (await hub.app.api.get('/api/sync/status')).data.hub.devices[0];
    assert.equal((await deskRow()).online, true, 'pairing counts as contact');
    hub.app.clock.set('2026-11-02T06:32:00.000Z'); // two minutes without a check-in
    assert.equal((await deskRow()).online, false);

    await desk.server.sync.beat();
    assert.equal((await deskRow()).online, true);

    const fromDesk = await book(desk.api, '102');
    assert.equal((await desk.api.post('/api/sync/request', {})).status, 409, 'only the admin PC can ask');
    assert.equal((await hub.app.api.post('/api/sync/request', { node: 9 })).status, 404);
    assert.equal((await hub.app.api.post('/api/sync/request', { node: 1 })).status, 200);
    assert.equal((await deskRow()).syncRequested, true);

    await desk.server.sync.beat(); // the desk's next check-in runs the sync
    assert.equal((await deskRow()).syncRequested, false);
    assert.ok((await codes(hub.app.api)).includes(fromDesk.code), 'requested sync carried the booking');

    const hubHistory = (await hub.app.api.get('/api/sync/status')).data.history;
    assert.deepEqual(hubHistory.map((r) => r.trigger), ['admin', 'pairing']);
    assert.equal(hubHistory[0].label, 'Reception');
    assert.ok(hubHistory[0].received > 0);
    const deskHistory = (await desk.api.get('/api/sync/status')).data.history;
    assert.equal(deskHistory[0].trigger, 'admin');
    assert.equal(deskHistory[0].ok, 1);

    await syncNow(desk);
    assert.equal((await desk.api.get('/api/sync/status')).data.history[0].trigger, 'manual');
    hub.app.server.sync.stop();
    await syncNow(desk);
    const failed = (await desk.api.get('/api/sync/status')).data.history[0];
    assert.equal(failed.ok, 0);
    assert.match(failed.error, /not reachable/);
  } finally {
    await desk.stop();
    await hub.app.stop();
  }
});

test('identity documents: the admin PC opens them without the PIN, front desks still need it', async () => {
  let hub = await makeHub(); // entering the PIN and loading the owner key sets this up
  const desk = await startApp({ setup: false, publicKeyPem: PUB });
  try {
    const booking = await book(hub.app.api, '101');
    const guestId = (await hub.app.api.get(`/api/bookings/${booking.id}`)).data.guest.id;
    const idNumber = (api, admin = false) => api.get(`/api/guests/${guestId}/id-number`, { admin });
    await pairDesk(hub, desk);
    await hub.app.api.post('/api/auth/lock', {}, { admin: true });

    assert.equal((await idNumber(hub.app.api)).data.idNumber, '1111 2222 3333', 'no PIN on the admin PC');
    assert.equal((await hub.app.api.get('/api/bootstrap')).data.idAccess, true);
    assert.equal((await hub.app.api.get(`/api/guests/${guestId}`)).data.idNumber, 'XXXX XXXX 3333', 'lists stay masked');

    assert.equal((await idNumber(desk.api)).status, 403, 'front desk without the PIN');
    assert.equal((await desk.api.get('/api/bootstrap')).data.idAccess, false);
    assert.equal((await desk.api.get(`/print/declaration/${booking.id}`)).status, 200);
    await desk.api.unlock();
    assert.equal((await idNumber(desk.api, true)).data.idNumber, '1111 2222 3333', 'front desk with the PIN');

    // Survives a restart of the admin PC.
    const { dataDir } = hub.app;
    await hub.app.stop({ keepData: true });
    hub = { app: await startApp({ setup: false, publicKeyPem: PUB, dataDir }) };
    assert.equal((await idNumber(hub.app.api)).data.idNumber, '1111 2222 3333');
    assert.equal(fs.readFileSync(path.join(dataDir, 'vault-owner.json'), 'utf8').includes('1111'), false);

    // Removing the owner key ends it.
    await hub.app.api.unlock();
    await hub.app.api.raw('DELETE', '/api/owner/key', { admin: true });
    assert.equal((await idNumber(hub.app.api)).status, 403);
    assert.equal(fs.existsSync(path.join(dataDir, 'vault-owner.json')), false);
  } finally {
    await desk.stop();
    await hub.app.stop();
  }
});

test('licences: keys issued at the admin PC are confirmed and revoked through sync', async () => {
  const hub = await makeHub();
  const desk = await startApp({ setup: false, publicKeyPem: PUB, license: { required: true, machineId: 'desk-pc-1', publicKeyPem: PUB } });
  try {
    const { machineCode } = (await desk.api.get('/api/bootstrap')).data.license;
    assert.equal((await desk.api.get('/api/units')).status, 423);
    const issued = (await hub.app.api.post('/api/licenses', { machineCode, label: 'Reception' }, { admin: true })).data;
    assert.equal((await desk.api.post('/api/license/activate', { key: issued.key })).status, 200);
    await pairDesk(hub, desk);
    await syncNow(desk);
    const status = (await desk.api.get('/api/bootstrap')).data.license;
    assert.equal(status.valid, true);
    assert.ok(status.lastConfirmedAt, 'confirmed by the admin PC');
    assert.equal(status.label, 'Reception');

    const listed = (await hub.app.api.get('/api/licenses', { admin: true })).data.keys;
    await hub.app.api.raw('DELETE', `/api/licenses/${listed[0].hash}`, { admin: true });
    const refused = await syncNow(desk);
    assert.equal(refused.status, 502);
    assert.equal((await desk.api.get('/api/units')).status, 423, 'removed key locks the desk');
    assert.equal((await desk.api.get('/api/bootstrap')).data.license.reason, 'revoked');

    const exported = await hub.app.api.get('/api/licenses/export', { admin: true });
    const file = exported.data;
    assert.deepEqual(JSON.parse(file.payload).hashes, [], 'licenses.json for the repo has no active keys left');
  } finally {
    await desk.stop();
    await hub.app.stop();
  }
});

test('licences: grace period, pending keys, stale and forged lists', async () => {
  const { createLicense } = require('../app/backend/src/services/license');
  const { createOwner } = require('../app/backend/src/services/owner');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-lic-'));
  let now = Date.parse('2026-11-02T06:30:00Z');
  const clock = () => now;
  try {
    fs.writeFileSync(path.join(dir, 'owner.pem'), PRIV);
    const owner = createOwner({ keyFile: path.join(dir, 'owner.pem'), registryFile: path.join(dir, 'reg.json'), publicKeyPem: PUB, clock });
    let served = null;
    const fetchImpl = async () => (served ? { ok: true, status: 200, json: async () => served } : { ok: false, status: 404 });
    const lic = createLicense({ required: true, machineId: 'pc-9', file: path.join(dir, 'lic.json'), publicKeyPem: PUB, clock, fetchImpl });

    const listBefore = owner.signedList(); // published before the key exists
    now += 1000;
    const { key } = owner.issue(lic.status.machineCode, 'Desk 9');
    assert.equal(lic.activate(key), true);
    assert.equal(lic.applyList(listBefore), 'pending', 'a new key is not revoked by an older list');
    assert.equal(lic.isActive(), true);

    assert.equal(await lic.checkGithub(), 'no-list', 'no licenses.json yet: revocation not in use');
    now += 8 * 24 * 3600 * 1000;
    assert.equal(await lic.checkGithub(), 'no-list');
    assert.equal(lic.isActive(), true, 'no list published keeps existing installs working');

    served = owner.signedList();
    assert.equal(await lic.checkGithub(), 'confirmed');
    now += 8 * 24 * 3600 * 1000;
    assert.equal(lic.isActive(), false, 'locks after 7 days without a confirmation');
    assert.equal(lic.status.reason, 'check-overdue');
    assert.equal(await lic.checkGithub(), 'confirmed');
    assert.equal(lic.isActive(), true, 'unlocks once a check succeeds');

    assert.equal(lic.applyList(listBefore), 'older', 'an older list is ignored');
    const forged = { payload: JSON.stringify({ serial: 99, updatedAt: '2030-01-01', hashes: [] }), signature: served.signature };
    assert.equal(lic.applyList(forged), 'invalid');
    assert.equal(lic.isActive(), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('upgrade: a 3.0-era data file migrates in place and keeps working', async () => {
  const { MIGRATIONS } = require('../app/backend/src/db/schema');
  const { Store } = require('../app/backend/src/db/database');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rooms-up-'));
  const file = path.join(dir, 'rooms.db');
  try {
    const old = new DatabaseSync(file);
    for (const sql of MIGRATIONS.slice(0, 4)) old.exec(sql);
    old.exec('PRAGMA user_version = 4');
    old.exec("INSERT INTO guests (full_name, phone, id_type, id_number, created_at, updated_at) VALUES ('Old Guest', '9000000001', 'PAN', 'ABCDE1234F', 'x', 'x')");
    old.close();

    const store = new Store(file);
    assert.equal(store.get('PRAGMA user_version').user_version, MIGRATIONS.length);
    assert.equal(store.get("SELECT COUNT(*) AS n FROM changes WHERE tbl = 'guests'").n, 1, 'existing rows get a version for sync');
    const id = store.insert('guests', { full_name: 'New Guest', phone: '9000000002', created_at: 'y', updated_at: 'y' });
    assert.equal(id, 2, 'ids continue after existing rows');
    assert.equal(store.get('SELECT full_name FROM guests WHERE id = 1').full_name, 'Old Guest');
    store.close();

    const again = new Store(file); // data migrations do not repeat
    assert.equal(again.get("SELECT COUNT(*) AS n FROM changes WHERE tbl = 'guests'").n, 2);
    again.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('licences: keys issued before tracking can be registered so publishing does not lock them', async () => {
  const hub = await makeHub();
  try {
    const legacy = crypto.sign(null, Buffer.from('AAAA-BBBB-CCCC-DDDD'), privateKey).toString('base64url'); // v1 key format
    assert.equal((await hub.app.api.post('/api/licenses', { existingKey: legacy, label: 'Old reception PC' }, { admin: true })).status, 400, 'older keys need their machine code');
    assert.equal((await hub.app.api.post('/api/licenses', { existingKey: legacy, machineCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' }, { admin: true })).status, 400, 'wrong machine code rejected');
    const res = await hub.app.api.post('/api/licenses', { existingKey: legacy, label: 'Old reception PC', machineCode: 'AAAA-BBBB-CCCC-DDDD' }, { admin: true });
    assert.equal(res.status, 201, JSON.stringify(res.data));
    const list = (await hub.app.api.get('/api/licenses/export', { admin: true })).data;
    const { keyHash } = require('../app/backend/src/services/license');
    assert.ok(JSON.parse(list.payload).hashes.includes(keyHash(legacy)), 'registered key is in licenses.json');
    assert.equal((await hub.app.api.post('/api/licenses', { existingKey: 'not-a-key' }, { admin: true })).status, 400);
  } finally {
    await hub.app.stop();
  }
});
