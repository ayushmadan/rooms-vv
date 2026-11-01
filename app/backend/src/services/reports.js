const v = require('../lib/validate');
const { badRequest } = require('../lib/http');
const { ymdInZone, daysBetween, addDays } = require('../lib/dates');
const folio = require('./folio');
const settings = require('./settings');
const vault = require('./vault');

const MAX_REPORT_DAYS = 400;

function parseRange(query) {
  const from = v.ymd(query.from, 'From');
  const to = v.ymd(query.to, 'To');
  if (to < from) throw badRequest('To date must be on or after from date');
  if (daysBetween(from, to) > MAX_REPORT_DAYS) throw badRequest(`Choose a range of at most ${MAX_REPORT_DAYS} days`);
  return { from, to };
}

/** UTC bounds of a range of local dates, for filtering stored UTC instants. */
function instantBounds(store, from, to) {
  const { timeZone } = settings.getSection(store, 'policy');
  // Widen by a day each side, then filter exactly by converting to local date.
  return { start: `${addDays(from, -1)}T00:00:00.000Z`, end: `${addDays(to, 1)}T23:59:59.999Z`, timeZone };
}

function paymentsInRange(store, from, to) {
  const { start, end, timeZone } = instantBounds(store, from, to);
  return store
    .all(
      `SELECT p.*, b.code AS booking_code, o.code AS order_code FROM payments p
       LEFT JOIN bookings b ON b.id = p.booking_id LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.voided_at IS NULL AND p.received_at >= ? AND p.received_at <= ? ORDER BY p.received_at`,
      start, end
    )
    .map((p) => ({ ...p, localDate: ymdInZone(p.received_at, timeZone) }))
    .filter((p) => p.localDate >= from && p.localDate <= to);
}

function sumByMode(payments) {
  const byMode = {};
  for (const p of payments) byMode[p.mode] = (byMode[p.mode] || 0) + (p.kind === 'REFUND' ? -p.amount : p.amount);
  return byMode;
}

/** End-of-day summary for the front desk and owner. */
function daily(store, query) {
  const date = v.ymd(query.date, 'Date');
  const roomCount = store.get("SELECT COUNT(*) AS n FROM units WHERE active = 1 AND kind = 'ROOM'").n;
  const stayRow = `SELECT b.id, b.code, b.unit_id, b.check_in, b.check_out, b.status, b.adults, b.children, u.name AS unit, u.kind, g.full_name AS guest, g.phone
    FROM bookings b JOIN units u ON u.id = b.unit_id JOIN guests g ON g.id = b.guest_id`;
  const arrivals = store.all(`${stayRow} WHERE b.check_in = ? AND b.status IN ('BOOKED','CHECKED_IN','CHECKED_OUT') ORDER BY u.sort`, date);
  const departures = store.all(`${stayRow} WHERE b.check_out = ? AND b.status IN ('CHECKED_IN','CHECKED_OUT') ORDER BY u.sort`, date);
  const inHouse = store.all(`${stayRow} WHERE b.check_in <= ? AND ? < b.check_out AND b.status IN ('CHECKED_IN','CHECKED_OUT') ORDER BY u.sort`, date, date);
  const occupiedRooms = inHouse.filter((s) => s.kind === 'ROOM').length;

  // Revenue earned for this night: each stay's room and meal amount for the date.
  let roomRevenue = 0;
  let mealRevenue = 0;
  for (const stay of inHouse) {
    const booking = store.get('SELECT * FROM bookings WHERE id = ?', stay.id);
    const unit = store.get('SELECT * FROM units WHERE id = ?', booking.unit_id);
    const night = folio.stayPricing(store, booking, unit).nights.find((n) => n.date === date);
    if (night) {
      roomRevenue += night.rent;
      mealRevenue += night.mealAmount;
    }
  }

  const payments = paymentsInRange(store, date, date);
  const { start, end, timeZone } = instantBounds(store, date, date);
  const restaurantOrders = store
    .all("SELECT total, issued_at FROM invoices WHERE order_id IS NOT NULL AND status = 'ISSUED' AND issued_at >= ? AND issued_at <= ?", start, end)
    .filter((i) => ymdInZone(i.issued_at, timeZone) === date);
  const postedToRooms = store.get("SELECT COALESCE(SUM(amount), 0) AS total FROM charges WHERE order_id IS NOT NULL AND voided_at IS NULL AND date = ?", date).total;
  const expenses = store.all('SELECT * FROM expenses WHERE date = ? AND voided_at IS NULL ORDER BY id', date);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const collections = sumByMode(payments);
  const collectionTotal = Object.values(collections).reduce((s, x) => s + x, 0);
  const cashIn = collections.CASH || 0;
  const cashOut = expenses.filter((e) => e.mode === 'CASH').reduce((s, e) => s + e.amount, 0);

  return {
    date,
    rooms: { total: roomCount, occupied: occupiedRooms, occupancyPercent: roomCount ? Math.round((occupiedRooms / roomCount) * 100) : 0 },
    arrivals, departures, inHouse,
    revenue: {
      room: roomRevenue,
      meals: mealRevenue,
      restaurant: restaurantOrders.reduce((s, i) => s + i.total, 0),
      restaurantBills: restaurantOrders.length,
      postedToRooms
    },
    collections, collectionTotal,
    payments: payments.map((p) => ({ at: p.received_at, kind: p.kind, mode: p.mode, amount: p.amount, ref: p.booking_code || p.order_code, note: p.note, by: p.created_by })),
    expenses: expenses.map((e) => ({ category: e.category, description: e.description, amount: e.amount, mode: e.mode, paidTo: e.paid_to })),
    expenseTotal,
    cash: { in: cashIn, out: cashOut, net: cashIn - cashOut }
  };
}

const MODE_NAMES = { CASH: 'Cash', UPI: 'UPI', CREDIT_CARD: 'Credit card', DEBIT_CARD: 'Debit card', BANK_TRANSFER: 'Bank transfer' };

/** Plain-text day summary for an email body (compose links cannot carry attachments). */
function dailyEmail(store, query) {
  const r = daily(store, query);
  const property = settings.getSection(store, 'property');
  const { email } = settings.getSection(store, 'reports');
  const inr = (p) => `Rs ${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const list = (rows) => (rows.length ? rows.map((s) => `  - ${s.unit}: ${s.guest} (${s.code})`).join('\n') : '  - none');
  const lines = [
    `${property.name} - day report for ${r.date}`,
    '',
    `Occupancy: ${r.rooms.occupancyPercent}% (${r.rooms.occupied} of ${r.rooms.total} rooms)`,
    `Room revenue: ${inr(r.revenue.room)}`,
    `Meals: ${inr(r.revenue.meals)}`,
    `Restaurant: ${inr(r.revenue.restaurant + r.revenue.postedToRooms)} (${r.revenue.restaurantBills} bills)`,
    '',
    `Collected: ${inr(r.collectionTotal)}`,
    ...Object.entries(r.collections).map(([mode, amount]) => `  - ${MODE_NAMES[mode]}: ${inr(amount)}`),
    `Expenses: ${inr(r.expenseTotal)}`,
    `Cash in hand (cash collected - cash spent): ${inr(r.cash.net)}`,
    '',
    `Arrivals (${r.arrivals.length}):`, list(r.arrivals),
    `Departures (${r.departures.length}):`, list(r.departures),
    `In house (${r.inHouse.length}):`, list(r.inHouse),
    '',
    'Sent from Vira Villas Rooms.'
  ];
  return { to: email, subject: `${property.name} - day report ${r.date}`, body: lines.join('\n') };
}

/** Every booking active in the range with what is due and paid. */
function ledger(store, query) {
  const { from, to } = parseRange(query);
  const rows = store.all(
    `SELECT b.*, u.name AS unit_name, g.full_name AS guest_name, g.phone AS guest_phone FROM bookings b
     JOIN units u ON u.id = b.unit_id JOIN guests g ON g.id = b.guest_id
     WHERE b.check_in <= ? AND ? < b.check_out ORDER BY b.check_in, b.id`,
    to, from
  );
  const lines = rows.map((b) => {
    const f = folio.forBooking(store, b);
    return {
      id: b.id, code: b.code, guest: b.guest_name, phone: b.guest_phone, unit: b.unit_name, checkIn: b.check_in, checkOut: b.check_out,
      status: b.status, total: f.total, tax: f.tax, paid: f.paid, balance: f.balance
    };
  });
  const sum = (key) => lines.filter((l) => !['CANCELLED', 'NO_SHOW'].includes(l.status)).reduce((s, l) => s + l[key], 0);
  const payments = paymentsInRange(store, from, to);
  return {
    from, to, rows: lines,
    totals: { bookings: lines.length, total: sum('total'), tax: sum('tax'), paid: sum('paid'), balance: sum('balance') },
    collections: sumByMode(payments)
  };
}

/** Guest register (Form-B style) for police / records. Full ID numbers only with `reveal` (admin). */
function guestRegister(store, query, { reveal = false } = {}) {
  const { from, to } = parseRange(query);
  return store
    .all(
      `SELECT b.code, b.check_in, b.check_out, b.checked_in_at, b.checked_out_at, b.adults, b.children, u.name AS unit,
              g.full_name, g.phone, g.address, g.city, g.nationality, g.id_type, g.id_number, g.id_number_enc,
              d.arriving_from, d.going_to, d.purpose, d.vehicle_no, d.passport_no, d.visa_no, d.co_guests
       FROM bookings b JOIN units u ON u.id = b.unit_id JOIN guests g ON g.id = b.guest_id
       LEFT JOIN declarations d ON d.booking_id = b.id
       WHERE b.checked_in_at IS NOT NULL AND b.check_in <= ? AND ? <= b.check_in ORDER BY b.checked_in_at`,
      to, from
    )
    .map(({ id_number_enc: sealed, ...r }) => ({
      ...r,
      id_number: reveal && sealed ? vault.open(store, Buffer.from(sealed)).toString('utf8') : r.id_number,
      co_guests: r.co_guests ? JSON.parse(r.co_guests) : []
    }));
}

function toCsv(columns, rows) {
  const escape = (value) => {
    let str = value === null || value === undefined ? '' : String(value);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = columns.map((c) => escape(c.title)).join(',');
  const body = rows.map((row) => columns.map((c) => escape(c.value(row))).join(','));
  return `﻿${[header, ...body].join('\r\n')}\r\n`;
}

const rupees = (paise) => (paise / 100).toFixed(2);

const CSV_EXPORTS = {
  bookings: (store, query) => toCsv(
    [
      { title: 'Booking', value: (r) => r.code }, { title: 'Guest', value: (r) => r.guest }, { title: 'Phone', value: (r) => r.phone },
      { title: 'Room', value: (r) => r.unit }, { title: 'Arrival', value: (r) => r.checkIn }, { title: 'Departure', value: (r) => r.checkOut },
      { title: 'Status', value: (r) => r.status }, { title: 'Total (Rs)', value: (r) => rupees(r.total) }, { title: 'Tax (Rs)', value: (r) => rupees(r.tax) },
      { title: 'Paid (Rs)', value: (r) => rupees(r.paid) }, { title: 'Balance (Rs)', value: (r) => rupees(r.balance) }
    ],
    ledger(store, query).rows
  ),
  'guest-register': (store, query) => toCsv(
    [
      { title: 'Booking', value: (r) => r.code }, { title: 'Room', value: (r) => r.unit }, { title: 'Guest', value: (r) => r.full_name },
      { title: 'Phone', value: (r) => r.phone }, { title: 'Address', value: (r) => [r.address, r.city].filter(Boolean).join(', ') },
      { title: 'Nationality', value: (r) => r.nationality }, { title: 'ID type', value: (r) => r.id_type }, { title: 'ID number', value: (r) => r.id_number },
      { title: 'Passport', value: (r) => r.passport_no }, { title: 'Visa', value: (r) => r.visa_no },
      { title: 'Adults', value: (r) => r.adults }, { title: 'Children', value: (r) => r.children },
      { title: 'Other guests', value: (r) => r.co_guests.map((g) => g.name).join('; ') },
      { title: 'Arriving from', value: (r) => r.arriving_from }, { title: 'Going to', value: (r) => r.going_to }, { title: 'Purpose', value: (r) => r.purpose },
      { title: 'Vehicle', value: (r) => r.vehicle_no }, { title: 'Checked in', value: (r) => r.checked_in_at }, { title: 'Checked out', value: (r) => r.checked_out_at || '' }
    ],
    guestRegister(store, query, { reveal: true })
  ),
  payments: (store, query) => {
    const { from, to } = parseRange(query);
    return toCsv(
      [
        { title: 'Date', value: (r) => r.localDate }, { title: 'Time (UTC)', value: (r) => r.received_at }, { title: 'For', value: (r) => r.booking_code || r.order_code },
        { title: 'Type', value: (r) => r.kind }, { title: 'Mode', value: (r) => r.mode }, { title: 'Amount (Rs)', value: (r) => rupees(r.kind === 'REFUND' ? -r.amount : r.amount) },
        { title: 'Reference', value: (r) => r.reference }, { title: 'Note', value: (r) => r.note }, { title: 'By', value: (r) => r.created_by }
      ],
      paymentsInRange(store, from, to)
    );
  },
  expenses: (store, query) => {
    const { from, to } = parseRange(query);
    return toCsv(
      [
        { title: 'Date', value: (r) => r.date }, { title: 'Category', value: (r) => r.category }, { title: 'Description', value: (r) => r.description },
        { title: 'Paid to', value: (r) => r.paid_to }, { title: 'Mode', value: (r) => r.mode }, { title: 'Amount (Rs)', value: (r) => rupees(r.amount) }
      ],
      store.all('SELECT * FROM expenses WHERE voided_at IS NULL AND date >= ? AND date <= ? ORDER BY date', from, to)
    );
  },
  invoices: (store, query) => {
    const { from, to } = parseRange(query);
    return toCsv(
      [
        { title: 'Invoice', value: (r) => r.number }, { title: 'Issued (UTC)', value: (r) => r.issued_at }, { title: 'Bill to', value: (r) => JSON.parse(r.bill_to).name },
        { title: 'GSTIN', value: (r) => JSON.parse(r.bill_to).gstin || '' }, { title: 'Taxable (Rs)', value: (r) => rupees(r.taxable) },
        { title: 'GST (Rs)', value: (r) => rupees(r.tax) }, { title: 'Total (Rs)', value: (r) => rupees(r.total) }, { title: 'Status', value: (r) => r.status }
      ],
      store.all('SELECT * FROM invoices WHERE substr(issued_at, 1, 10) >= ? AND substr(issued_at, 1, 10) <= ? ORDER BY id', from, to)
    );
  }
};

function csv(store, name, query) {
  const build = CSV_EXPORTS[name];
  if (!build) throw badRequest('Unknown export');
  return build(store, query);
}

module.exports = { daily, dailyEmail, ledger, guestRegister, csv, toCsv, CSV_EXPORTS };
