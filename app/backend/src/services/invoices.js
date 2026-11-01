// Invoices are immutable snapshots. Correcting one means voiding it and issuing a new number.
const v = require('../lib/validate');
const { notFound, conflict, forbidden } = require('../lib/http');
const folio = require('./folio');
const settings = require('./settings');
const sequences = require('./sequences');
const audit = require('./audit');

function billToFromGuest(guest) {
  return {
    name: guest.full_name, phone: guest.phone, address: [guest.address, guest.city].filter(Boolean).join(', '),
    company: guest.company, gstin: guest.gstin
  };
}

function insertInvoice(ctx, { bookingId = null, orderId = null, billTo, lines, taxLines, taxable, tax, total, paid }) {
  const prefix = settings.getSection(ctx.store, 'property').invoicePrefix || 'VV';
  const number = sequences.invoiceNumber(ctx.store, prefix, ctx.today());
  const id = ctx.store.insert('invoices', {
    number,
    booking_id: bookingId,
    order_id: orderId,
    issued_at: ctx.now(),
    bill_to: JSON.stringify(billTo),
    lines: JSON.stringify(lines),
    tax_lines: JSON.stringify(taxLines),
    taxable,
    tax,
    total,
    paid,
    created_by: ctx.actor
  });
  audit.record(ctx, 'invoice.issue', 'invoice', id, number);
  return id;
}

/**
 * Issues the booking's invoice. If one is already issued and nothing changed, returns it.
 * If the folio changed, only an admin may void the old one and issue a fresh number.
 */
function issueForBooking(ctx, bookingId, { reissue = false } = {}) {
  const booking = ctx.store.get('SELECT * FROM bookings WHERE id = ?', bookingId);
  if (!booking) throw notFound('Booking not found');
  if (['CANCELLED', 'NO_SHOW'].includes(booking.status) && !folio.forBooking(ctx.store, booking).lines.length) {
    throw conflict('Nothing to invoice on a cancelled booking');
  }
  return ctx.store.tx(() => {
    const f = folio.forBooking(ctx.store, booking);
    const existing = ctx.store.get("SELECT * FROM invoices WHERE booking_id = ? AND status = 'ISSUED' ORDER BY id DESC LIMIT 1", bookingId);
    if (existing) {
      const unchanged = existing.total === f.total && existing.paid === f.paid && existing.lines === JSON.stringify(f.lines);
      if (unchanged) return existing.id;
      if (!reissue) throw conflict(`Invoice ${existing.number} no longer matches the folio. Reissue it to update.`);
      if (!ctx.isAdmin) throw forbidden('Only admin can reissue an invoice');
      voidInvoice(ctx, existing.id, 'Reissued after folio change');
    }
    const guest = ctx.store.get('SELECT * FROM guests WHERE id = ?', booking.guest_id);
    return insertInvoice(ctx, {
      bookingId,
      billTo: { ...billToFromGuest(guest), bookingCode: booking.code, checkIn: booking.check_in, checkOut: booking.check_out },
      lines: f.lines, taxLines: f.taxLines, taxable: f.taxable, tax: f.tax, total: f.total, paid: f.paid
    });
  });
}

function voidInvoice(ctx, id, reason) {
  const invoice = ctx.store.get('SELECT * FROM invoices WHERE id = ?', id);
  if (!invoice) throw notFound('Invoice not found');
  if (invoice.status === 'VOID') return;
  ctx.store.update('invoices', id, { status: 'VOID', void_reason: v.text(reason, 'Reason', { required: true, max: 200 }) });
  audit.record(ctx, 'invoice.void', 'invoice', id, invoice.number);
}

function get(store, id) {
  const row = store.get('SELECT * FROM invoices WHERE id = ?', id);
  if (!row) throw notFound('Invoice not found');
  return {
    id: row.id, number: row.number, bookingId: row.booking_id, orderId: row.order_id, issuedAt: row.issued_at,
    billTo: JSON.parse(row.bill_to), lines: JSON.parse(row.lines), taxLines: JSON.parse(row.tax_lines),
    taxable: row.taxable, tax: row.tax, total: row.total, paid: row.paid, balance: row.total - row.paid,
    status: row.status, voidReason: row.void_reason, createdBy: row.created_by
  };
}

function list(store, { from, to }) {
  return store
    .all(
      `SELECT id, number, booking_id, order_id, issued_at, bill_to, total, paid, tax, status FROM invoices
       WHERE substr(issued_at, 1, 10) >= ? AND substr(issued_at, 1, 10) <= ? ORDER BY id DESC`,
      v.ymd(from, 'From'), v.ymd(to, 'To')
    )
    .map((r) => ({
      id: r.id, number: r.number, bookingId: r.booking_id, orderId: r.order_id, issuedAt: r.issued_at,
      billTo: JSON.parse(r.bill_to).name, total: r.total, paid: r.paid, tax: r.tax, status: r.status
    }));
}

module.exports = { issueForBooking, insertInvoice, voidInvoice, get, list };
