// Whole-property data files (.vvdata): a consistent SQLite snapshot that holds
// every record and every ID photo, so one file moves a hotel to a new computer.
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { APPLICATION_ID, SCHEMA_VERSION } = require('../db/database');
const { badRequest, HttpError } = require('../lib/http');
const { ymdInZone } = require('../lib/dates');
const settings = require('./settings');
const audit = require('./audit');

const EXTENSION = '.vvdata';
const REQUIRED_TABLES = ['settings', 'units', 'guests', 'bookings', 'payments', 'invoices'];
const SAFE_NAME = /^[\w.-]+\.vvdata$/;

function timestampForFile(iso) {
  return iso.replace(/[:]/g, '-').replace(/\..+$/, '');
}

/** Writes a snapshot of the live data to destPath and stamps it with metadata. */
function writeSnapshot(ctx, destPath, kind) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmp = `${destPath}.partial`;
  ctx.store.snapshotTo(tmp);
  const snap = new DatabaseSync(tmp);
  try {
    snap.prepare("INSERT INTO settings (key, value) VALUES ('backup_meta', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify({ exportedAt: ctx.now(), kind, appVersion: ctx.appVersion, by: ctx.actor }));
  } finally {
    snap.close();
  }
  fs.renameSync(tmp, destPath);
  return destPath;
}

/** Opens a candidate data file read-only and checks it is a healthy Rooms file. */
function inspect(filePath) {
  let db;
  try {
    db = new DatabaseSync(filePath, { readOnly: true });
  } catch (err) {
    throw badRequest('This is not a Rooms data file', { cause: err });
  }
  try {
    const appId = db.prepare('PRAGMA application_id').get().application_id;
    if (appId !== APPLICATION_ID) throw badRequest('This file is not a Rooms data file');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > SCHEMA_VERSION) throw badRequest('This file was made by a newer version of the app. Update this computer first.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length) throw badRequest(`Data file is incomplete (missing ${missing.join(', ')})`);
    const integrity = db.prepare('PRAGMA quick_check').get();
    if (Object.values(integrity)[0] !== 'ok') throw badRequest('Data file is damaged and cannot be imported');

    const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
    const metaRow = db.prepare("SELECT value FROM settings WHERE key = 'backup_meta'").get();
    const propertyRow = db.prepare("SELECT value FROM settings WHERE key = 'property'").get();
    const lastBooking = db.prepare('SELECT MAX(created_at) AS at FROM bookings').get().at;
    return {
      schemaVersion: version,
      meta: metaRow ? JSON.parse(metaRow.value) : null,
      propertyName: propertyRow ? JSON.parse(propertyRow.value).name : '',
      counts: { guests: count('guests'), bookings: count('bookings'), invoices: count('invoices'), payments: count('payments') },
      lastBookingAt: lastBooking
    };
  } catch (err) {
    // SQLite reports a non-database file only when it is first read.
    if (err instanceof HttpError) throw err;
    throw badRequest('This is not a Rooms data file', { cause: err });
  } finally {
    db.close();
  }
}

function createService({ dataDir }) {
  const backupsDir = path.join(dataDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  function exportToTemp(ctx) {
    const file = path.join(dataDir, 'tmp', `export-${timestampForFile(ctx.now())}${EXTENSION}`);
    writeSnapshot(ctx, file, 'export');
    audit.record(ctx, 'data.export', 'data', null);
    return file;
  }

  /** Replaces all data with the given file. A safety backup of current data is taken first. */
  function importFile(ctx, filePath) {
    const summary = inspect(filePath);
    const safety = path.join(backupsDir, `before-import-${timestampForFile(ctx.now())}${EXTENSION}`);
    writeSnapshot(ctx, safety, 'before-import');
    ctx.store.replaceWith(filePath);
    audit.record(ctx, 'data.import', 'data', null, `${summary.counts.bookings} bookings`);
    return { ...summary, safetyBackup: path.basename(safety) };
  }

  function list() {
    return fs
      .readdirSync(backupsDir)
      .filter((name) => SAFE_NAME.test(name))
      .map((name) => {
        const stat = fs.statSync(path.join(backupsDir, name));
        return { name, size: stat.size, modifiedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }

  function resolve(name) {
    if (!SAFE_NAME.test(String(name))) throw badRequest('Invalid backup name');
    const file = path.join(backupsDir, name);
    if (!fs.existsSync(file)) throw badRequest('Backup not found');
    return file;
  }

  /** Daily automatic backup, pruned to keepDays, optionally mirrored to another folder (USB, synced drive). */
  function runAutoBackup(ctx) {
    const { folder, keepDays } = settings.getSection(ctx.store, 'backup');
    const { timeZone } = settings.getSection(ctx.store, 'policy');
    const today = ymdInZone(ctx.now(), timeZone);
    const name = `auto-${today}${EXTENSION}`;
    const file = path.join(backupsDir, name);
    const result = { created: false, mirrored: false, mirrorError: '' };
    if (!fs.existsSync(file)) {
      writeSnapshot(ctx, file, 'auto');
      result.created = true;
    }
    if (folder) {
      try {
        fs.mkdirSync(folder, { recursive: true });
        fs.copyFileSync(file, path.join(folder, name));
        result.mirrored = true;
      } catch (err) {
        result.mirrorError = `Could not copy backup to ${folder}: ${err.code || err.message}`;
      }
    }
    const cutoff = Date.parse(ctx.now()) - keepDays * 24 * 60 * 60 * 1000;
    for (const entry of list()) {
      if (entry.name.startsWith('auto-') && Date.parse(entry.modifiedAt) < cutoff) fs.unlinkSync(path.join(backupsDir, entry.name));
    }
    return result;
  }

  function backupNow(ctx) {
    const name = `manual-${timestampForFile(ctx.now())}${EXTENSION}`;
    writeSnapshot(ctx, path.join(backupsDir, name), 'manual');
    audit.record(ctx, 'data.backup', 'data', null, name);
    return { name };
  }

  return { backupsDir, exportToTemp, importFile, inspect, list, resolve, runAutoBackup, backupNow };
}

module.exports = { createService, inspect, EXTENSION };
