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
const documents = require('../services/documents');

module.exports = function coreRoutes({ store, auth, license, sync, appVersion }) {
  const router = express.Router();

  router.get('/health', (_req, res) => res.json({ ok: true, version: appVersion }));

  router.get('/bootstrap', handle((req, res) => {
    const all = settings.getAll(store);
    res.json({
      version: appVersion,
      setupCompleted: all.setup.completed,
      license: license.status,
      syncRole: sync.role(),
      today: req.ctx.today(),
      isAdmin: req.ctx.isAdmin,
      idAccess: req.ctx.canSeeIds,
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

  // --- Printed documents: wording and layout options over the built-in designs
  router.get('/documents', requireAdmin, handle((_req, res) => res.json(documents.describe(store))));
  // The most recent real records, so the preview shows each document with live data.
  router.get('/documents/samples', requireAdmin, handle((req, res) => {
    const latest = (sql) => store.get(sql)?.id ?? null;
    res.json({
      booking: latest("SELECT id FROM bookings WHERE status <> 'CANCELLED' ORDER BY (checked_in_at IS NOT NULL) DESC, id DESC LIMIT 1"),
      invoice: latest("SELECT id FROM invoices WHERE booking_id IS NOT NULL ORDER BY id DESC LIMIT 1"),
      orderInvoice: latest("SELECT id FROM invoices WHERE order_id IS NOT NULL ORDER BY id DESC LIMIT 1"),
      payment: latest('SELECT id FROM payments WHERE voided_at IS NULL ORDER BY id DESC LIMIT 1'),
      kot: store.get('SELECT order_id AS orderId, kot_no AS kotNo FROM order_items WHERE kot_no IS NOT NULL ORDER BY id DESC LIMIT 1') || null,
      today: req.ctx.today()
    });
  }));
  router.put('/documents/:type', requireAdmin, handle((req, res) => {
    const saved = documents.save(store, req.params.type, req.body || {});
    audit.record(req.ctx, 'documents.update', 'settings', null, req.params.type);
    res.json(saved);
  }));
  router.delete('/documents/:type', requireAdmin, handle((req, res) => {
    const saved = documents.reset(store, req.params.type);
    audit.record(req.ctx, 'documents.reset', 'settings', null, req.params.type);
    res.json(saved);
  }));

  router.get('/audit', requireAdmin, handle((_req, res) => res.json(audit.recent(store))));

  return router;
};
