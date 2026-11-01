// Restaurant and counter billing: one catalogue (food and services), tables, and orders.
// An order is any bill made at a counter: dine-in, takeaway / walk-in bill, or room service.
const v = require('../lib/validate');
const { badRequest, conflict, notFound, forbidden } = require('../lib/http');
const { discountAmount } = require('../lib/money');
const folio = require('./folio');
const invoices = require('./invoices');
const settings = require('./settings');
const sequences = require('./sequences');
const audit = require('./audit');

const ORDER_KINDS = ['DINE_IN', 'TAKEAWAY', 'ROOM_SERVICE'];
const LINE_CATEGORIES = ['FOOD', 'SERVICE'];
const DEFAULT_TABLES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
const MAX_QTY = 999;

// --- Catalogue ---------------------------------------------------------------

function catalogDto(row) {
  return {
    id: row.id, name: row.name, category: row.category, price: row.price, isVeg: Boolean(row.is_veg),
    type: row.tax_category, active: Boolean(row.active), sort: row.sort
  };
}

/** @param {{ includeInactive?: boolean, type?: 'FOOD'|'SERVICE' }} options */
function listMenu(store, { includeInactive = false, type } = {}) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push('active = 1');
  if (type) {
    where.push('tax_category = ?');
    params.push(v.oneOf(type, 'type', LINE_CATEGORIES));
  }
  return store
    .all(`SELECT * FROM menu_items ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY tax_category, category, sort, name`, ...params)
    .map(catalogDto);
}

function getCatalogItem(store, id) {
  const row = store.get('SELECT * FROM menu_items WHERE id = ?', id);
  if (!row) throw notFound('Item not found');
  return row;
}

function parseCatalogItem(body) {
  return {
    name: v.text(body.name, 'Item name', { required: true, max: 80 }),
    category: v.text(body.category, 'Group', { max: 40 }) || 'General',
    price: v.rupees(body.price, 'Price'),
    is_veg: v.bool(body.isVeg) ? 1 : 0,
    tax_category: v.oneOf(body.type, 'Type', LINE_CATEGORIES, 'FOOD'),
    active: body.active === undefined ? 1 : v.bool(body.active) ? 1 : 0,
    sort: v.integer(body.sort, 'Sort', { min: 0, max: 9999, fallback: 0 })
  };
}

function saveMenuItem(ctx, id, body) {
  const item = parseCatalogItem(body);
  const now = ctx.now();
  if (id) {
    getCatalogItem(ctx.store, id);
    ctx.store.update('menu_items', id, { ...item, updated_at: now });
  } else {
    id = ctx.store.insert('menu_items', { ...item, created_at: now, updated_at: now });
  }
  audit.record(ctx, 'catalog.save', 'menu_item', id, item.name);
  return catalogDto(getCatalogItem(ctx.store, id));
}

// --- Tables ------------------------------------------------------------------

function listTables(store) {
  return store.all(
    `SELECT t.*, (SELECT o.id FROM orders o WHERE o.table_id = t.id AND o.status = 'OPEN' ORDER BY o.id DESC LIMIT 1) AS open_order_id
     FROM dining_tables t WHERE t.active = 1 ORDER BY t.sort, t.name`
  ).map((t) => ({ id: t.id, name: t.name, seats: t.seats, openOrderId: t.open_order_id }));
}

function saveTable(ctx, id, body) {
  const row = {
    name: v.text(body.name, 'Table name', { required: true, max: 20 }),
    seats: v.integer(body.seats, 'Seats', { min: 1, max: 50, fallback: 4 }),
    active: body.active === undefined ? 1 : v.bool(body.active) ? 1 : 0,
    sort: v.integer(body.sort, 'Sort', { min: 0, max: 9999, fallback: 0 })
  };
  const clash = ctx.store.get('SELECT id FROM dining_tables WHERE name = ? AND id <> ?', row.name, id || 0);
  if (clash) throw conflict(`Table ${row.name} already exists`);
  if (id) ctx.store.update('dining_tables', id, row);
  else id = ctx.store.insert('dining_tables', row);
  return id;
}

function seedDefaults(ctx) {
  if (ctx.store.get('SELECT 1 AS x FROM dining_tables LIMIT 1')) return;
  DEFAULT_TABLES.forEach((name, i) => ctx.store.insert('dining_tables', { name, seats: 4, sort: i }));
}

// --- Orders ------------------------------------------------------------------

function getOrderRow(store, id) {
  const order = store.get('SELECT * FROM orders WHERE id = ?', id);
  if (!order) throw notFound('Bill not found');
  return order;
}

function liveItems(items) {
  return items.filter((i) => !i.voided);
}

function orderTotals(store, order, items) {
  const live = liveItems(items);
  const gross = live.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const discount = discountAmount(gross, order.discount_type, order.discount_value);
  const lines = live.map((i) => ({
    description: i.note ? `${i.name} (${i.note})` : i.name, category: i.category, qty: i.qty, rate: i.unit_price, amount: i.unit_price * i.qty
  }));
  // Spread the discount across categories in proportion, so each is taxed on its net value.
  if (discount) {
    const byCategory = new Map();
    for (const l of lines) byCategory.set(l.category, (byCategory.get(l.category) || 0) + l.amount);
    let remaining = discount;
    const categories = [...byCategory.keys()];
    categories.forEach((category, index) => {
      const share = index === categories.length - 1 ? remaining : Math.round((discount * byCategory.get(category)) / gross);
      remaining -= share;
      if (share) lines.push({ description: 'Discount', category, qty: 1, rate: -share, amount: -share });
    });
  }
  const tax = folio.computeTax(lines, settings.getSection(store, 'taxes'));
  return { gross, discount, lines, ...tax };
}

function orderDetail(store, id) {
  const order = getOrderRow(store, id);
  const items = store.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id);
  const payments = store.all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', id);
  const totals = orderTotals(store, order, items);
  const table = order.table_id ? store.get('SELECT name FROM dining_tables WHERE id = ?', order.table_id) : null;
  const booking = order.booking_id
    ? store.get('SELECT b.code, u.name AS unit_name, g.full_name FROM bookings b JOIN units u ON u.id = b.unit_id JOIN guests g ON g.id = b.guest_id WHERE b.id = ?', order.booking_id)
    : null;
  const invoice = store.get("SELECT id, number FROM invoices WHERE order_id = ? AND status = 'ISSUED' ORDER BY id DESC LIMIT 1", id);
  return {
    id: order.id, code: order.code, kind: order.kind, status: order.status, covers: order.covers,
    customerName: order.customer_name, customerPhone: order.customer_phone, customerGstin: order.customer_gstin,
    notes: order.notes, createdAt: order.created_at, closedAt: order.closed_at,
    table: table ? { id: order.table_id, name: table.name } : null,
    booking: booking ? { id: order.booking_id, code: booking.code, unit: booking.unit_name, guest: booking.full_name } : null,
    discount: { type: order.discount_type, value: order.discount_value },
    items: items.map((i) => ({
      id: i.id, menuItemId: i.menu_item_id, name: i.name, unitPrice: i.unit_price, qty: i.qty, note: i.note,
      category: i.category, kotNo: i.kot_no, voided: Boolean(i.voided)
    })),
    // Only food goes to the kitchen; services are billed directly.
    pendingKot: items.some((i) => !i.voided && i.kot_no === null && i.category === 'FOOD'),
    totals: { gross: totals.gross, discount: totals.discount, taxable: totals.taxable, tax: totals.tax, total: totals.total, taxLines: totals.taxLines },
    paid: folio.paidTotal(payments),
    invoice: invoice ? { id: invoice.id, number: invoice.number } : null
  };
}

function listOrders(store, { status, date }) {
  const where = [];
  const params = [];
  if (status) {
    where.push('status = ?');
    params.push(v.oneOf(status, 'status', ['OPEN', 'SETTLED', 'POSTED', 'CANCELLED']));
  }
  if (date) {
    where.push('substr(created_at, 1, 10) = ?');
    params.push(v.ymd(date, 'date'));
  }
  return store
    .all(`SELECT id FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT 300`, ...params)
    .map((r) => orderDetail(store, r.id));
}

function parseCustomer(body) {
  return {
    customer_name: v.text(body.customerName, 'Customer name', { max: 80 }),
    customer_phone: v.text(body.customerPhone, 'Customer phone', { max: 20 }),
    customer_gstin: v.text(body.customerGstin, 'Customer GSTIN', { max: 15 }).toUpperCase()
  };
}

function openOrder(ctx, body) {
  const kind = v.oneOf(body.kind, 'Bill type', ORDER_KINDS);
  const row = { kind, table_id: null, booking_id: null, ...parseCustomer(body) };
  if (kind === 'DINE_IN') {
    row.table_id = v.id(body.tableId, 'Table');
    const busy = ctx.store.get("SELECT id FROM orders WHERE table_id = ? AND status = 'OPEN'", row.table_id);
    if (busy) return orderDetail(ctx.store, busy.id);
  }
  if (kind === 'ROOM_SERVICE') {
    row.booking_id = v.id(body.bookingId, 'Room');
    const booking = ctx.store.get('SELECT status FROM bookings WHERE id = ?', row.booking_id);
    if (!booking || booking.status !== 'CHECKED_IN') throw conflict('Room service is only for checked-in guests');
  }
  return ctx.store.tx(() => {
    const id = ctx.store.insert('orders', {
      ...row,
      code: sequences.orderCode(ctx.store, ctx.today()),
      covers: v.integer(body.covers, 'Covers', { min: 1, max: 200, fallback: 1 }),
      created_by: ctx.actor,
      created_at: ctx.now()
    });
    audit.record(ctx, 'order.open', 'order', id);
    return orderDetail(ctx.store, id);
  });
}

function setCustomer(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  ctx.store.update('orders', orderId, parseCustomer(body));
  return orderDetail(ctx.store, orderId);
}

function assertOpen(order) {
  if (order.status !== 'OPEN') throw conflict(`Bill ${order.code} is already ${order.status.toLowerCase()}`);
}

/** Resolves what is being added: a catalogue item (price may be overridden) or a custom line. */
function parseLine(store, body) {
  const qty = v.integer(body.qty, 'Quantity', { min: 1, max: MAX_QTY, fallback: 1 });
  const note = v.text(body.note, 'Note', { max: 80 });
  const hasPrice = body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== '';
  if (body.menuItemId) {
    const item = getCatalogItem(store, v.id(body.menuItemId, 'Item'));
    if (!item.active) throw conflict(`${item.name} is not available`);
    return { menu_item_id: item.id, name: item.name, category: item.tax_category, unit_price: hasPrice ? v.rupees(body.unitPrice, 'Price') : item.price, qty, note };
  }
  return {
    menu_item_id: null,
    name: v.text(body.name, 'Item', { required: true, max: 80 }),
    category: v.oneOf(body.category, 'Type', LINE_CATEGORIES, 'SERVICE'),
    unit_price: v.rupees(body.unitPrice, 'Price'),
    qty,
    note
  };
}

function addItem(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const line = parseLine(ctx.store, body);
  const pending = line.menu_item_id && ctx.store.get(
    'SELECT id, qty FROM order_items WHERE order_id = ? AND menu_item_id = ? AND unit_price = ? AND kot_no IS NULL AND voided = 0 AND note = ?',
    orderId, line.menu_item_id, line.unit_price, line.note
  );
  if (pending) ctx.store.update('order_items', pending.id, { qty: Math.min(pending.qty + line.qty, MAX_QTY) });
  else ctx.store.insert('order_items', { order_id: orderId, ...line, created_at: ctx.now() });
  return orderDetail(ctx.store, orderId);
}

/**
 * Lines not yet sent to the kitchen can change quantity or price freely.
 * Lines already sent can only be voided, by admin.
 */
function changeItem(ctx, orderId, itemId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const item = ctx.store.get('SELECT * FROM order_items WHERE id = ? AND order_id = ?', itemId, orderId);
  if (!item || item.voided) throw notFound('Item not found');
  const qty = body.qty === undefined ? item.qty : v.integer(body.qty, 'Quantity', { min: 0, max: MAX_QTY });
  if (item.kot_no !== null) {
    if (!ctx.isAdmin) throw forbidden('This item was already sent to the kitchen. Unlock admin to void it.');
    if (qty !== 0) throw badRequest('Items sent to the kitchen can only be voided');
    ctx.store.update('order_items', itemId, { voided: 1 });
    audit.record(ctx, 'order.void-item', 'order', orderId, item.name);
  } else if (qty === 0) {
    ctx.store.run('DELETE FROM order_items WHERE id = ?', itemId);
  } else {
    const changes = { qty };
    if (body.unitPrice !== undefined && body.unitPrice !== '') {
      changes.unit_price = v.rupees(body.unitPrice, 'Price');
      if (changes.unit_price !== item.unit_price) audit.record(ctx, 'order.price-change', 'order', orderId, `${item.name}: ${item.unit_price} -> ${changes.unit_price}`);
    }
    ctx.store.update('order_items', itemId, changes);
  }
  return orderDetail(ctx.store, orderId);
}

function sendKot(ctx, orderId) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  return ctx.store.tx(() => {
    const pending = ctx.store.all("SELECT id FROM order_items WHERE order_id = ? AND kot_no IS NULL AND voided = 0 AND category = 'FOOD'", orderId);
    if (!pending.length) throw conflict('No new food items to send to the kitchen');
    const kotNo = sequences.kotNumber(ctx.store, ctx.today());
    ctx.store.run("UPDATE order_items SET kot_no = ? WHERE order_id = ? AND kot_no IS NULL AND voided = 0 AND category = 'FOOD'", kotNo, orderId);
    return { kotNo, order: orderDetail(ctx.store, orderId) };
  });
}

function setDiscount(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const type = v.oneOf(body.type, 'Discount type', ['NONE', 'PERCENT', 'AMOUNT'], 'NONE');
  const value = type === 'PERCENT' ? v.number(body.value, 'Discount %', { min: 0, max: 100 }) : type === 'AMOUNT' ? v.rupees(body.value, 'Discount') : 0;
  ctx.store.update('orders', orderId, { discount_type: type, discount_value: value });
  return orderDetail(ctx.store, orderId);
}

function assertBillable(detail) {
  if (!liveItems(detail.items).length) throw conflict('Add items before billing');
  if (detail.pendingKot) throw conflict('Send the remaining food to the kitchen first');
}

function billTo(order, detail) {
  return {
    name: order.customer_name || (detail.table ? `Table ${detail.table.name}` : 'Walk-in guest'),
    phone: order.customer_phone, gstin: order.customer_gstin, orderCode: order.code
  };
}

/** Takes payment and issues the bill's invoice. */
function settle(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const detail = orderDetail(ctx.store, orderId);
  assertBillable(detail);
  const payments = Array.isArray(body.payments) ? body.payments.filter((p) => Number(p?.amount) > 0) : [];
  if (!payments.length) throw badRequest('Enter the amount received');
  const amounts = payments.map((p) => v.rupees(p.amount, 'Amount'));
  const received = amounts.reduce((s, a) => s + a, 0);
  if (received < detail.totals.total) throw badRequest(`Received ₹${(received / 100).toFixed(2)} is less than the bill`);
  // Any excess is change handed back from the last tender; record only what was kept.
  const change = received - detail.totals.total;
  const lastIndex = payments.length - 1;
  if (change > amounts[lastIndex]) throw badRequest('Overpayment is larger than the last payment; adjust the amounts');

  return ctx.store.tx(() => {
    payments.forEach((p, i) => {
      const kept = i === lastIndex ? amounts[i] - change : amounts[i];
      if (kept > 0) folio.recordPayment(ctx, { orderId }, { ...p, amount: kept / 100, kind: 'PAYMENT' });
    });
    const totals = orderTotals(ctx.store, order, ctx.store.all('SELECT * FROM order_items WHERE order_id = ?', orderId));
    invoices.insertInvoice(ctx, {
      orderId, billTo: billTo(order, detail),
      lines: totals.lines, taxLines: totals.taxLines, taxable: totals.taxable, tax: totals.tax, total: totals.total, paid: totals.total
    });
    ctx.store.update('orders', orderId, { status: 'SETTLED', closed_at: ctx.now() });
    audit.record(ctx, 'order.settle', 'order', orderId, order.code);
    return orderDetail(ctx.store, orderId);
  });
}

/** Moves the bill onto a checked-in guest's folio, keeping food and services apart for GST. */
function postToRoom(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const detail = orderDetail(ctx.store, orderId);
  assertBillable(detail);
  const bookingId = order.booking_id || v.id(body.bookingId, 'Room');
  const booking = ctx.store.get('SELECT status FROM bookings WHERE id = ?', bookingId);
  if (!booking || booking.status !== 'CHECKED_IN') throw conflict('Charges can only be posted to a checked-in guest');
  const { lines } = orderTotals(ctx.store, order, ctx.store.all('SELECT * FROM order_items WHERE order_id = ?', orderId));
  const byCategory = new Map();
  for (const l of lines) byCategory.set(l.category, (byCategory.get(l.category) || 0) + l.amount);
  return ctx.store.tx(() => {
    for (const [category, amount] of byCategory) {
      if (amount <= 0) continue;
      folio.postCharge(ctx, bookingId, {
        description: `${category === 'FOOD' ? 'Restaurant' : 'Services'} ${order.code}`, category, amount: amount / 100, orderId
      });
    }
    ctx.store.update('orders', orderId, { status: 'POSTED', booking_id: bookingId, closed_at: ctx.now() });
    audit.record(ctx, 'order.post-to-room', 'order', orderId, order.code);
    return orderDetail(ctx.store, orderId);
  });
}

function cancelOrder(ctx, orderId, body) {
  const order = getOrderRow(ctx.store, orderId);
  assertOpen(order);
  const sent = ctx.store.get('SELECT 1 AS x FROM order_items WHERE order_id = ? AND kot_no IS NOT NULL AND voided = 0', orderId);
  if (sent && !ctx.isAdmin) throw forbidden('Food has already gone to the kitchen. Unlock admin to cancel this bill.');
  ctx.store.update('orders', orderId, { status: 'CANCELLED', closed_at: ctx.now(), notes: v.text(body.reason, 'Reason', { required: Boolean(sent), max: 200 }) });
  audit.record(ctx, 'order.cancel', 'order', orderId, order.code);
  return orderDetail(ctx.store, orderId);
}

function kotItems(store, orderId, kotNo) {
  return store.all('SELECT name, qty, note FROM order_items WHERE order_id = ? AND kot_no = ? AND voided = 0 ORDER BY id', orderId, kotNo);
}

module.exports = {
  ORDER_KINDS, LINE_CATEGORIES, listMenu, getCatalogItem, saveMenuItem, listTables, saveTable, seedDefaults,
  orderDetail, listOrders, openOrder, setCustomer, addItem, changeItem, sendKot, setDiscount, settle, postToRoom, cancelOrder, kotItems
};
