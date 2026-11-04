// The admin PC's side of hotel-network sync. Listens on the LAN only while this computer is
// the admin PC; serves pairing, change exchange and data snapshots to paired desks, and answers
// discovery broadcasts so desks can find it without typing an address.
const fs = require('fs');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const crypto = require('crypto');
const engine = require('./engine');
const sc = require('./crypto');
const logger = require('../lib/logger');

const PAIRING_TTL_MS = 10 * 60 * 1000;
const MAX_PAIRING_ATTEMPTS = 5;
const MAX_BODY_BYTES = 256 * 1024 * 1024;
const DISCOVER_MESSAGE = 'VVROOMS-DISCOVER';
// Desks check in every 30 s; one not heard from for this long is shown as offline.
const ONLINE_WINDOW_MS = 90 * 1000;
const RUN_TTL_MS = 10 * 60 * 1000;

class SyncError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new SyncError(413, 'Too much data in one sync'));
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (_err) {
        reject(new SyncError(400, 'Bad request'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {object} deps
 * @param {import('../db/database').Store} deps.store
 * @param {{ read: () => object, write: (patch: object) => object }} deps.config hub settings and paired devices
 * @param {object} deps.owner owner key service (license list, active keys)
 * @param {string} deps.tmpDir where snapshots are written briefly
 * @param {{ port: number, host: string, discoveryPort: number|null }} deps.network
 */
function createHub({ store, config, owner, tmpDir, network, clock = () => Date.now(), onActivity = () => {} }) {
  let server = null;
  let udp = null;
  let pairing = null;
  // Exchanges belonging to one desk sync session, keyed by the desk's run id.
  const runs = new Map();

  const devices = () => config.read().devices || [];
  const device = (node) => devices().find((d) => d.node === node);

  function updateDevice(node, patch) {
    config.write({ devices: devices().map((d) => (d.node === node ? { ...d, ...patch } : d)) });
  }

  function newPairingCode() {
    pairing = { code: sc.newPairingCode(), expiresAt: clock() + PAIRING_TTL_MS, attempts: 0 };
    return { code: pairing.code, expiresAt: new Date(pairing.expiresAt).toISOString() };
  }

  async function handlePair(body, remote) {
    if (!pairing || pairing.expiresAt < clock()) throw new SyncError(401, 'No pairing code is active on the admin PC. Show a new code there.');
    let request;
    const key = sc.pairingKey(pairing.code, String(body.salt || ''));
    try {
      request = sc.open(key, body.request, clock());
    } catch (_err) {
      pairing.attempts += 1;
      if (pairing.attempts >= MAX_PAIRING_ATTEMPTS) pairing = null;
      throw new SyncError(401, 'Wrong pairing code');
    }
    const cfg = config.read();
    const node = cfg.nextNode || 1;
    const secret = sc.newSecret();
    config.write({
      nextNode: node + 1,
      devices: [...devices(), {
        node, secret, label: String(request.label || `Desk ${node}`).slice(0, 60), machineCode: String(request.machineCode || ''),
        pairedAt: new Date(clock()).toISOString(), lastSeen: null, lastIp: remote, ackSeq: 0, appVersion: request.appVersion || ''
      }]
    });
    pairing = null;
    logger.info('Desk paired', { node, label: request.label });
    return sc.seal(key, { node, secret, hubId: cfg.hubId, hubName: cfg.name, schemaVersion: engine.SCHEMA_VERSION }, clock());
  }

  function openFromDevice(body) {
    const d = device(Number(body.node));
    if (!d) throw new SyncError(403, 'This desk has been removed from the admin PC. Pair it again.', { code: 'unpaired' });
    const key = sc.deriveKey(d.secret, 'exchange');
    try {
      return { d, key, payload: sc.open(key, body.envelope, clock()) };
    } catch (err) {
      throw new SyncError(401, err.message);
    }
  }

  function checkDesk(d, key, payload) {
    if (payload.schemaVersion !== engine.SCHEMA_VERSION) {
      const newer = payload.schemaVersion > engine.SCHEMA_VERSION ? 'the admin PC' : 'this desk';
      throw new SyncError(409, `The admin PC and this desk run different versions. Update ${newer}.`, { sealed: sc.seal(key, { error: 'version', hubSchema: engine.SCHEMA_VERSION }, clock()) });
    }
    if (owner.loaded && payload.licenseHash && !owner.activeHashes().has(payload.licenseHash)) {
      throw new SyncError(403, 'This desk\'s license has been removed.', { sealed: sc.seal(key, { error: 'revoked', list: owner.signedList() }, clock()) });
    }
  }

  /** A desk's heartbeat: marks it online and tells it whether the admin asked for a sync. */
  function handlePing(body, remote) {
    const { d, key, payload } = openFromDevice(body);
    checkDesk(d, key, payload);
    const syncNow = Boolean(d.syncRequested);
    updateDevice(d.node, { lastPing: new Date(clock()).toISOString(), lastIp: remote, appVersion: payload.appVersion || d.appVersion, syncRequested: false });
    return sc.seal(key, { syncNow, list: owner.signedList() }, clock());
  }

  /** Adds one exchange to its session and writes a history row when the session is complete. */
  function trackRun(d, payload, received, sent, more) {
    const id = String(payload.runId || '');
    const run = runs.get(id) || { started: clock(), sent: 0, received: 0, conflicts: 0 };
    run.received += received.applied;
    run.conflicts += received.conflicts;
    run.sent += sent;
    runs.set(id, run);
    if (payload.localMore || more) return;
    runs.delete(id);
    store.insert('sync_history', {
      at: new Date(clock()).toISOString(), node: d.node, label: d.label, trigger: String(payload.trigger || 'schedule').slice(0, 20),
      sent: run.sent, received: run.received, conflicts: run.conflicts, ok: 1, duration_ms: clock() - run.started
    });
    for (const [key, r] of runs) if (clock() - r.started > RUN_TTL_MS) runs.delete(key);
  }

  function handleExchange(body, remote) {
    const { d, key, payload } = openFromDevice(body);
    checkDesk(d, key, payload);
    onActivity(true);
    try {
      // Whatever the desk claims, its changes are recorded as coming from its own node.
      const incoming = (Array.isArray(payload.changes) ? payload.changes : []).map((c) => ({ ...c, origin: d.node }));
      const applied = engine.apply(store, incoming);
      const top = engine.maxSeq(store);
      const outgoing = engine.collect(store, { afterSeq: Number(payload.sinceHubSeq) || 0, exceptOrigin: d.node });
      const hubSeq = outgoing.more ? outgoing.lastSeq : top;
      updateDevice(d.node, { lastSeen: new Date(clock()).toISOString(), lastPing: new Date(clock()).toISOString(), lastIp: remote, ackSeq: Number(payload.sinceHubSeq) || 0, appVersion: payload.appVersion || d.appVersion });
      trackRun(d, payload, applied, outgoing.changes.length, outgoing.more);
      return sc.seal(key, { hubSeq, changes: outgoing.changes, more: outgoing.more, applied, list: owner.signedList(), hubTime: clock() }, clock());
    } finally {
      onActivity(false);
    }
  }

  function handleSnapshot(body) {
    const { d, key, payload } = openFromDevice(body);
    checkDesk(d, key, payload);
    const file = path.join(tmpDir, `snapshot-${crypto.randomBytes(6).toString('hex')}.db`);
    try {
      const hubSeq = engine.maxSeq(store);
      store.snapshotTo(file);
      return sc.seal(key, { hubSeq, data: fs.readFileSync(file).toString('base64') }, clock());
    } finally {
      fs.rmSync(file, { force: true });
    }
  }

  const ROUTES = { '/sync/pair': handlePair, '/sync/ping': handlePing, '/sync/exchange': handleExchange, '/sync/snapshot': handleSnapshot };

  async function onRequest(req, res) {
    const reply = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    const handler = req.method === 'POST' ? ROUTES[new URL(req.url, 'http://x').pathname] : null;
    if (!handler) return reply(404, { message: 'Not found' });
    try {
      const body = await readJson(req);
      reply(200, await handler(body, req.socket.remoteAddress?.replace(/^::ffff:/, '')));
    } catch (err) {
      if (!(err instanceof SyncError)) logger.error('Sync request failed', { error: err.stack || err.message });
      const status = err instanceof SyncError ? err.status : 500;
      reply(status, { message: status >= 500 ? 'The admin PC could not complete the sync' : err.message, ...(err.extra || {}) });
    }
  }

  function startDiscovery() {
    if (network.discoveryPort === null) return;
    udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udp.on('message', (msg, rinfo) => {
      if (msg.toString() !== DISCOVER_MESSAGE) return;
      const cfg = config.read();
      const answer = Buffer.from(JSON.stringify({ app: 'vv-rooms', hubId: cfg.hubId, name: cfg.name, port: server.address().port }));
      udp.send(answer, rinfo.port, rinfo.address);
    });
    udp.on('error', (err) => logger.warn('Sync discovery unavailable', { error: err.message }));
    udp.bind(network.discoveryPort);
  }

  function start() {
    if (server) return Promise.resolve(server.address().port);
    server = http.createServer(onRequest);
    server.requestTimeout = 5 * 60 * 1000;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(network.port, network.host, () => {
        startDiscovery();
        logger.info('Admin PC is listening for desks', { port: server.address().port });
        resolve(server.address().port);
      });
    });
  }

  function stop() {
    server?.close();
    server?.closeAllConnections?.();
    udp?.close();
    server = null;
    udp = null;
  }

  /** Asks one desk (or every desk) to sync at its next check-in, within about 30 seconds. False if no such desk. */
  function requestSync(node) {
    const list = devices();
    if (node !== undefined && !list.some((d) => d.node === node)) return false;
    config.write({ devices: list.map((d) => (node === undefined || d.node === node ? { ...d, syncRequested: true } : d)) });
    return true;
  }

  function removeDevice(node) {
    config.write({ devices: devices().filter((d) => d.node !== node) });
  }

  /** Drops change-log history every paired desk has already received. */
  function pruneLog() {
    const list = devices();
    const acked = list.length ? Math.min(...list.map((d) => d.ackSeq || 0)) : engine.maxSeq(store);
    engine.prune(store, acked);
  }

  return {
    start, stop, newPairingCode, removeDevice, requestSync, pruneLog,
    get port() {
      return server?.address()?.port ?? null;
    },
    devices: () => devices().map(({ secret, ...rest }) => ({
      ...rest, online: Boolean(rest.lastPing && clock() - Date.parse(rest.lastPing) < ONLINE_WINDOW_MS)
    }))
  };
}

module.exports = { createHub, DISCOVER_MESSAGE, SyncError };
