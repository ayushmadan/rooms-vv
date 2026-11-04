const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { MIGRATIONS, APPLICATION_ID, SCHEMA_VERSION } = require('./schema');
const { ID_TABLES, ID_RANGE } = require('./sync-tables');

function openDatabase(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Data file was created by a newer version of the app (schema ${current} > ${SCHEMA_VERSION}). Please update the app.`);
  }
  for (let version = current; version < SCHEMA_VERSION; version += 1) {
    runInTransaction(db, () => {
      db.exec(MIGRATIONS[version]);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
  db.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
}

function runInTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/**
 * Owns the live connection so a data import can swap the underlying file
 * without every service holding a stale handle.
 */
class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.db = openDatabase(filePath);
    this.runDataMigrations();
  }

  /** One-off data steps for the current version (schema steps already ran in openDatabase). */
  runDataMigrations() {
    // Required lazily: the steps use services that themselves depend on the store.
    require('./data-migrations').runDataMigrations(this);
  }

  /** Runs fn atomically; nested calls join the outer transaction. */
  tx(fn) {
    if (this.db.isTransaction) return fn();
    return runInTransaction(this.db, fn);
  }

  all(sql, ...params) {
    return this.db.prepare(sql).all(...params);
  }

  get(sql, ...params) {
    return this.db.prepare(sql).get(...params);
  }

  run(sql, ...params) {
    return this.db.prepare(sql).run(...params);
  }

  /** This device's number on the hotel network: 0 for the admin PC or a standalone install. */
  get nodeId() {
    const row = this.db.prepare("SELECT value FROM sync_state WHERE key = 'node'").get();
    return Number(row?.value || 0);
  }

  setNodeId(node) {
    this.db.prepare("INSERT INTO sync_state (key, value) VALUES ('node', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(node));
  }

  /** Next id in this device's block (see ID_RANGE), so rows from different devices never collide. */
  nextId(table) {
    const base = this.nodeId * ID_RANGE;
    const row = this.db.prepare(`SELECT MAX(id) AS max FROM ${table} WHERE id > ? AND id <= ?`).get(base, base + ID_RANGE);
    return (row.max ?? base) + 1;
  }

  /** Inserts a row from an object and returns the new id. */
  insert(table, row) {
    if (ID_TABLES.has(table) && row.id === undefined) row = { id: this.nextId(table), ...row };
    const columns = Object.keys(row);
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    return Number(this.db.prepare(sql).run(...columns.map((c) => row[c])).lastInsertRowid);
  }

  /** Updates columns of one row by id. Column names come from code, never from request keys. */
  update(table, id, changes) {
    const columns = Object.keys(changes);
    if (!columns.length) return;
    const sql = `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...columns.map((c) => changes[c]), id);
  }

  /** Writes a consistent single-file snapshot of the live database. */
  snapshotTo(destPath) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    this.db.prepare('VACUUM INTO ?').run(destPath);
  }

  /** Replaces the live data file with sourcePath, then reopens and migrates it. */
  replaceWith(sourcePath) {
    this.close();
    for (const suffix of ['-wal', '-shm']) {
      if (fs.existsSync(this.filePath + suffix)) fs.unlinkSync(this.filePath + suffix);
    }
    fs.copyFileSync(sourcePath, this.filePath);
    this.db = openDatabase(this.filePath);
    this.runDataMigrations();
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }
}

module.exports = { Store, openDatabase, SCHEMA_VERSION, APPLICATION_ID };
