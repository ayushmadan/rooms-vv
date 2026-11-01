import { h, clear, append } from '../dom.js';
import { api, query } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, statusTag, tag, openPrint, saveBlob, showError, loading, emailDayReport } from '../ui.js';
import { money, date, dateTime, addDays, LABELS } from '../format.js';

const TABS = [['day', 'Day sheet'], ['register', 'Guest register'], ['accounts', 'Accounts'], ['invoices', 'Invoices']];

export async function render(page, params) {
  const tab = params.tab || 'day';
  const host = h('div');
  append(clear(page), 
    pageHead('Reports', { lede: 'Everything prints on A4 and exports to Excel (CSV).' }),
    h('div', { class: 'segmented', role: 'tablist', style: { marginBottom: '18px' } },
      TABS.map(([key, label]) => h('button', { type: 'button', role: 'tab', 'aria-pressed': String(key === tab), onclick: () => { location.hash = `#/reports?tab=${key}`; } }, label))),
    host);
  const draw = { day: daySheet, register: guestRegister, accounts, invoices }[tab] || daySheet;
  await draw(host, params);
}

function rangeControls(params, tab, defaults = { from: addDays(state.today, -29), to: state.today }) {
  const from = h('input', { type: 'date', value: params.from || defaults.from, 'aria-label': 'From' });
  const to = h('input', { type: 'date', value: params.to || defaults.to, 'aria-label': 'To' });
  const go = h('button', { onclick: () => { location.hash = `#/reports?${query({ tab, from: from.value, to: to.value })}`; } }, 'Show');
  return { from: from.value, to: to.value, controls: [from, to, go] };
}

async function downloadCsv(name, from, to) {
  try {
    const blob = await api.get(`/api/reports/csv/${name}?${query({ from, to })}`);
    saveBlob(blob, `${name}-${from}-to-${to}.csv`);
  } catch (err) {
    showError(err);
  }
}

async function daySheet(host, params) {
  const day = params.date || state.today;
  loading(host);
  const r = await api.get(`/api/reports/daily?date=${day}`);
  const picker = h('input', { type: 'date', value: day, 'aria-label': 'Day', onchange: (e) => { location.hash = `#/reports?${query({ tab: 'day', date: e.target.value })}`; } });
  const stays = (rows) => table([
    { title: 'Room', value: (s) => s.unit },
    { title: 'Guest', value: (s) => h('a', { href: `#/booking/${s.id}` }, s.guest) },
    { title: 'Phone', value: (s) => s.phone },
    { title: 'Status', value: (s) => statusTag(s.status) }
  ], rows, { empty: 'None.' });

  append(clear(host), 
    h('div', { class: 'row', style: { marginBottom: '14px' } }, picker, h('button', { class: 'primary', onclick: () => openPrint(`/print/daily?date=${day}`) }, 'Print day sheet'),
      h('button', { onclick: () => emailDayReport(day).catch(showError) }, 'Email report')),
    h('div', { class: 'figures' },
      fig('Occupancy', `${r.rooms.occupancyPercent}%`, `${r.rooms.occupied} of ${r.rooms.total}`),
      fig('Room revenue', money(r.revenue.room)),
      fig('Meals', money(r.revenue.meals)),
      fig('Restaurant', money(r.revenue.restaurant + r.revenue.postedToRooms), `${r.revenue.restaurantBills} bills`),
      fig('Collected', money(r.collectionTotal)),
      fig('Expenses', money(r.expenseTotal)),
      fig('Cash in hand', money(r.cash.net), 'cash collected − cash spent')),
    h('div', { class: 'columns three' },
      panel('Arrivals', { count: r.arrivals.length, flush: true }, stays(r.arrivals)),
      panel('Departures', { count: r.departures.length, flush: true }, stays(r.departures)),
      panel('Collections', { flush: true }, table([
        { title: 'Mode', value: ([m]) => LABELS.mode[m] },
        { title: 'Amount', num: true, value: ([, a]) => money(a) }
      ], Object.entries(r.collections), { empty: 'Nothing collected.' }))),
    h('div', { style: { height: '18px' } }),
    panel('Payments', { count: r.payments.length, flush: true }, table([
      { title: 'Time', value: (p) => dateTime(p.at) },
      { title: 'For', value: (p) => p.ref },
      { title: 'Type', value: (p) => LABELS.kind[p.kind] },
      { title: 'Mode', value: (p) => LABELS.mode[p.mode] },
      { title: 'By', value: (p) => p.by },
      { title: 'Amount', num: true, value: (p) => `${p.kind === 'REFUND' ? '− ' : ''}${money(p.amount)}` }
    ], r.payments, { empty: 'No payments on this day.' })));
}

function fig(label, value, sub = '') {
  return h('div', {}, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value), h('div', { class: 's' }, sub));
}

async function guestRegister(host, params) {
  const { from, to, controls } = rangeControls(params, 'register', { from: addDays(state.today, -6), to: state.today });
  loading(host);
  const rows = await api.get(`/api/bookings?${query({ from, to, status: 'CHECKED_IN,CHECKED_OUT', limit: 500 })}`);
  append(clear(host), 
    h('div', { class: 'row', style: { marginBottom: '14px' } }, controls,
      h('button', { class: 'primary', onclick: () => openPrint(`/print/register?${query({ from, to })}`) }, 'Print register'),
      h('button', { onclick: () => downloadCsv('guest-register', from, to) }, 'Excel (CSV)')),
    panel('Guests who stayed', { count: rows.length, flush: true }, table([
      { title: 'Booking', value: (b) => b.code },
      { title: 'Room', value: (b) => b.unit.name },
      { title: 'Guest', value: (b) => h('div', {}, h('strong', {}, b.guest.fullName), h('div', { class: 'hint' }, b.guest.phone)) },
      { title: 'Checked in', value: (b) => dateTime(b.checkedInAt) },
      { title: 'Checked out', value: (b) => (b.checkedOutAt ? dateTime(b.checkedOutAt) : '—') },
      { title: 'Pax', num: true, value: (b) => b.adults + b.children }
    ], rows, { onRowClick: (b) => { location.hash = `#/booking/${b.id}`; }, empty: 'No stays in this period.' })));
}

async function accounts(host, params) {
  const { from, to, controls } = rangeControls(params, 'accounts');
  loading(host);
  const r = await api.get(`/api/reports/ledger?${query({ from, to })}`);
  const csvButtons = [['bookings', 'Bookings'], ['payments', 'Payments'], ['invoices', 'Invoices'], ['expenses', 'Expenses']]
    .map(([name, label]) => h('button', { class: 'small', onclick: () => downloadCsv(name, from, to) }, label));
  append(clear(host), 
    h('div', { class: 'row', style: { marginBottom: '14px' } }, controls, h('span', { class: 'hint', style: { marginLeft: '12px' } }, 'Export:'), csvButtons),
    h('div', { class: 'figures' },
      fig('Bookings', r.totals.bookings),
      fig('Billed', money(r.totals.total)),
      fig('GST in billing', money(r.totals.tax)),
      fig('Received', money(r.totals.paid)),
      fig('Outstanding', money(r.totals.balance)),
      fig('Collected by mode', Object.entries(r.collections).map(([m, a]) => `${LABELS.mode[m]} ${money(a)}`).join(' · ') || '—')),
    panel('Stays in period', { flush: true }, table([
      { title: 'Booking', value: (b) => b.code },
      { title: 'Guest', value: (b) => b.guest },
      { title: 'Room', value: (b) => b.unit },
      { title: 'Dates', value: (b) => `${date(b.checkIn)} → ${date(b.checkOut)}` },
      { title: 'Status', value: (b) => statusTag(b.status) },
      { title: 'Billed', num: true, value: (b) => money(b.total) },
      { title: 'Received', num: true, value: (b) => money(b.paid) },
      { title: 'Balance', num: true, value: (b) => h('span', { class: b.balance > 0 ? 'money-due' : '' }, money(b.balance)) }
    ], r.rows, { onRowClick: (b) => { location.hash = `#/booking/${b.id}`; }, empty: 'No stays in this period.' })));
}

async function invoices(host, params) {
  const { from, to, controls } = rangeControls(params, 'invoices');
  loading(host);
  const rows = await api.get(`/api/invoices?${query({ from, to })}`);
  append(clear(host), 
    h('div', { class: 'row', style: { marginBottom: '14px' } }, controls, h('button', { onclick: () => downloadCsv('invoices', from, to) }, 'Excel (CSV)')),
    panel('Invoices issued', { count: rows.length, flush: true }, table([
      { title: 'Number', value: (i) => i.number },
      { title: 'Issued', value: (i) => dateTime(i.issuedAt) },
      { title: 'Billed to', value: (i) => i.billTo },
      { title: 'For', value: (i) => (i.bookingId ? 'Stay' : 'Restaurant') },
      { title: 'Status', value: (i) => tag(i.status, i.status === 'ISSUED' ? 'Issued' : 'Void') },
      { title: 'GST', num: true, value: (i) => money(i.tax) },
      { title: 'Total', num: true, value: (i) => money(i.total) }
    ], rows, { onRowClick: (i) => openPrint(`/print/invoice/${i.id}${i.orderId ? '?format=thermal' : ''}`), rowClass: (i) => (i.status === 'VOID' ? 'void' : ''), empty: 'No invoices in this period.' })));
}
