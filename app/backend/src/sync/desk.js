// A front desk's side of hotel-network sync: find the admin PC, pair once, take a copy of the
// hotel's data, then exchange changes. No internet is used.
const fs = require('fs');
const os = require('os');
const path = require('path');
const dgram = require('dgram');
const crypto = require('crypto');
const engine = require('./engine');
const sc = require('./crypto');
const { DISCOVER_MESSAGE } = require('./hub');

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ROUNDS = 50;

class DeskSyncError extends Error {
  constructor(message, code, options) {
    super(message, options);
    this.code = code;
  }
}

function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = a.address.split('.').map(Number);
      const mask = a.netmask.split('.').map(Number);
      out.add(ip.map((part, i) => (part | (~mask[i] & 255))).join('.'));
    }
  }
  return [...out];
}

/** Broadcasts on the local network and collects the admin PCs that answer. */
function discover({ port, timeoutMs = 2500 }) {
  return new Promise((resolve) => {
    const found = new Map();
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      try {
        const info = JSON.parse(msg.toString());
        if (info.app === 'vv-rooms') found.set(info.hubId, { hubId: info.hubId, name: info.name, address: `${rinfo.address}:${info.port}` });
      } catch (_err) {
        // Not one of ours.
      }
    });
    socket.on('error', () => resolve([...found.values()]));
    socket.bind(0, () => {
      socket.setBroadcast(true);
      for (const address of broadcastAddresses()) socket.send(DISCOVER_MESSAGE, port, address);
    });
    setTimeout(() => {
      socket.close();
      resolve([...found.values()]);
    }, timeoutMs);
  });
}

/**
 * @param {object} deps
 * @param {{ read, write }} deps.config this desk's link to the admin PC
 * @param {object} deps.license so the admin PC can confirm or revoke this desk's key
 * @param {(file: string) => void} deps.adoptSnapshot replaces local data with the admin PC's (after a backup)
 */
function createDesk({ store, config, license, adoptSnapshot, tmpDir, appVersion, discoveryPort, clock = () => Date.now(), fetchImpl = fetch }) {
  async function post(address, route, body) {
    let res;
    try {
      res = await fetchImpl(`http://${address}${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (err) {
      throw new DeskSyncError('The admin PC is not reachable on the network', 'unreachable', { cause: err });
    }
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async function pair({ address, code, label }) {
    const salt = crypto.randomBytes(16).toString('hex');
    const key = sc.pairingKey(code, salt);
    const request = sc.seal(key, { machineCode: license.status.machineCode, label, appVersion }, clock());
    const res = await post(address, '/sync/pair', { salt, request });
    if (!res.ok) throw new DeskSyncError(res.data.message || 'Pairing failed', 'pair');
    const answer = sc.open(key, res.data, clock());
    if (answer.schemaVersion !== engine.SCHEMA_VERSION) {
      throw new DeskSyncError('The admin PC runs a different version. Update both computers to the same version, then pair again.', 'version');
    }
    config.write({ role: 'desk', hubId: answer.hubId, hubName: answer.hubName, hubAddress: address, node: answer.node, secret: answer.secret, lastHubSeq: 0, lastSentSeq: 0, pairedAt: new Date(clock()).toISOString() });
    await takeSnapshot();
    return config.read();
  }

  function envelopeFor(cfg, value) {
    return { node: cfg.node, envelope: sc.seal(sc.deriveKey(cfg.secret, 'exchange'), value, clock()) };
  }

  /** Handles a refusal from the admin PC; licence lists in a refusal are applied first. */
  function refusal(cfg, res) {
    if (res.data.code === 'unpaired') {
      config.write({ role: 'standalone', unpairedAt: new Date(clock()).toISOString() });
      return new DeskSyncError(res.data.message, 'unpaired');
    }
    if (res.data.sealed) {
      try {
        const info = sc.open(sc.deriveKey(cfg.secret, 'exchange'), res.data.sealed, clock());
        if (info.list) license.applyList(info.list);
        if (info.error) return new DeskSyncError(res.data.message, info.error);
      } catch (_err) {
        // Fall through to the plain message.
      }
    }
    return new DeskSyncError(res.data.message || `The admin PC refused the sync (${res.status})`, 'refused');
  }

  async function takeSnapshot() {
    const cfg = config.read();
    const res = await post(cfg.hubAddress, '/sync/snapshot', envelopeFor(cfg, { schemaVersion: engine.SCHEMA_VERSION, licenseHash: license.keyHash() }));
    if (!res.ok) throw refusal(cfg, res);
    const { hubSeq, data } = sc.open(sc.deriveKey(cfg.secret, 'exchange'), res.data, clock());
    const file = path.join(tmpDir, `from-admin-${crypto.randomBytes(6).toString('hex')}.db`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    try {
      adoptSnapshot(file);
    } finally {
      fs.rmSync(file, { force: true });
    }
    store.setNodeId(cfg.node);
    config.write({ lastHubSeq: hubSeq, lastSentSeq: engine.maxSeq(store) });
  }

  /** Finds the admin PC again if its network address changed (e.g. a new DHCP lease). */
  async function relocate(cfg) {
    if (discoveryPort === null) return false;
    const hubs = await discover({ port: discoveryPort });
    const match = hubs.find((h) => h.hubId === cfg.hubId);
    if (!match || match.address === cfg.hubAddress) return false;
    config.write({ hubAddress: match.address });
    return true;
  }

  /** Heartbeat: tells the admin PC this desk is online; returns true if the admin asked for a sync. */
  async function ping() {
    const cfg = config.read();
    if (cfg.role !== 'desk') return false;
    const res = await post(cfg.hubAddress, '/sync/ping', envelopeFor(cfg, { schemaVersion: engine.SCHEMA_VERSION, appVersion, licenseHash: license.keyHash() }));
    if (!res.ok) throw refusal(cfg, res);
    const answer = sc.open(sc.deriveKey(cfg.secret, 'exchange'), res.data, clock());
    if (answer.list) license.applyList(answer.list);
    return Boolean(answer.syncNow);
  }

  /** One full exchange: send this desk's changes, receive everyone else's, until both sides are current. */
  async function syncOnce({ trigger = 'schedule' } = {}) {
    let cfg = config.read();
    if (cfg.role !== 'desk') throw new DeskSyncError('This computer is not connected to an admin PC', 'not-paired');
    const totals = { sent: 0, received: 0, conflicts: 0 };
    const runId = crypto.randomBytes(8).toString('hex');
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const local = engine.collect(store, { afterSeq: cfg.lastSentSeq || 0, onlyOrigin: cfg.node });
      const body = envelopeFor(cfg, {
        schemaVersion: engine.SCHEMA_VERSION, appVersion, sinceHubSeq: cfg.lastHubSeq || 0, changes: local.changes, licenseHash: license.keyHash(),
        runId, trigger, localMore: local.more
      });
      let res;
      try {
        res = await post(cfg.hubAddress, '/sync/exchange', body);
      } catch (err) {
        if (round === 0 && await relocate(cfg)) {
          cfg = config.read();
          round -= 1;
          continue;
        }
        throw err;
      }
      if (!res.ok) throw refusal(cfg, res);
      const answer = sc.open(sc.deriveKey(cfg.secret, 'exchange'), res.data, clock());
      const applied = engine.apply(store, answer.changes || []);
      if (answer.list) license.applyList(answer.list);
      totals.sent += local.changes.length;
      totals.received += applied.applied;
      totals.conflicts += applied.conflicts + (answer.applied?.conflicts || 0);
      cfg = config.write({ lastSentSeq: local.lastSeq, lastHubSeq: answer.hubSeq, lastSyncAt: new Date(clock()).toISOString(), clockSkewMs: answer.hubTime ? answer.hubTime - clock() : 0 });
      if (!local.more && !answer.more) break;
    }
    engine.prune(store, cfg.lastSentSeq || 0);
    return totals;
  }

  function disconnect() {
    config.write({ role: 'standalone', secret: null, hubAddress: null, unpairedAt: new Date(clock()).toISOString() });
  }

  return { pair, syncOnce, ping, disconnect, discover: () => (discoveryPort === null ? Promise.resolve([]) : discover({ port: discoveryPort })) };
}

module.exports = { createDesk, discover, DeskSyncError };
