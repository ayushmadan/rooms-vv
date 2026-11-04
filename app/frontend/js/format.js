// Display formatting. Money arrives from the server in paise.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function money(paise) {
  return inr.format((paise || 0) / 100);
}

export function rupees(paise) {
  return ((paise || 0) / 100).toFixed(2).replace(/\.00$/, '');
}

export function toPaise(value) {
  return Math.round(Number(value || 0) * 100);
}

const MS_PER_DAY = 86_400_000;

export function addDays(ymd, days) {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / MS_PER_DAY);
}

export function weekday(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function date(ymd, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!ymd) return '—';
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts });
}

export function shortDate(ymd) {
  return date(ymd, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function longDate(ymd) {
  return date(ymd, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

let timeZone = 'Asia/Kolkata';
export function setTimeZone(tz) {
  timeZone = tz;
}

export function dateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { timeZone, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Value for <input type="datetime-local"> showing an instant in the property time zone. */
export function localInputValue(iso = new Date().toISOString()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Converts a datetime-local value in the property time zone back to an ISO instant. */
export function fromLocalInput(value) {
  if (!value) return undefined;
  const guess = Date.parse(`${value}:00Z`);
  const shown = localInputValue(new Date(guess).toISOString());
  const drift = Date.parse(`${shown}:00Z`) - guess;
  return new Date(guess - drift).toISOString();
}

export const LABELS = {
  status: { BOOKED: 'Booked', CHECKED_IN: 'In house', CHECKED_OUT: 'Departed', CANCELLED: 'Cancelled', NO_SHOW: 'No-show' },
  hk: { CLEAN: 'Clean', DIRTY: 'Needs cleaning', OUT_OF_ORDER: 'Out of order' },
  mode: { CASH: 'Cash', UPI: 'UPI', CREDIT_CARD: 'Credit card', DEBIT_CARD: 'Debit card', BANK_TRANSFER: 'Bank transfer' },
  kind: { ADVANCE: 'Advance', PAYMENT: 'Payment', REFUND: 'Refund' },
  category: { ROOM: 'Room', HALL: 'Hall', FOOD: 'Food', SERVICE: 'Service', OTHER: 'Other' },
  order: { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', ROOM_SERVICE: 'Room service' },
  orderStatus: { OPEN: 'Open', SETTLED: 'Paid', POSTED: 'On room bill', CANCELLED: 'Cancelled' }
};

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
