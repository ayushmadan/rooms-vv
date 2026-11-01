// Reservation chart (rooms × nights) plus a searchable booking list.
import { h, clear, append } from '../dom.js';
import { api, query } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, statusTag, showError } from '../ui.js';
import { addDays, daysBetween, weekday, money, date } from '../format.js';

const LABEL_WIDTH = 150;
const DAY_WIDTH = 92;
const START_OFFSET_DAYS = -2;

export async function render(page, params) {
  let from = params.from || addDays(state.today, START_OFFSET_DAYS);
  let span = Number(params.days) || 14;
  const chartHost = h('div');
  const listHost = h('div');
  const rangeLabel = h('span', { class: 'hint' });

  async function drawChart() {
    rangeLabel.textContent = `${date(from)} – ${date(addDays(from, span - 1))}`;
    try {
      const data = await api.get(`/api/chart?${query({ from, days: span })}`);
      append(clear(chartHost), chart(data), h('div', { class: 'legend' },
        h('span', { class: 'l-booked' }, 'Booked'), h('span', { class: 'l-in' }, 'In house'), h('span', { class: 'l-out' }, 'Departed'),
        h('span', {}, 'Click an empty square to book that room from that night.')));
    } catch (err) {
      showError(err);
    }
  }

  const shift = (days) => {
    from = addDays(from, days);
    drawChart();
  };
  const spanSelect = h('select', { 'aria-label': 'Days shown', onchange: (e) => { span = Number(e.target.value); drawChart(); } },
    [['7', '1 week'], ['14', '2 weeks'], ['21', '3 weeks'], ['31', '1 month']].map(([v, t]) => h('option', { value: v, selected: Number(v) === span }, t)));
  const jump = h('input', { type: 'date', value: from, 'aria-label': 'Go to date', onchange: (e) => { if (e.target.value) { from = e.target.value; drawChart(); } } });

  append(clear(page), 
    pageHead('Reservations', {
      lede: rangeLabel,
      actions: [h('a', { class: 'button primary', href: '#/new-booking' }, 'New booking')]
    }),
    h('div', { class: 'row', style: { marginBottom: '12px' } },
      h('button', { onclick: () => shift(-7) }, '‹ Week'),
      h('button', { onclick: () => shift(-1) }, '‹ Day'),
      h('button', { onclick: () => { from = addDays(state.today, START_OFFSET_DAYS); drawChart(); } }, 'Today'),
      h('button', { onclick: () => shift(1) }, 'Day ›'),
      h('button', { onclick: () => shift(7) }, 'Week ›'),
      jump,
      h('span', { style: { marginLeft: 'auto' } }, spanSelect)),
    chartHost,
    h('div', { style: { height: '24px' } }),
    listHost);

  drawChart();
  bookingList(listHost, params.q || '');
}

function chart({ from, dates, units, bookings }) {
  const grid = h('div', { class: 'chart', style: { gridTemplateColumns: `${LABEL_WIDTH}px repeat(${dates.length}, ${DAY_WIDTH}px)` } });
  grid.append(h('div', { class: 'corner', style: { gridRow: 1, gridColumn: 1 } }));
  dates.forEach((d, i) => {
    const day = weekday(d);
    grid.append(h('div', {
      class: `day${d === state.today ? ' today' : ''}${day === 0 || day === 6 ? ' weekend' : ''}`,
      style: { gridRow: 1, gridColumn: i + 2 }
    }, date(d, { weekday: 'short' }), h('b', {}, date(d, { day: 'numeric' })), date(d, { month: 'short' })));
  });

  units.forEach((u, r) => {
    const row = r + 2;
    grid.append(h('div', { class: 'unit-label', style: { gridRow: row, gridColumn: 1 } },
      h('div', { class: 'code' }, u.code), h('div', { class: 'type' }, u.kind === 'HALL' ? u.name : u.roomType)));
    dates.forEach((d, i) => grid.append(h('button', {
      type: 'button', class: `cell${d === state.today ? ' today' : ''}`, 'aria-label': `Book ${u.name} from ${date(d)}`,
      style: { gridRow: row, gridColumn: i + 2 },
      onclick: () => { location.hash = `#/new-booking?unit=${u.id}&checkIn=${d}`; }
    })));
  });

  const rowOf = new Map(units.map((u, i) => [u.id, i + 2]));
  for (const b of bookings) {
    const row = rowOf.get(b.unitId);
    if (!row) continue;
    const start = Math.max(0, daysBetween(from, b.checkIn));
    const end = Math.min(dates.length, daysBetween(from, b.checkOut));
    if (end <= start) continue;
    grid.append(h('button', {
      type: 'button', class: `bar ${b.status}${daysBetween(from, b.checkIn) < 0 ? ' clipped-start' : ''}`,
      title: `${b.guest} · ${b.code} · ${date(b.checkIn)} → ${date(b.checkOut)}`,
      style: { gridRow: row, gridColumn: `${start + 2} / ${end + 2}` },
      onclick: () => { location.hash = `#/booking/${b.id}`; }
    }, b.guest, h('span', { class: 'sub' }, `${b.code} · ${b.pax} pax`)));
  }
  return h('div', { class: 'chart-wrap' }, grid);
}

function bookingList(host, initialQuery) {
  const results = h('div');
  const search = h('input', { type: 'search', value: initialQuery, placeholder: 'Code, guest name or phone', 'aria-label': 'Search bookings', style: { width: '260px' } });
  const status = h('select', { 'aria-label': 'Status' },
    [['BOOKED', 'Upcoming'], ['CHECKED_IN', 'In house'], ['CHECKED_OUT', 'Departed'], ['CANCELLED,NO_SHOW', 'Cancelled'], ['', 'All']].map(([v, t]) => h('option', { value: v }, t)));

  let timer;
  async function load() {
    try {
      const rows = await api.get(`/api/bookings?${query({ q: search.value.trim(), status: status.value, limit: 100 })}`);
      append(clear(results), table([
        { title: 'Booking', value: (b) => b.code },
        { title: 'Guest', value: (b) => h('div', {}, h('strong', {}, b.guest.fullName), h('div', { class: 'hint' }, b.guest.phone)) },
        { title: 'Room', value: (b) => b.unit.name },
        { title: 'Arrival', value: (b) => date(b.checkIn) },
        { title: 'Departure', value: (b) => date(b.checkOut) },
        { title: 'Status', value: (b) => statusTag(b.status) },
        { title: 'Total', num: true, value: (b) => money(b.total) },
        { title: 'Balance', num: true, value: (b) => h('span', { class: b.balance > 0 ? 'money-due' : 'money-ok' }, money(b.balance)) }
      ], rows, { onRowClick: (b) => { location.hash = `#/booking/${b.id}`; }, empty: 'No bookings match.' }));
    } catch (err) {
      showError(err);
    }
  }
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(load, 250);
  });
  status.addEventListener('change', load);
  if (initialQuery) status.value = '';
  append(clear(host), panel('Bookings', { tools: [search, status], flush: true }, results));
  load();
}
