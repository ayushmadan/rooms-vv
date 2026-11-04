const { financialYear } = require('../lib/dates');

/** Atomically increments and returns a named counter. Counters are local to each device. */
function next(store, key) {
  store.run('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key);
  return store.get('SELECT value FROM counters WHERE key = ?', key).value;
}

function compactDate(ymd) {
  return ymd.replace(/-/g, '').slice(2);
}

/**
 * Front desks on the hotel network number documents in their own series so two desks never
 * issue the same code: the admin PC (node 0) keeps the plain series, desk 2 uses VV2-…, VV-D2/….
 */
function series(store) {
  const node = store.nodeId;
  return { node, tag: node ? String(node) : '', key: node ? `@${node}` : '' };
}

function bookingCode(store, prefix, checkInYmd) {
  const day = compactDate(checkInYmd);
  const s = series(store);
  return `${prefix}${s.tag}-${day}-${String(next(store, `booking${s.key}:${day}`)).padStart(4, '0')}`;
}

function orderCode(store, todayYmd) {
  const day = compactDate(todayYmd);
  const s = series(store);
  return `R${s.tag}-${day}-${String(next(store, `order${s.key}:${day}`)).padStart(3, '0')}`;
}

function kotNumber(store, todayYmd) {
  return next(store, `kot:${todayYmd}`);
}

/** GST invoices are numbered consecutively within a financial year, one series per billing counter. */
function invoiceNumber(store, prefix, todayYmd) {
  const fy = financialYear(todayYmd);
  const s = series(store);
  return `${prefix}${s.node ? `-D${s.node}` : ''}/${fy}/${String(next(store, `invoice${s.key}:${fy}`)).padStart(4, '0')}`;
}

module.exports = { next, bookingCode, orderCode, kotNumber, invoiceNumber };
