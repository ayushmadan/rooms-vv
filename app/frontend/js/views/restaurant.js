// Restaurant & bills: tables and open bills | catalogue (food and services) | the current bill.
import { h, clear, append } from '../dom.js';
import { api, admin, query } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, tag, field, select, formDialog, confirmDialog, toast, showError, val, openPrint, modeOptions, chipField } from '../ui.js';
import { money, dateTime, LABELS, toPaise } from '../format.js';
import { loadCatalog, editLine } from '../billing.js';

const KIND_LABEL = { DINE_IN: 'Dine-in', TAKEAWAY: 'Counter bill', ROOM_SERVICE: 'Room service' };

export async function render(page, params) {
  const leftHost = h('div');
  const menuHost = h('div');
  const ticketHost = h('div');
  const historyHost = h('div');
  let orderId = params.order ? Number(params.order) : null;
  let type = 'FOOD';
  let group = 'All';
  let term = '';
  const catalog = await loadCatalog({ refresh: true });

  append(clear(page),
    pageHead('Restaurant & bills', {
      lede: 'Pick a table, start a counter bill (food, laundry or any service) or room service. Tap items to add them.',
      actions: [h('a', { class: 'button', href: '#/menu' }, 'Edit prices & catalogue')]
    }),
    h('div', { class: 'pos' }, leftHost, menuHost, ticketHost),
    h('div', { style: { height: '24px' } }),
    historyHost);

  async function selectOrder(id) {
    orderId = id;
    history.replaceState(null, '', id ? `#/restaurant?order=${id}` : '#/restaurant');
    await refresh();
  }

  async function openNew(body) {
    try {
      const order = await api.post('/api/orders', body);
      await selectOrder(order.id);
    } catch (err) {
      showError(err);
    }
  }

  async function refresh() {
    const [tables, open, today] = await Promise.all([api.get('/api/tables'), api.get('/api/orders?status=OPEN'), api.get(`/api/orders?${query({ date: state.today })}`)]);
    drawLeft(tables, open);
    await drawTicket();
    drawHistory(today.filter((o) => o.status !== 'OPEN'));
  }

  function drawLeft(tables, open) {
    const others = open.filter((o) => o.kind !== 'DINE_IN');
    append(clear(leftHost),
      panel('New bill', {},
        h('div', { class: 'stack' },
          h('button', { class: 'primary', onclick: () => customerDialog('Counter bill').then((c) => c && openNew({ kind: 'TAKEAWAY', ...c })) }, 'Counter bill'),
          h('button', { onclick: () => pickRoom('Room service for which room?').then((bookingId) => bookingId && openNew({ kind: 'ROOM_SERVICE', bookingId })) }, 'Room service'))),
      h('div', { style: { height: '14px' } }),
      panel('Tables', {},
        h('div', { class: 'tables' }, tables.map((t) => h('button', {
          type: 'button', class: t.openOrderId ? 'busy' : '', 'aria-pressed': String(Boolean(orderId && t.openOrderId === orderId)),
          onclick: () => (t.openOrderId ? selectOrder(t.openOrderId) : openNew({ kind: 'DINE_IN', tableId: t.id, covers: 2 }))
        }, h('span', { class: 't' }, t.name), h('span', { class: 's' }, t.openOrderId ? 'Open bill' : `${t.seats} seats`))))),
      others.length ? h('div', { style: { height: '14px' } }) : null,
      others.length ? panel('Open bills', { count: others.length, flush: true }, h('ul', { class: 'movement' }, others.map((o) => h('li', {},
        h('span', { class: 'room' }, o.kind === 'ROOM_SERVICE' ? o.booking.unit.replace(/^Room /, '') : 'CB'),
        h('div', { class: 'who' }, h('a', { href: '#', onclick: (e) => { e.preventDefault(); selectOrder(o.id); } }, o.customerName || o.booking?.guest || o.code), h('div', { class: 'meta' }, `${KIND_LABEL[o.kind]} · ${money(o.totals.total)}`)),
        h('span'))))) : null);
  }

  // --- Catalogue
  function drawMenu() {
    const ofType = catalog.filter((m) => m.type === type);
    const groups = ['All', ...new Set(ofType.map((m) => m.category))];
    if (!groups.includes(group)) group = 'All';
    const items = ofType.filter((m) => (group === 'All' || m.category === group) && (!term || m.name.toLowerCase().includes(term)));
    const search = h('input', { type: 'search', placeholder: 'Find an item', value: term, 'aria-label': 'Find an item', style: { width: '180px' } });
    search.addEventListener('input', () => {
      term = search.value.trim().toLowerCase();
      const pos = search.selectionStart;
      drawMenu();
      const again = menuHost.querySelector('input[type=search]');
      again.focus();
      again.setSelectionRange(pos, pos);
    });
    const typeSwitch = h('div', { class: 'segmented' },
      [['FOOD', 'Food'], ['SERVICE', 'Services']].map(([value, label]) => h('button', { type: 'button', 'aria-pressed': String(type === value), onclick: () => { type = value; group = 'All'; drawMenu(); } }, label)));
    append(clear(menuHost), h('section', { class: 'panel' },
      h('header', {}, typeSwitch, h('div', { class: 'tools' }, search)),
      h('div', { class: 'body' },
        h('div', { class: 'menu-cats' }, groups.map((c) => h('button', { type: 'button', 'aria-pressed': String(c === group), onclick: () => { group = c; drawMenu(); } }, c))),
        h('div', { class: 'menu-items' },
          h('button', { type: 'button', class: 'custom', disabled: !orderId, onclick: addCustom }, h('span', {}, '+ Custom item'), h('span', { class: 'price' }, 'Any name and price')),
          items.map((m) => h('button', { type: 'button', disabled: !orderId, onclick: () => addItem({ menuItemId: m.id, qty: 1 }) },
            h('span', {}, h('span', { class: `veg-mark${m.type === 'SERVICE' ? ' svc' : m.isVeg ? '' : ' non'}` }), m.name),
            h('span', { class: 'price' }, money(m.price))))),
        !items.length ? h('p', { class: 'hint', style: { marginTop: '10px' } }, type === 'FOOD' ? 'No dishes yet. Add them in Prices & catalogue.' : 'No services yet. Add them in Prices & catalogue.') : null,
        !orderId ? h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Start a bill on the left first.') : null)));
  }

  async function addItem(body) {
    try {
      await api.post(`/api/orders/${orderId}/items`, body);
      await drawTicket();
    } catch (err) {
      showError(err);
    }
  }

  async function addCustom() {
    const line = await formDialog({
      title: 'Custom item',
      body: h('div', { class: 'grid c2' },
        field('Item name', { name: 'name', required: true, maxlength: 80, placeholder: 'e.g. Birthday cake, Dry cleaning' }, { wide: true }),
        h('div', { class: 'span-2' }, chipField('Type', 'category', [['FOOD', 'Food'], ['SERVICE', 'Service']], type)),
        field('Quantity', { name: 'qty', type: 'number', min: 1, value: 1, required: true }),
        field('Price each ₹', { name: 'unitPrice', type: 'number', min: 0, step: '0.01', required: true })),
      submitLabel: 'Add to bill',
      onSubmit: (form) => ({ name: val(form, 'name'), category: val(form, 'category'), qty: val(form, 'qty'), unitPrice: val(form, 'unitPrice') })
    });
    if (line) addItem(line);
  }

  // --- Ticket
  async function drawTicket() {
    drawMenu();
    if (!orderId) {
      append(clear(ticketHost), panel('Bill', {}, h('div', { class: 'empty' }, 'No bill open.')));
      return;
    }
    const o = await api.get(`/api/orders/${orderId}`);
    const where = o.table ? `Table ${o.table.name}` : o.booking ? `${o.booking.unit} · ${o.booking.guest}` : o.customerName || 'Counter bill';
    const isOpen = o.status === 'OPEN';
    const hasLines = o.items.some((i) => !i.voided);

    const lines = o.items.map((i) => h('div', { class: `line${i.voided ? ' void' : ''}` },
      h('span', { class: 'name' }, i.name, h('small', {}, [i.category === 'SERVICE' ? 'Service' : i.kotNo ? `Sent · KOT ${i.kotNo}` : 'Not sent to kitchen', i.note].filter(Boolean).join(' · '))),
      isOpen && !i.kotNo ? h('span', { class: 'qty' },
        h('button', { type: 'button', 'aria-label': `One less ${i.name}`, onclick: () => changeLine(i, { qty: i.qty - 1 }) }, '−'),
        h('span', {}, i.qty),
        h('button', { type: 'button', 'aria-label': `One more ${i.name}`, onclick: () => changeLine(i, { qty: i.qty + 1 }) }, '+'))
        : h('span', {}, `× ${i.qty}`, isOpen && !i.voided && admin.isUnlocked ? h('button', { class: 'quiet small', onclick: () => changeLine(i, { qty: 0 }) }, 'Void') : null),
      isOpen && !i.kotNo
        ? h('button', { class: 'price-btn', title: 'Change quantity or price', onclick: () => editLine({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, onSubmit: (c) => changeLine(i, c) }) }, money(i.unitPrice * i.qty))
        : h('span', { class: 'num' }, money(i.unitPrice * i.qty))));

    const t = o.totals;
    append(clear(ticketHost), h('section', { class: 'panel ticket' },
      h('header', {}, h('div', {}, h('h2', {}, where), h('div', { class: 'hint' }, `${KIND_LABEL[o.kind]} · ${o.code} · ${dateTime(o.createdAt)}`)),
        h('div', { class: 'tools' }, tag(o.status, LABELS.orderStatus[o.status]))),
      h('div', { class: 'body flush' },
        o.kind === 'TAKEAWAY' ? h('div', { class: 'row', style: { padding: '10px 16px', borderBottom: '1px solid var(--line)', justifyContent: 'space-between' } },
          h('span', { class: 'hint' }, [o.customerPhone, o.customerGstin && `GSTIN ${o.customerGstin}`].filter(Boolean).join(' · ') || 'No customer details'),
          isOpen ? h('button', { class: 'quiet small', onclick: () => customerDialog('Bill to', o).then((c) => c && api.put(`/api/orders/${o.id}/customer`, c).then(drawTicket).catch(showError)) }, 'Bill to…') : null) : null,
        lines.length ? lines : h('div', { class: 'empty' }, 'Tap items to add them.'),
        h('div', { style: { padding: '10px 16px' } },
          h('dl', { class: 'pairs', style: { gridTemplateColumns: '1fr auto' } },
            t.discount ? [h('dt', {}, 'Discount'), h('dd', {}, `− ${money(t.discount)}`)] : null,
            h('dt', {}, state.boot.taxes.pricesIncludeTax ? 'GST included' : 'GST'), h('dd', {}, money(t.tax)))),
        h('div', { class: 'balance-line' }, h('span', {}, 'Total'), h('strong', {}, money(t.total))),
        isOpen ? h('div', { class: 'stack', style: { padding: '14px 16px', borderTop: '1px solid var(--line)' } },
          o.pendingKot ? h('button', { class: 'accent big', onclick: () => sendKot(o) }, 'Send to kitchen (print KOT)') : null,
          h('div', { class: 'grid c2' },
            h('button', { class: 'primary', disabled: !hasLines || o.pendingKot, onclick: () => settle(o) }, 'Take payment'),
            h('button', { disabled: !hasLines || o.pendingKot, onclick: () => postToRoom(o) }, 'Add to room bill')),
          h('div', { class: 'row' },
            h('button', { class: 'quiet small', onclick: () => discount(o) }, 'Discount'),
            h('button', { class: 'quiet small', onclick: () => cancel(o) }, 'Cancel bill'),
            h('button', { class: 'quiet small', onclick: () => selectOrder(null) }, 'Close'))) : h('div', { class: 'row', style: { padding: '14px 16px' } },
          o.invoice ? h('button', { onclick: () => openPrint(`/print/invoice/${o.invoice.id}?format=thermal`) }, 'Print receipt (80 mm)') : null,
          o.invoice ? h('button', { onclick: () => openPrint(`/print/invoice/${o.invoice.id}`) }, 'Print A4 invoice') : null,
          h('button', { class: 'quiet', onclick: () => selectOrder(null) }, 'Close')))));
  }

  async function changeLine(item, changes) {
    try {
      await api.patch(`/api/orders/${orderId}/items/${item.id}`, { qty: item.qty, ...changes });
      await drawTicket();
    } catch (err) {
      showError(err);
    }
  }

  async function sendKot(o) {
    try {
      const { kotNo } = await api.post(`/api/orders/${o.id}/kot`);
      openPrint(`/print/kot/${o.id}/${kotNo}?autoprint=1`);
      await refresh();
    } catch (err) {
      showError(err);
    }
  }

  async function settle(o) {
    const total = o.totals.total;
    const changeNote = h('p', { class: 'hint' });
    const done = await formDialog({
      title: `Take payment · ${money(total)}`,
      lede: 'Split between two modes if needed. Any extra cash is shown as change to return.',
      body: () => {
        const body = h('div', { class: 'stack' },
          chipField('Paid by', 'mode1', modeOptions(state.enums), 'CASH'),
          h('div', { class: 'grid c2' },
            field('Amount ₹', { name: 'amount1', type: 'number', min: 0, step: '0.01', value: (total / 100).toFixed(2), required: true }),
            field('Reference / UTR', { name: 'reference', maxlength: 80 })),
          h('details', { class: 'more' }, h('summary', {}, 'Split with a second mode'),
            h('div', { class: 'stack' }, chipField('Second mode', 'mode2', modeOptions(state.enums), 'UPI'), field('Amount ₹', { name: 'amount2', type: 'number', min: 0, step: '0.01' }))),
          chipField('Print', 'print', [['thermal', 'Receipt (80 mm)'], ['a4', 'A4 invoice'], ['none', 'Don’t print']], 'thermal'),
          changeNote);
        body.addEventListener('input', () => {
          const form = body.closest('form');
          const paid = toPaise(form.elements.amount1.value) + toPaise(form.elements.amount2.value);
          changeNote.textContent = paid > total ? `Return change: ${money(paid - total)}` : paid < total ? `Short by ${money(total - paid)}` : '';
        });
        return body;
      },
      submitLabel: 'Settle bill',
      onSubmit: async (form) => {
        const payments = [{ mode: val(form, 'mode1'), amount: val(form, 'amount1'), reference: val(form, 'reference') }];
        if (Number(val(form, 'amount2')) > 0) payments.push({ mode: val(form, 'mode2'), amount: val(form, 'amount2'), reference: val(form, 'reference') });
        const result = await api.post(`/api/orders/${o.id}/settle`, { payments });
        return { result, print: val(form, 'print') };
      }
    });
    if (!done) return;
    toast(`${o.code} settled`);
    if (done.result.invoice && done.print !== 'none') openPrint(`/print/invoice/${done.result.invoice.id}${done.print === 'thermal' ? '?format=thermal' : ''}`);
    await selectOrder(null);
  }

  async function postToRoom(o) {
    const bookingId = o.booking ? o.booking.id : await pickRoom('Add to which room bill?');
    if (!bookingId) return;
    try {
      await api.post(`/api/orders/${o.id}/post-to-room`, { bookingId });
      toast(`${money(o.totals.total)} added to the room bill`);
      await selectOrder(null);
    } catch (err) {
      showError(err);
    }
  }

  async function discount(o) {
    const done = await formDialog({
      title: 'Discount on this bill',
      body: h('div', { class: 'stack' },
        chipField('Type', 'type', [['NONE', 'None'], ['PERCENT', 'Percent'], ['AMOUNT', 'Amount ₹']], o.discount.type),
        field('Value', { name: 'value', type: 'number', min: 0, step: '0.01', value: o.discount.type === 'AMOUNT' ? o.discount.value / 100 : o.discount.value })),
      onSubmit: (form) => api.put(`/api/orders/${o.id}/discount`, { type: val(form, 'type'), value: val(form, 'value') || 0 })
    });
    if (done) drawTicket();
  }

  async function cancel(o) {
    const sent = o.items.some((i) => i.kotNo && !i.voided);
    const done = await formDialog({
      title: 'Cancel bill',
      lede: sent ? 'Food has gone to the kitchen; this needs the admin PIN.' : 'Nothing has been sent to the kitchen yet.',
      body: field('Reason', { name: 'reason', required: sent, maxlength: 200 }),
      submitLabel: 'Cancel bill',
      submitClass: 'danger',
      cancelLabel: 'Keep bill',
      onSubmit: (form) => api.post(`/api/orders/${o.id}/cancel`, { reason: val(form, 'reason') })
    });
    if (done) await selectOrder(null);
  }

  function drawHistory(orders) {
    append(clear(historyHost), panel('Closed today', { count: orders.length, flush: true }, table([
      { title: 'Bill', value: (o) => o.code },
      { title: 'Type', value: (o) => KIND_LABEL[o.kind] },
      { title: 'For', value: (o) => (o.table ? `Table ${o.table.name}` : o.booking ? o.booking.unit : o.customerName || '—') },
      { title: 'Status', value: (o) => tag(o.status, LABELS.orderStatus[o.status]) },
      { title: 'Invoice', value: (o) => o.invoice?.number || '—' },
      { title: 'Total', num: true, value: (o) => money(o.totals.total) }
    ], orders, { onRowClick: (o) => selectOrder(o.id), empty: 'No closed bills yet today.' })));
  }

  await refresh();
}

function customerDialog(title, current = {}) {
  return formDialog({
    title,
    lede: 'Optional. Add a GSTIN when a business needs a GST invoice.',
    body: h('div', { class: 'grid c2' },
      field('Customer name', { name: 'customerName', value: current.customerName || '', maxlength: 80 }),
      field('Phone', { name: 'customerPhone', value: current.customerPhone || '', maxlength: 20 }),
      field('GSTIN', { name: 'customerGstin', value: current.customerGstin || '', maxlength: 15 })),
    submitLabel: current.id ? 'Save' : 'Start bill',
    onSubmit: (form) => ({ customerName: val(form, 'customerName'), customerPhone: val(form, 'customerPhone'), customerGstin: val(form, 'customerGstin') })
  });
}

async function pickRoom(title) {
  const inHouse = await api.get('/api/bookings?status=CHECKED_IN&limit=200');
  if (!inHouse.length) {
    await confirmDialog({ title: 'No guests in house', message: 'Room service and room bills are only for checked-in guests.', confirmLabel: 'OK' });
    return null;
  }
  return formDialog({
    title,
    body: select('Room', inHouse.map((b) => [b.id, `${b.unit.name} — ${b.guest.fullName}`]), { name: 'bookingId' }),
    submitLabel: 'Continue',
    onSubmit: (form) => Number(val(form, 'bookingId'))
  });
}
