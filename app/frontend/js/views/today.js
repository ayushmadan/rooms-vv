// Today: the front desk's home — who arrives, who leaves, who is in, and the state of every room.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, statusTag, loading, emailDayReport, openPrint, showError } from '../ui.js';
import { money, plural, LABELS } from '../format.js';

export async function render(page) {
  loading(page);
  const [report, units] = await Promise.all([api.get(`/api/reports/daily?date=${state.today}`), api.get('/api/units')]);
  const pendingArrivals = report.arrivals.filter((s) => s.status === 'BOOKED');
  const pendingDepartures = report.departures.filter((s) => s.status === 'CHECKED_IN');
  const inHouse = report.inHouse.filter((s) => s.status === 'CHECKED_IN');
  const dirty = units.filter((u) => u.hk_status === 'DIRTY');

  append(clear(page), 
    pageHead('Today', {
      lede: `${plural(pendingArrivals.length, 'arrival')} still to check in, ${plural(pendingDepartures.length, 'departure')} still to check out.`,
      actions: [
        h('button', { onclick: () => emailDayReport(state.today).catch(showError) }, 'Email report'),
        h('button', { onclick: () => openPrint(`/print/daily?date=${state.today}`) }, 'Print day sheet')
      ]
    }),
    h('div', { class: 'figures' },
      figure('Occupancy', `${report.rooms.occupancyPercent}%`, `${report.rooms.occupied} of ${report.rooms.total} rooms`),
      figure('In house', inHouse.length, plural(inHouse.reduce((s, x) => s + x.adults + x.children, 0), 'guest')),
      figure('Arrivals', report.arrivals.length, `${pendingArrivals.length} pending`),
      figure('Departures', report.departures.length, `${pendingDepartures.length} pending`),
      figure('Collected today', money(report.collectionTotal), Object.entries(report.collections).map(([m, a]) => `${LABELS.mode[m]} ${money(a)}`).join(' · ') || 'Nothing yet'),
      figure('To clean', dirty.length, dirty.map((u) => u.code).join(', ') || 'All rooms clean')),
    h('div', { class: 'columns three' },
      panel('Arriving', { count: report.arrivals.length, flush: true }, movement(report.arrivals, 'Check in', 'BOOKED', 'No arrivals today.')),
      panel('Leaving', { count: report.departures.length, flush: true }, movement(report.departures, 'Check out', 'CHECKED_IN', 'No departures today.')),
      panel('In house', { count: inHouse.length, flush: true }, movement(inHouse, null, null, 'Nobody is staying tonight.'))),
    h('div', { style: { height: '22px' } }),
    panel('Rooms and halls', { flush: false, tools: legend() }, board(units, report)));
}

function figure(label, value, sub) {
  return h('div', {}, h('div', { class: 'k' }, label), h('div', { class: 'v' }, value), h('div', { class: 's' }, sub));
}

function movement(stays, actionLabel, actionStatus, empty) {
  if (!stays.length) return h('div', { class: 'empty' }, empty);
  return h('ul', { class: 'movement' }, stays.map((s) => h('li', {},
    h('span', { class: 'room' }, s.unit.replace(/^Room /, '')),
    h('div', { class: 'who' },
      h('a', { href: `#/booking/${s.id}` }, s.guest),
      h('div', { class: 'meta' }, `${s.phone} · ${plural(s.adults + s.children, 'guest')} · ${s.code}`)),
    actionLabel && s.status === actionStatus
      ? h('a', { class: 'button small', href: `#/booking/${s.id}?action=${actionStatus === 'BOOKED' ? 'check-in' : 'check-out'}` }, actionLabel)
      : statusTag(s.status))));
}

function legend() {
  return h('div', { class: 'legend', style: { margin: 0 } },
    h('span', { class: 'l-in' }, 'Occupied'), h('span', { class: 'l-booked' }, 'Arriving'),
    h('span', { class: 'l-dirty' }, 'Needs cleaning'), h('span', { class: 'l-ooo' }, 'Out of order'));
}

function board(units, report) {
  const occupied = new Map(report.inHouse.filter((s) => s.status === 'CHECKED_IN').map((s) => [s.unit_id, s]));
  const arriving = new Map(report.arrivals.filter((s) => s.status === 'BOOKED').map((s) => [s.unit_id, s]));
  return h('div', { class: 'board' }, units.map((u) => {
    const stay = occupied.get(u.id);
    const arrival = arriving.get(u.id);
    let cls = 'vacant';
    let stateText = 'Vacant';
    if (u.hk_status === 'OUT_OF_ORDER') [cls, stateText] = ['ooo', `Out of order${u.hk_note ? ` — ${u.hk_note}` : ''}`];
    else if (stay) [cls, stateText] = ['occupied', 'Occupied'];
    else if (arrival) [cls, stateText] = ['arriving', 'Arriving today'];
    if (!stay && u.hk_status === 'DIRTY') [cls, stateText] = ['dirty', arrival ? 'Arriving · needs cleaning' : 'Needs cleaning'];
    const target = stay || arrival;
    return h('button', {
      type: 'button', class: `unit ${cls}`,
      onclick: () => { location.hash = target ? `#/booking/${target.id}` : `#/new-booking?unit=${u.id}`; }
    },
    h('span', { class: 'code' }, u.code),
    h('span', { class: 'type' }, [u.room_type, u.floor && `${u.floor} floor`].filter(Boolean).join(' · ')),
    h('span', { class: 'who' }, target ? target.guest : ' '),
    h('span', { class: 'state' }, stateText));
  }));
}
