const express = require('express');
const v = require('../lib/validate');
const { handle, conflict, HttpError } = require('../lib/http');
const { requireAdmin } = require('./guard');
const settings = require('../services/settings');
const units = require('../services/units');
const guests = require('../services/guests');
const restaurant = require('../services/restaurant');
const folio = require('../services/folio');
const expenses = require('../services/expenses');
const audit = require('../services/audit');
const vault = require('../services/vault');

module.exports = function coreRoutes({ store, auth, license, appVersion }) {
  const router = express.Router();

  router.get('/health', (_req, res) => res.json({ ok: true, version: appVersion }));

  router.get('/bootstrap', handle((req, res) => {
    const all = settings.getAll(store);
    res.json({
      version: appVersion,
      setupCompleted: all.setup.completed,
      license: license.status,
      today: req.ctx.today(),
      isAdmin: req.ctx.isAdmin,
      property: all.property,
      policy: all.policy,
      taxes: all.taxes,
      meals: all.meals,
      enums: {
        idTypes: guests.ID_TYPES,
        paymentModes: folio.PAYMENT_MODES,
        chargeCategories: folio.CHARGE_CATEGORIES,
        expenseCategories: expenses.CATEGORIES,
        hkStatuses: units.HK_STATUSES
      }
    });
  }));

  router.post('/license/activate', handle((req, res) => {
    if (!license.activate(req.body?.key)) throw new HttpError(400, 'That activation key does not match this computer');
    res.json(license.status);
  }));

  // First run only: property details, taxes and the admin PIN.
  router.post('/setup', handle((req, res) => {
    if (settings.getSection(store, 'setup').completed) throw conflict('Setup is already complete');
    const body = req.body || {};
    store.tx(() => {
      settings.updateSection(store, 'property', body.property || {});
      settings.updateSection(store, 'taxes', body.taxes || {});
      settings.updateSection(store, 'meals', body.meals || {});
      settings.setAdminPin(store, body.pin);
      vault.createKeys(store, body.pin);
      vault.sealPlaintext(store);
      vault.lock(store);
      units.seedDefaults(req.ctx);
      restaurant.seedDefaults(req.ctx);
      settings.putSection(store, 'setup', { completed: true, completedAt: req.ctx.now() });
      audit.record(req.ctx, 'setup.complete', 'settings', null);
    });
    res.json({ ok: true });
  }));

  router.post('/auth/unlock', handle((req, res) => {
    const session = auth.unlock(req.body?.pin);
    audit.record({ ...req.ctx, actor: req.ctx.actor }, 'auth.unlock', 'auth', null);
    res.json(session);
  }));

  router.post('/auth/lock', (req, res) => {
    auth.lock(req.ctx.token);
    res.json({ ok: true });
  });

  router.put('/auth/pin', requireAdmin, handle((req, res) => {
    settings.setAdminPin(store, req.body?.pin);
    vault.rewrap(store, req.body.pin);
    auth.lockAll();
    audit.record(req.ctx, 'auth.pin-change', 'auth', null);
    res.json({ ok: true });
  }));

  router.post('/auth/print-ticket', requireAdmin, (_req, res) => res.json({ ticket: auth.issueTicket() }));

  router.get('/settings', requireAdmin, handle((_req, res) => res.json(settings.getAll(store))));

  router.put('/settings/:section', requireAdmin, handle((req, res) => {
    const value = settings.updateSection(store, req.params.section, req.body);
    audit.record(req.ctx, 'settings.update', 'settings', null, req.params.section);
    res.json(value);
  }));

  router.get('/units', handle((req, res) => res.json(units.list(store, { includeInactive: req.query.all === '1' }))));
  router.post('/units', requireAdmin, handle((req, res) => res.status(201).json(units.create(req.ctx, req.body))));
  router.put('/units/:id', requireAdmin, handle((req, res) => res.json(units.update(req.ctx, v.id(req.params.id), req.body))));
  router.post('/units/:id/housekeeping', handle((req, res) => res.json(units.setHousekeeping(req.ctx, v.id(req.params.id), req.body))));
  router.get('/housekeeping/log', handle((_req, res) => res.json(units.housekeepingLog(store))));

  router.get('/rates', handle((req, res) => res.json(units.listRateOverrides(store, { from: v.ymd(req.query.from, 'From'), to: v.ymd(req.query.to, 'To') }))));
  router.post('/rates', requireAdmin, handle((req, res) => res.json(units.setRateOverride(req.ctx, req.body))));
  router.get('/meal-rates', handle((req, res) => res.json(units.listMealOverrides(store, { from: v.ymd(req.query.from, 'From'), to: v.ymd(req.query.to, 'To') }))));
  router.post('/meal-rates', requireAdmin, handle((req, res) => res.json(units.setMealOverride(req.ctx, req.body))));

  router.get('/audit', requireAdmin, handle((_req, res) => res.json(audit.recent(store))));

  return router;
};
