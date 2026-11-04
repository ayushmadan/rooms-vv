const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const v = require('../lib/validate');
const { handle, badRequest, HttpError } = require('../lib/http');
const { requireAdmin, receiveFile } = require('./guard');
const expenses = require('../services/expenses');
const reports = require('../services/reports');
const settings = require('../services/settings');

const MAX_IMPORT_BYTES = 4 * 1024 * 1024 * 1024;
const PENDING_IMPORT_TTL_MS = 30 * 60 * 1000;

module.exports = function backOfficeRoutes({ store, backup, auth, dataDir }) {
  const router = express.Router();
  const tmpDir = path.join(dataDir, 'tmp');
  // Upload id -> temp file awaiting confirmation; lets the user review a file before it replaces everything.
  const pendingImports = new Map();

  /** Before first-run setup there is no PIN yet, so moving data in is allowed without one. */
  function adminOrFirstRun(req, res, next) {
    if (!settings.getSection(store, 'setup').completed) return next();
    return requireAdmin(req, res, next);
  }

  // --- Expenses
  router.get('/expenses', handle((req, res) => res.json(expenses.list(store, req.query))));
  router.post('/expenses', handle((req, res) => res.status(201).json(expenses.create(req.ctx, req.body))));
  router.post('/expenses/:id/void', requireAdmin, handle((req, res) => {
    expenses.voidExpense(req.ctx, v.id(req.params.id));
    res.json({ ok: true });
  }));

  // --- Reports
  router.get('/reports/daily', handle((req, res) => res.json(reports.daily(store, req.query))));
  router.get('/reports/daily/email', handle((req, res) => res.json(reports.dailyEmail(store, req.query))));
  router.get('/reports/ledger', requireAdmin, handle((req, res) => res.json(reports.ledger(store, req.query))));
  router.get('/reports/csv/:name', requireAdmin, handle((req, res) => {
    const body = reports.csv(store, req.params.name, req.query);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${req.params.name}-${req.query.from}-to-${req.query.to}.csv"`
    });
    res.send(body);
  }));

  // --- Data: export / import / backups
  router.get('/data/export', requireAdmin, handle((req, res) => {
    const file = backup.exportToTemp(req.ctx);
    const name = `${settings.getSection(store, 'property').name.replace(/[^\w-]+/g, '-')}-${req.ctx.today()}.vvdata`;
    res.download(file, name, () => fs.rm(file, { force: true }, () => {}));
  }));

  router.post('/data/import/upload', adminOrFirstRun, handle(async (req, res) => {
    const file = await receiveFile(req, tmpDir, MAX_IMPORT_BYTES);
    try {
      const summary = backup.inspect(file);
      const uploadId = crypto.randomBytes(12).toString('hex');
      pendingImports.set(uploadId, file);
      setTimeout(() => {
        if (pendingImports.delete(uploadId)) fs.rm(file, { force: true }, () => {});
      }, PENDING_IMPORT_TTL_MS).unref();
      res.json({ uploadId, summary });
    } catch (err) {
      fs.rm(file, { force: true }, () => {});
      throw err;
    }
  }));

  router.post('/data/import/confirm', adminOrFirstRun, handle((req, res) => {
    const uploadId = String(req.body?.uploadId || '');
    const file = pendingImports.get(uploadId);
    if (!file) throw badRequest('Upload expired. Choose the file again.');
    pendingImports.delete(uploadId);
    try {
      const summary = backup.importFile(req.ctx, file);
      // The imported data carries its own keys and PIN: end every session.
      auth.lockAll();
      res.json(summary);
    } finally {
      fs.rm(file, { force: true }, () => {});
    }
  }));

  router.get('/data/backups', requireAdmin, handle((_req, res) => res.json({ folder: backup.backupsDir, files: backup.list() })));
  router.post('/data/backups', requireAdmin, handle((req, res) => res.status(201).json(backup.backupNow(req.ctx))));
  router.get('/data/backups/:name', requireAdmin, handle((req, res) => res.download(backup.resolve(req.params.name), req.params.name)));
  router.post('/data/backups/:name/restore', requireAdmin, handle((req, res) => {
    const file = backup.resolve(req.params.name);
    const copy = path.join(tmpDir, `restore-${crypto.randomBytes(6).toString('hex')}.vvdata`);
    fs.copyFileSync(file, copy);
    try {
      const summary = backup.importFile(req.ctx, copy);
      auth.lockAll();
      res.json(summary);
    } finally {
      fs.rm(copy, { force: true }, () => {});
    }
  }));
  router.post('/data/backups/run-auto', requireAdmin, handle((req, res) => {
    const result = backup.runAutoBackup(req.ctx);
    if (result.mirrorError) throw new HttpError(500, result.mirrorError);
    res.json(result);
  }));

  return router;
};
