const fs = require('fs');
const path = require('path');
const express = require('express');
const { Store } = require('./db/database');
const { HttpError, forbidden } = require('./lib/http');
const { ymdInZone } = require('./lib/dates');
const { createAuth } = require('./services/auth');
const { createLicense } = require('./services/license');
const { createPhoneCapture } = require('./services/phone-capture');
const backupService = require('./services/backup');
const settings = require('./services/settings');
const vault = require('./services/vault');
const logger = require('./lib/logger');

const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');
const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000;
const STAFF_NAME_MAX = 40;
// Mutating requests must carry this header; browsers cannot add it cross-site without CORS.
const CSRF_HEADER = 'x-rooms-client';

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};

/**
 * Builds the app around a data directory. Nothing listens until listen() is called,
 * which lets Electron, the CLI and tests share one setup.
 */
// Reachable before activation: enough to show the activation screen and activate.
const UNLICENSED_ALLOWED = new Set(['/api/health', '/api/bootstrap', '/api/license/activate']);

/**
 * @param {object} options
 * @param {{ required: boolean, machineId: string }} [options.license] activation (enforced by the packaged app)
 * @param {{ host?: string, port?: number }} [options.phoneCapture] network listener for phone ID capture
 */
function createServer({
  dataDir, appVersion = '0.0.0', clock = () => new Date(),
  license: licenseOptions = { required: false, machineId: 'dev' },
  phoneCapture: phoneCaptureOptions = {}
}) {
  fs.mkdirSync(path.join(dataDir, 'tmp'), { recursive: true });
  const store = new Store(path.join(dataDir, 'rooms.db'));
  const auth = createAuth({ store, clock: () => clock().getTime() });
  const backup = backupService.createService({ dataDir });
  const license = createLicense({ ...licenseOptions, file: path.join(dataDir, '..', 'license.json') });
  const phoneCapture = createPhoneCapture({ store, clock, ...phoneCaptureOptions });
  const deps = { store, auth, backup, license, phoneCapture, dataDir, appVersion };
  vault.sealPlaintext(store);

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);

  let allowedHosts = new Set();
  app.use((req, res, next) => {
    // Blocks DNS-rebinding: only accept requests addressed to our loopback port.
    if (!allowedHosts.has(req.headers.host)) return res.status(421).send('Misdirected request');
    res.set(SECURITY_HEADERS);
    next();
  });

  app.use((req, _res, next) => {
    const now = () => clock().toISOString();
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    req.ctx = {
      store,
      appVersion,
      actor: String(req.get('x-staff') || 'Front desk').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, STAFF_NAME_MAX) || 'Front desk',
      isAdmin: auth.check(token) || (req.method === 'GET' && auth.checkTicket(req.query.ticket)),
      token,
      now,
      today: () => ymdInZone(now(), settings.getSection(store, 'policy').timeZone)
    };
    next();
  });

  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && req.get(CSRF_HEADER) !== '1') return next(forbidden('Missing client header'));
    next();
  });
  app.use((req, _res, next) => {
    if (license.isActive() || !(req.path.startsWith('/api/') || req.path.startsWith('/print/')) || UNLICENSED_ALLOWED.has(req.path)) return next();
    next(new HttpError(423, 'This computer is not activated'));
  });
  const smallJson = express.json({ limit: '1mb' });
  const largeJson = express.json({ limit: '300mb' });
  app.use('/api', (req, res, next) => (req.path === '/data/legacy' ? largeJson : smallJson)(req, res, next));

  app.use('/api', require('./routes/core')(deps));
  app.use('/api', require('./routes/front-desk')(deps));
  app.use('/api', require('./routes/restaurant')(deps));
  app.use('/api', require('./routes/back-office')(deps));
  app.use('/print', require('./routes/print')(deps));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // no-cache: always revalidate, so an updated app never mixes old and new modules.
  app.use(express.static(FRONTEND_DIR, { index: 'index.html', setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err instanceof HttpError ? err.status : err.type === 'entity.too.large' ? 413 : err.status === 400 ? 400 : 500;
    if (status >= 500) logger.error('Request failed', { method: req.method, path: req.path, error: err.stack || err.message });
    const message = status >= 500 ? 'Something went wrong. The error has been logged.' : err.message;
    res.status(status).json({ message });
  });

  let server = null;
  let backupTimer = null;

  function runAutoBackup() {
    try {
      const result = backup.runAutoBackup({ store, appVersion, actor: 'system', now: () => clock().toISOString() });
      if (result.mirrorError) logger.warn(result.mirrorError);
    } catch (err) {
      logger.error('Automatic backup failed', { error: err.stack || err.message });
    }
  }

  function listen({ port = 0, host = '127.0.0.1' } = {}) {
    return new Promise((resolve, reject) => {
      server = app.listen(port, host);
      server.once('error', reject);
      server.once('listening', () => {
        const actualPort = server.address().port;
        allowedHosts = new Set([`127.0.0.1:${actualPort}`, `localhost:${actualPort}`]);
        if (settings.getSection(store, 'setup').completed) setTimeout(runAutoBackup, 30_000).unref();
        backupTimer = setInterval(() => settings.getSection(store, 'setup').completed && runAutoBackup(), AUTO_BACKUP_INTERVAL_MS);
        backupTimer.unref();
        resolve({ port: actualPort, url: `http://127.0.0.1:${actualPort}` });
      });
    });
  }

  function close() {
    clearInterval(backupTimer);
    phoneCapture.closeAll();
    return new Promise((resolve) => {
      const finish = () => {
        store.close();
        resolve();
      };
      if (!server) return finish();
      server.close(finish);
      server.closeAllConnections?.();
    });
  }

  /** Safety snapshot before risky operations such as installing an update. */
  function backupNow(label) {
    return backup.backupNow({ store, appVersion, actor: label, now: () => clock().toISOString() });
  }

  return { app, store, listen, close, runAutoBackup, backupNow, isAdminToken: (token) => auth.check(token) };
}

module.exports = { createServer, CSRF_HEADER };
