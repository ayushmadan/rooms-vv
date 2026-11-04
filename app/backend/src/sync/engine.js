// Moving changes between devices. Every write to a replicated table is logged in `changes`
// by trigger (db/sync-tables.js). A device sends the current state of each changed row; the
// receiver keeps whichever version is newer (time, then device number as tie-break).
const { SYNC_TABLES } = require('../db/sync-tables');
const { SCHEMA_VERSION } = require('../db/schema');

const BATCH_SIZE = 1500;

function maxSeq(store) {
  return store.get('SELECT COALESCE(MAX(seq), 0) AS seq FROM changes').seq;
}

function whereForKey(table) {
  const spec = SYNC_TABLES[table];
  if (spec.keyColumns) return { sql: spec.keyColumns.map((c) => `${c} = ?`).join(' AND '), params: (key) => key.split('|') };
  return { sql: `${spec.key} = ?`, params: (key) => [key] };
}

function readRow(store, table, key) {
  const where = whereForKey(table);
  return store.get(`SELECT * FROM ${table} WHERE ${where.sql}`, ...where.params(key));
}

/** JSON-safe row: binary columns become { $b64 }. */
function encodeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Uint8Array ? { $b64: Buffer.from(v).toString('base64') } : v]));
}

function decodeValue(v) {
  return v && typeof v === 'object' && typeof v.$b64 === 'string' ? Buffer.from(v.$b64, 'base64') : v;
}

/**
 * Changes after `afterSeq`, newest version of each row only.
 * @param {{ afterSeq: number, onlyOrigin?: number, exceptOrigin?: number, limit?: number }} filter
 * @returns {{ changes: object[], lastSeq: number, more: boolean }}
 */
function collect(store, { afterSeq, onlyOrigin, exceptOrigin, limit = BATCH_SIZE }) {
  const conditions = ['seq > ?'];
  const params = [afterSeq];
  if (onlyOrigin !== undefined) {
    conditions.push('origin = ?');
    params.push(onlyOrigin);
  }
  if (exceptOrigin !== undefined) {
    conditions.push('origin <> ?');
    params.push(exceptOrigin);
  }
  const entries = store.all(`SELECT seq, tbl, row_key, op, at, origin FROM changes WHERE ${conditions.join(' AND ')} ORDER BY seq LIMIT ?`, ...params, limit);
  const latest = new Map();
  for (const e of entries) latest.set(`${e.tbl}\u0000${e.row_key}`, e);
  const changes = [];
  for (const e of latest.values()) {
    if (!SYNC_TABLES[e.tbl]) continue;
    if (e.op === 'D') {
      changes.push({ tbl: e.tbl, key: e.row_key, op: 'D', at: e.at, origin: e.origin });
      continue;
    }
    const row = readRow(store, e.tbl, e.row_key);
    if (row) changes.push({ tbl: e.tbl, key: e.row_key, op: 'U', at: e.at, origin: e.origin, row: encodeRow(row) });
  }
  return { changes, lastSeq: entries.length ? entries[entries.length - 1].seq : afterSeq, more: entries.length === limit };
}

const columnCache = new WeakMap();
function columnsOf(store, table) {
  let byTable = columnCache.get(store.db);
  if (!byTable) columnCache.set(store.db, (byTable = new Map()));
  if (!byTable.has(table)) byTable.set(table, new Set(store.all(`PRAGMA table_info(${table})`).map((c) => c.name)));
  return byTable.get(table);
}

function isNewer(a, b) {
  return a.at > b.at || (a.at === b.at && a.origin > b.origin);
}

function setApplyContext(store, at, origin) {
  store.run("INSERT INTO sync_state (key, value) VALUES ('apply_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", at);
  store.run("INSERT INTO sync_state (key, value) VALUES ('origin', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(origin));
}

function clearApplyContext(store) {
  store.run("DELETE FROM sync_state WHERE key IN ('apply_at', 'origin')");
}

function applyOne(store, change) {
  const where = whereForKey(change.tbl);
  if (change.op === 'D') {
    store.run(`DELETE FROM ${change.tbl} WHERE ${where.sql}`, ...where.params(change.key));
    return;
  }
  const known = columnsOf(store, change.tbl);
  const columns = Object.keys(change.row).filter((c) => known.has(c));
  const spec = SYNC_TABLES[change.tbl];
  const target = spec.conflictTarget || 'id';
  const updates = columns.filter((c) => !target.split(',').map((t) => t.trim()).includes(c));
  store.run(
    `INSERT INTO ${change.tbl} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
     ON CONFLICT(${target}) DO ${updates.length ? `UPDATE SET ${updates.map((c) => `${c} = excluded.${c}`).join(', ')}` : 'NOTHING'}`,
    ...columns.map((c) => decodeValue(change.row[c]))
  );
}

/**
 * Applies changes from another device. Older versions than what this device holds are skipped;
 * re-applying the same change is harmless. Rows that break a uniqueness rule here are recorded
 * in sync_conflicts for the admin instead of failing the whole sync.
 */
function apply(store, changes, now = () => new Date().toISOString()) {
  const result = { applied: 0, skipped: 0, conflicts: 0 };
  if (!changes.length) return result;
  store.db.exec('PRAGMA foreign_keys = OFF');
  try {
    store.tx(() => {
      for (const change of changes) {
        if (!SYNC_TABLES[change.tbl] || typeof change.key !== 'string' || !['U', 'D'].includes(change.op)) {
          result.skipped += 1;
          continue;
        }
        const local = store.get('SELECT at, origin FROM changes WHERE tbl = ? AND row_key = ? ORDER BY seq DESC LIMIT 1', change.tbl, change.key);
        if (local && !isNewer(change, local)) {
          result.skipped += 1;
          continue;
        }
        setApplyContext(store, change.at, change.origin);
        try {
          applyOne(store, change);
          result.applied += 1;
        } catch (err) {
          result.conflicts += 1;
          store.insert('sync_conflicts', { at: now(), tbl: change.tbl, row_key: change.key, origin: change.origin, reason: String(err.message).slice(0, 300) });
        }
      }
      clearApplyContext(store);
    });
  } finally {
    store.db.exec('PRAGMA foreign_keys = ON');
  }
  return result;
}

/** Keeps the change log small, but always keeps each row's latest version for comparisons. */
function prune(store, uptoSeq) {
  store.run(
    `DELETE FROM changes WHERE seq <= ? AND seq NOT IN (SELECT MAX(seq) FROM changes GROUP BY tbl, row_key)`,
    uptoSeq
  );
}

module.exports = { collect, apply, prune, maxSeq, SCHEMA_VERSION, BATCH_SIZE };
