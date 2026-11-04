const fs = require('fs');
const path = require('path');
const express = require('express');
const { Store } = require('./db/database');
const { HttpError, forbidden } = require('./lib/http');
const { ymdInZone } = require('./lib/dates');
const { createAuth } = require('./services/auth');
const { createLicense } = require('./services/license');
const { createPhoneCapture } = require('./services/phone-capture');
const { createOwner } = require('./services/owner');
const { createIdAccess } = require('./services/id-access');
const { createSync } = require('./sync');
const backupService = require('./services/backup');
const settings = require('./services/settings');
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

// Reachable before activation: enough to show the activation screen, activate, or re-check.
// A desk locked for an overdue check may recover by syncing with the admin PC.
const UNLICENSED_ALLOWED = new Set(['/api/health', '/api/bootstrap', '/api/license/activate', '/api/license/check', '/api/sync/run']);

/**
 * Builds the app around a data directory. Nothing listens until listen() is called,
 * which lets Electron, the CLI and tests share one setup.
 * @param {object} options
 * @param {{ required: boolean, machineId: string }} [options.license] activation (enforced by the packaged app)
 * @param {{ host?: string, port?: number }} [options.phoneCapture] network listener for phone ID capture
 * @param {{ host?: string, port?: number, discoveryPort?: number|null }} [options.sync] hotel-network sync listener
 * @param {typeof fetch} [options.fetchImpl] used for GitHub licence checks (tests inject one)
 * @param {string} [options.publicKeyPem] owner public key (defaults to the one built into the app)
 */
function createServer({
  dataDir, appVersion = '0.0.0', clock = () => new Date(),
  license: licenseOptions = { required: false, machineId: 'dev' },
  phoneCapture: phoneCaptureOptions = {},
  sync: syncOptions = {},
  fetchImpl = fetch,
  publicKeyPem
}) {
  fs.mkdirSync(path.join(dataDir, 'tmp'), { recursive: true });
  const store = new Store(path.join(dataDir, 'rooms.db'));
  const backup = backupService.createService({ dataDir });
  const ms = () => clock().getTime();
  // Owner key, licence and sync state live beside the data folder: they belong to this
  // computer, not to the hotel's data, so exports and imports never carry them.
  const machineDir = path.join(dataDir, '..');
  const keyOption = publicKeyPem ? { publicKeyPem } : {};
  const owner = createOwner({ keyFile: path.join(machineDir, 'owner-key.pem'), registryFile: path.join(machineDir, 'owner-licenses.json'), clock: ms, ...keyOption });
  const idAccess = createIdAccess({ store, owner, file: path.join(machineDir, 'vault-owner.json') });
  idAccess.restore();
  const auth = createAuth({ store, clock: ms, idAccess });
  const license = createLicense({ ...licenseOptions, file: path.join(machineDir, 'license.json'), isOwner: () => owner.loaded, clock: ms, fetchImpl, ...keyOption });
  const phoneCapture = createPhoneCapture({ store, clock, ...phoneCaptureOptions });
  const systemCtx = (actor) => ({ store, appVersion, actor, isAdmin: true, now: () => clock().toISOString() });
  const sync = createSync({
    store, dataDir, appVersion, license, owner, clock: ms, network: syncOptions,
    adoptSnapshot: (file) => {
      backup.importFile(systemCtx('sync'), file);
      auth.lockAll(); // the admin PC's data carries its own PIN and keys
    }
  });
  const deps = { store, auth, idAccess, backup, license, owner, sync, phoneCapture, dataDir, appVersion };

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
    const isAdmin = auth.check(token) || (req.method === 'GET' && auth.checkTicket(req.query.ticket));
    req.ctx = {
      store,
      appVersion,
      actor: String(req.get('x-staff') || 'Front desk').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, STAFF_NAME_MAX) || 'Front desk',
      isAdmin,
      // The admin PC opens ID numbers and photos without the PIN; front desks need it.
      canSeeIds: isAdmin || idAccess.available(),
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
  app.use('/api', express.json({ limit: '1mb' }));

  app.use('/api', require('./routes/core')(deps));
  app.use('/api', require('./routes/front-desk')(deps));
  app.use('/api', require('./routes/restaurant')(deps));
  app.use('/api', require('./routes/back-office')(deps));
  app.use('/api', require('./routes/network')(deps));
  app.use('/print', require('./routes/print')(deps));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));
  // no-cache: always revalidate, so an updated app never mixes old and new modules.
  app.use(express.static(FRONTEND_DIR, { index: 'index.html', setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err instanceof HttpError ? err.status : err.type === 'entity.too.large' ? 413 : err.status === 400 ? 400 : 500;
    // Errors raised on purpose (HttpError) explain themselves; anything unexpected is logged, not shown.
    const unexpected = !(err instanceof HttpError) && status >= 500;
    if (unexpected) logger.error('Request failed', { method: req.method, path: req.path, error: err.stack || err.message });
    const message = unexpected ? 'Something went wrong. The error has been logged.' : err.message;
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
        sync.start();
        resolve({ port: actualPort, url: `http://127.0.0.1:${actualPort}` });
      });
    });
  }

  function close() {
    clearInterval(backupTimer);
    phoneCapture.closeAll();
    sync.stop();
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

  return { app, store, sync, owner, license, listen, close, runAutoBackup, backupNow, isAdminToken: (token) => auth.check(token) };
}

module.exports = { createServer, CSRF_HEADER };
