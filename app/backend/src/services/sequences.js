const { financialYear } = require('../lib/dates');

/** Atomically increments and returns a named counter. */
function next(store, key) {
  store.run('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1', key);
  return store.get('SELECT value FROM counters WHERE key = ?', key).value;
}

function compactDate(ymd) {
  return ymd.replace(/-/g, '').slice(2);
}

function bookingCode(store, prefix, checkInYmd) {
  const day = compactDate(checkInYmd);
  return `${prefix}-${day}-${String(next(store, `booking:${day}`)).padStart(4, '0')}`;
}

function orderCode(store, todayYmd) {
  const day = compactDate(todayYmd);
  return `R-${day}-${String(next(store, `order:${day}`)).padStart(3, '0')}`;
}

function kotNumber(store, todayYmd) {
  return next(store, `kot:${todayYmd}`);
}

/** GST invoices must be numbered consecutively within a financial year. */
function invoiceNumber(store, prefix, todayYmd) {
  const fy = financialYear(todayYmd);
  return `${prefix}/${fy}/${String(next(store, `invoice:${fy}`)).padStart(4, '0')}`;
}

module.exports = { next, bookingCode, orderCode, kotNumber, invoiceNumber };
