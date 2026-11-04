// Data migrations: one-off steps that transform existing records when an update needs more
// than a schema change (schema changes live in schema.js). They run in order at start-up,
// once per device, and are recorded in sync_state so they never repeat. Append only.
const logger = require('../lib/logger');

const STEPS = [
  {
    id: '2026-11-seal-identity-data',
    // Encrypt ID numbers and photos stored in plain text by versions before 3.0.
    run: (store) => require('../services/vault').sealPlaintext(store)
  },
  {
    id: '2026-11-start-change-log',
    // Devices upgraded to sync: rows that existed before the change log have no version yet.
    // Record one now so the first exchange with the admin PC compares them correctly.
    run: (store) => {
      const { SYNC_TABLES, keyExpression } = require('./sync-tables');
      for (const [table, spec] of Object.entries(SYNC_TABLES)) {
        const rowKey = `CAST(${keyExpression(table, 't')} AS TEXT)`;
        const skip = spec.skipKeys ? `AND t.key NOT IN (${spec.skipKeys.map((k) => `'${k}'`).join(', ')})` : '';
        store.run(
          `INSERT INTO changes (tbl, row_key, op, at, origin)
           SELECT '${table}', ${rowKey}, 'U', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), 0 FROM ${table} t
           WHERE NOT EXISTS (SELECT 1 FROM changes c WHERE c.tbl = '${table}' AND c.row_key = ${rowKey}) ${skip}`
        );
      }
    }
  }
];

function applied(store) {
  const row = store.get("SELECT value FROM sync_state WHERE key = 'data_migrations'");
  return new Set(row ? JSON.parse(row.value) : []);
}

/** Runs pending steps; each step and its record commit together. */
function runDataMigrations(store) {
  const done = applied(store);
  for (const step of STEPS) {
    if (done.has(step.id)) continue;
    store.tx(() => {
      step.run(store);
      done.add(step.id);
      store.run(
        "INSERT INTO sync_state (key, value) VALUES ('data_migrations', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        JSON.stringify([...done])
      );
    });
    logger.info('Data migration applied', { id: step.id });
  }
}

module.exports = { runDataMigrations, STEPS };
