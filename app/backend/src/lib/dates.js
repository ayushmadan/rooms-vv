// Stay dates are calendar dates (YYYY-MM-DD) in the property's time zone.
// Event times (check-in at, payments, ...) are stored as UTC ISO strings.
const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isYmd(value) {
  if (typeof value !== 'string' || !YMD_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function ymdInZone(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(instant));
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function addDays(ymd, days) {
  const date = new Date(`${ymd}T00:00:00Z`);
  return new Date(date.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

function daysBetween(fromYmd, toYmd) {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / MS_PER_DAY);
}

/** Each night of a stay, identified by the date the night starts. */
function stayNights(checkIn, checkOut) {
  const count = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(checkIn, i));
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

/** Indian financial year label for a date, e.g. 2026-05-01 -> "26-27". */
function financialYear(ymd) {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  return `${String(startYear).slice(2)}-${String(startYear + 1).slice(2)}`;
}

function formatDisplayDate(ymd) {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', {
    timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatDisplayDateTime(iso, timeZone) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    timeZone, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true
  });
}

module.exports = {
  isYmd, ymdInZone, addDays, daysBetween, stayNights, rangesOverlap, financialYear, formatDisplayDate, formatDisplayDateTime
};
