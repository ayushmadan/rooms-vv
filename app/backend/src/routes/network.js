// Hotel-network sync, the owner key and licence management.
const express = require('express');
const v = require('../lib/validate');
const { handle } = require('../lib/http');
const { requireAdmin, receiveBuffer } = require('./guard');
const settings = require('../services/settings');
const bookings = require('../services/bookings');
const audit = require('../services/audit');

const MAX_KEY_FILE_BYTES = 16 * 1024;

module.exports = function networkRoutes({ store, sync, owner, license, auth, idAccess }) {
  const router = express.Router();

  /** A new desk joins the admin PC during first-run setup, before it has a PIN of its own. */
  function adminOrFirstRun(req, res, next) {
    if (!settings.getSection(store, 'setup').completed) return next();
    return requireAdmin(req, res, next);
  }

  // --- Sync (status and "Sync now" are for everyone; the loader polls status)
  router.get('/sync/status', (_req, res) => res.json(sync.status()));
  router.post('/sync/run', handle(async (_req, res) => {
    await sync.run({ manual: true });
    res.json(sync.status());
  }));
  router.get('/sync/discover', adminOrFirstRun, handle(async (_req, res) => res.json(await sync.discover())));
  router.post('/sync/pair', adminOrFirstRun, handle(async (req, res) => {
    const address = v.text(req.body?.address, 'Admin PC address', { required: true, max: 60 });
    if (!/^[\w.-]+(:\d{2,5})?$/.test(address)) return res.status(400).json({ message: 'Address must look like 192.168.1.20:47820' });
    const withPort = address.includes(':') ? address : `${address}:47820`;
    const result = await sync.pair({ address: withPort, code: v.text(req.body?.code, 'Pairing code', { required: true, max: 12 }), label: v.text(req.body?.label, 'Desk name', { max: 60 }) || 'Front desk' });
    res.json(result);
  }));
  router.post('/sync/disconnect', requireAdmin, (req, res) => {
    sync.disconnect();
    audit.record(req.ctx, 'sync.disconnect', 'sync', null);
    res.json(sync.status());
  });
  // Admin PC: ask one desk (or all) to sync now; desks pick it up at their next check-in (≤ 30 s).
  router.post('/sync/request', handle((req, res) => {
    sync.requestSync(req.body?.node === undefined || req.body?.node === null ? undefined : v.id(req.body.node, 'Desk'));
    res.json(sync.status());
  }));
  router.post('/sync/pairing-code', requireAdmin, handle((_req, res) => res.json(sync.newPairingCode())));
  router.delete('/sync/devices/:node', requireAdmin, handle((req, res) => {
    sync.removeDevice(v.id(req.params.node, 'Desk'));
    audit.record(req.ctx, 'sync.remove-desk', 'sync', Number(req.params.node));
    res.json(sync.status());
  }));
  router.get('/sync/conflicts', handle((_req, res) => {
    res.json({
      overlaps: bookings.overlapping(store),
      failed: store.all('SELECT id, at, tbl, row_key, origin, reason FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY id DESC LIMIT 100')
    });
  }));
  router.post('/sync/conflicts/:id/resolve', requireAdmin, handle((req, res) => {
    store.run('UPDATE sync_conflicts SET resolved_at = ? WHERE id = ?', req.ctx.now(), v.id(req.params.id));
    res.json({ ok: true });
  }));

  // --- This computer's licence
  router.post('/license/check', handle(async (_req, res) => {
    const result = await license.checkGithub();
    res.json({ result, status: license.status });
  }));

  // --- Owner key: makes this computer the admin PC
  router.get('/owner', requireAdmin, (_req, res) => res.json({ loaded: owner.loaded }));
  router.put('/owner/key', requireAdmin, handle(async (req, res) => {
    owner.install((await receiveBuffer(req, MAX_KEY_FILE_BYTES)).toString('utf8'));
    idAccess.remember(); // the PIN was just entered: IDs open on this computer from now on
    await sync.refreshRole();
    audit.record(req.ctx, 'owner.key-loaded', 'licence', null);
    res.json({ loaded: true });
  }));
  router.delete('/owner/key', requireAdmin, handle(async (req, res) => {
    owner.remove();
    idAccess.forget();
    auth.lockAll();
    await sync.refreshRole();
    audit.record(req.ctx, 'owner.key-removed', 'licence', null);
    res.json({ loaded: false });
  }));

  // --- Licence keys (admin PC only)
  router.get('/licenses', requireAdmin, handle((_req, res) => res.json({ loaded: owner.loaded, serial: owner.serial, keys: owner.loaded ? owner.list() : [] })));
  router.post('/licenses', requireAdmin, handle((req, res) => {
    if (req.body?.existingKey) {
      const registered = owner.register(req.body.existingKey, req.body.label, req.body.machineCode);
      audit.record(req.ctx, 'licence.register', 'licence', null, registered.label);
      return res.status(201).json(registered);
    }
    const issued = owner.issue(req.body?.machineCode, req.body?.label);
    audit.record(req.ctx, 'licence.issue', 'licence', null, `${issued.label} ${issued.machineCode}`);
    res.status(201).json(issued);
  }));
  router.get('/licenses/:hash/key', requireAdmin, handle((req, res) => res.json({ key: owner.keyFor(String(req.params.hash)) })));
  router.delete('/licenses/:hash', requireAdmin, handle((req, res) => {
    owner.revoke(String(req.params.hash));
    audit.record(req.ctx, 'licence.revoke', 'licence', null, String(req.params.hash).slice(0, 12));
    res.json({ ok: true, serial: owner.serial });
  }));
  router.get('/licenses/export', requireAdmin, handle((_req, res) => {
    const list = owner.signedList();
    if (!list) return res.status(400).json({ message: 'Load the owner key first' });
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="licenses.json"' });
    res.send(`${JSON.stringify(list, null, 2)}\n`);
  }));

  return router;
};
