const IST_TZ = 'Asia/Kolkata';

function formatIstYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(date));
  const map = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function toDateOnly(value) {
  const ymd = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : formatIstYmd(value);
  return new Date(`${ymd}T00:00:00+05:30`);
}

function parseIstCheckIn(dateStr) {
  return new Date(`${dateStr}T12:00:00+05:30`);
}

function parseIstCheckOut(dateStr) {
  return new Date(`${dateStr}T11:00:00+05:30`);
}

function isPastDate(value) {
  const given = toDateOnly(value).getTime();
  const today = toDateOnly(new Date()).getTime();
  return given < today;
}

function formatYmd(date = new Date()) {
  return formatIstYmd(date);
}

function formatIstDateTime(value) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value));
}

module.exports = { toDateOnly, isPastDate, formatYmd, formatIstYmd, parseIstCheckIn, parseIstCheckOut, formatIstDateTime };
