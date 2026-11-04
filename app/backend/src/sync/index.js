// Hotel-network sync, tying together the admin PC (hub) and front desks.
// Role: the computer holding the owner key is the admin PC; a computer paired with it is a
// desk; anything else is standalone. Every 15 minutes each device checks its licence against
// GitHub, desks exchange changes with the admin PC, and the admin PC trims its change log.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createHub } = require('./hub');
const { createDesk, DeskSyncError } = require('./desk');
const { HttpError } = require('../lib/http');
const settings = require('../services/settings');
const { lanAddresses } = require('../services/phone-capture');
const logger = require('../lib/logger');

const INTERVAL_MS = 15 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 20 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const HISTORY_ROWS = 50;

function jsonFile(file, defaults = {}) {
  return {
    read() {
      try {
        return { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch (_err) {
        return { ...defaults };
      }
    },
    write(patch) {
      const next = { ...this.read(), ...patch };
      fs.writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
      return next;
    }
  };
}

/**
 * @param {object} deps
 * @param {{ port?: number, host?: string, discoveryPort?: number|null }} [deps.network]
 * @param {(file: string) => object} deps.adoptSnapshot replaces local data (with safety backup)
 */
function createSync({ store, dataDir, appVersion, license, owner, adoptSnapshot, network = {}, clock = () => Date.now(), fetchImpl = fetch }) {
  const net = { port: 47820, host: '0.0.0.0', discoveryPort: 47821, ...network };
  const baseDir = path.join(dataDir, '..');
  const tmpDir = path.join(dataDir, 'tmp');
  const hubConfig = jsonFile(path.join(baseDir, 'sync-hub.json'), { devices: [], nextNode: 1 });
  const deskConfig = jsonFile(path.join(baseDir, 'sync-desk.json'), { role: 'standalone' });
  const status = { state: 'idle', lastRunAt: null, lastSyncAt: null, lastError: '', lastResult: null };
  let timer = null;
  let heartbeat = null;
  let running = null;

  if (!hubConfig.read().hubId) hubConfig.write({ hubId: crypto.randomBytes(8).toString('hex') });

  const hub = createHub({
    store, owner, tmpDir, network: net, clock,
    config: {
      read: () => ({ ...hubConfig.read(), name: settings.getSection(store, 'property').name }),
      write: (patch) => hubConfig.write(patch)
    },
    onActivity: (busy) => {
      status.state = busy ? 'syncing' : 'idle';
      if (!busy) status.lastSyncAt = new Date(clock()).toISOString();
    }
  });
  const desk = createDesk({ store, config: deskConfig, license, adoptSnapshot, tmpDir, appVersion, discoveryPort: net.discoveryPort, clock, fetchImpl });

  const role = () => (owner.loaded ? 'hub' : deskConfig.read().role === 'desk' ? 'desk' : 'standalone');

  /** Starts or stops the admin PC listener to match the current role. */
  async function refreshRole() {
    if (role() === 'hub') await hub.start();
    else hub.stop();
  }

  function recordHistory(row) {
    store.insert('sync_history', {
      at: new Date(clock()).toISOString(), node: deskConfig.read().node || 0, label: deskConfig.read().hubName || 'Admin PC',
      ...row
    });
  }

  async function run({ manual = false, trigger = manual ? 'manual' : 'schedule' } = {}) {
    if (running) return running;
    running = (async () => {
      status.lastRunAt = new Date(clock()).toISOString();
      const github = await license.checkGithub();
      if (role() === 'hub') {
        hub.pruneLog();
        return { github };
      }
      if (role() !== 'desk') return { github };
      status.state = 'syncing';
      const started = clock();
      try {
        const result = await desk.syncOnce({ trigger });
        Object.assign(status, { state: 'ok', lastSyncAt: new Date(clock()).toISOString(), lastError: '', lastResult: result });
        recordHistory({ trigger, sent: result.sent, received: result.received, conflicts: result.conflicts, ok: 1, duration_ms: clock() - started });
        return { github, ...result };
      } catch (err) {
        Object.assign(status, { state: 'error', lastError: err.message });
        recordHistory({ trigger, ok: 0, error: String(err.message).slice(0, 300), duration_ms: clock() - started });
        if (!(err instanceof DeskSyncError)) logger.error('Sync failed', { error: err.stack || err.message });
        if (manual) throw new HttpError(502, err.message);
        return { github, error: err.message };
      }
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  function start() {
    refreshRole().catch((err) => logger.error('Could not start the admin PC listener', { error: err.message }));
    setTimeout(() => run().catch(() => {}), FIRST_RUN_DELAY_MS).unref();
    timer = setInterval(() => run().catch(() => {}), INTERVAL_MS);
    timer.unref();
    heartbeat = setInterval(() => beat().catch(() => {}), HEARTBEAT_MS);
    heartbeat.unref();
  }

  /** Desk check-in: keeps the admin PC's status current and picks up "sync now" requests. */
  async function beat() {
    if (role() !== 'desk' || running) return;
    if (await desk.ping()) await run({ trigger: 'admin' });
  }

  function stop() {
    clearInterval(timer);
    clearInterval(heartbeat);
    hub.stop();
  }

  function snapshot() {
    const cfg = deskConfig.read();
    const r = role();
    return {
      role: r,
      ...status,
      intervalMinutes: INTERVAL_MS / 60000,
      desk: r === 'desk' ? { hubName: cfg.hubName, hubAddress: cfg.hubAddress, node: cfg.node, pairedAt: cfg.pairedAt, clockSkewMs: cfg.clockSkewMs || 0 } : null,
      unpairedAt: cfg.unpairedAt || null,
      hub: r === 'hub' ? { port: hub.port, devices: hub.devices() } : null,
      history: store.all('SELECT * FROM sync_history ORDER BY id DESC LIMIT ?', HISTORY_ROWS)
    };
  }

  async function pair({ address, code, label }) {
    if (role() === 'hub') throw new HttpError(409, 'This is the admin PC. Pair the front desks with it instead.');
    try {
      await desk.pair({ address, code, label });
    } catch (err) {
      throw new HttpError(err instanceof DeskSyncError ? 400 : 500, err.message, { cause: err });
    }
    status.lastSyncAt = new Date(clock()).toISOString();
    status.state = 'ok';
    await run({ trigger: 'pairing' }).catch(() => {});
    return snapshot();
  }

  return {
    start, stop, run, refreshRole, pair, status: snapshot, role,
    discover: () => desk.discover(),
    disconnect: () => desk.disconnect(),
    newPairingCode: () => {
      if (role() !== 'hub') throw new HttpError(409, 'Only the admin PC can pair desks');
      const addresses = net.host === '0.0.0.0' ? lanAddresses() : [net.host];
      return { ...hub.newPairingCode(), port: hub.port, addresses: addresses.map((a) => `${a}:${hub.port}`) };
    },
    removeDevice: (node) => hub.removeDevice(node),
    requestSync: (node) => {
      if (role() !== 'hub') throw new HttpError(409, 'Only the admin PC can ask desks to sync');
      if (!hub.requestSync(node)) throw new HttpError(404, 'Desk not found');
    },
    beat
  };
}

module.exports = { createSync, INTERVAL_MS };
