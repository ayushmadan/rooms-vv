// Tables replicated between the admin PC and front desks, and how each row is identified.
// Anything not listed (counters, the change log itself) stays local to one computer.
const SYNC_TABLES = {
  settings: { key: 'key', conflictTarget: 'key', skipKeys: ['backup', 'backup_meta'] },
  files: { key: 'id' },
  units: { key: 'id' },
  rate_overrides: { key: "unit_id || '|' || date", conflictTarget: 'unit_id, date', keyColumns: ['unit_id', 'date'] },
  meal_rate_overrides: { key: 'date', conflictTarget: 'date' },
  guests: { key: 'id' },
  bookings: { key: 'id' },
  declarations: { key: 'id' },
  charges: { key: 'id' },
  payments: { key: 'id' },
  invoices: { key: 'id' },
  menu_items: { key: 'id' },
  dining_tables: { key: 'id' },
  orders: { key: 'id' },
  order_items: { key: 'id' },
  expenses: { key: 'id' },
  housekeeping_log: { key: 'id' },
  audit_log: { key: 'id' }
};

/** Tables whose integer ids are allocated per device so rows never collide. */
const ID_TABLES = new Set(Object.entries(SYNC_TABLES).filter(([, t]) => t.key === 'id').map(([name]) => name));

/** Each device numbers its rows in its own block: device n uses ids n*RANGE+1 … (n+1)*RANGE. */
const ID_RANGE = 1e12;

function keyExpression(table, rowAlias) {
  const spec = SYNC_TABLES[table];
  return spec.key.replace(/\b(id|key|unit_id|date)\b/g, (col) => `${rowAlias}.${col}`);
}

/** SQL for the change-log triggers (insert, update, delete) on every replicated table. */
function triggerSql() {
  const at = "COALESCE((SELECT value FROM sync_state WHERE key = 'apply_at'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";
  const origin = "CAST(COALESCE((SELECT value FROM sync_state WHERE key = 'origin'), (SELECT value FROM sync_state WHERE key = 'node'), '0') AS INTEGER)";
  return Object.entries(SYNC_TABLES).map(([table, spec]) => {
    const skip = (alias) => (spec.skipKeys ? ` WHEN ${alias}.key NOT IN (${spec.skipKeys.map((k) => `'${k}'`).join(', ')})` : '');
    const log = (alias, op) => `INSERT INTO changes (tbl, row_key, op, at, origin) VALUES ('${table}', CAST(${keyExpression(table, alias)} AS TEXT), '${op}', ${at}, ${origin});`;
    return `
    CREATE TRIGGER sync_${table}_ins AFTER INSERT ON ${table}${skip('NEW')} BEGIN ${log('NEW', 'U')} END;
    CREATE TRIGGER sync_${table}_upd AFTER UPDATE ON ${table}${skip('NEW')} BEGIN ${log('NEW', 'U')} END;
    CREATE TRIGGER sync_${table}_del AFTER DELETE ON ${table}${skip('OLD')} BEGIN ${log('OLD', 'D')} END;`;
  }).join('\n');
}

module.exports = { SYNC_TABLES, ID_TABLES, ID_RANGE, triggerSql, keyExpression };
