// A booking's folio: room and meal charges from the stay, posted extras, payments and tax.
const v = require('../lib/validate');
const { notFound, badRequest, conflict } = require('../lib/http');
const { splitInclusiveTax, addExclusiveTax } = require('../lib/money');
const { formatDisplayDate } = require('../lib/dates');
const pricing = require('./pricing');
const units = require('./units');
const settings = require('./settings');
const audit = require('./audit');

const CHARGE_CATEGORIES = ['FOOD', 'SERVICE', 'OTHER'];
const PAYMENT_MODES = ['CASH', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER'];
const PAYMENT_KINDS = ['ADVANCE', 'PAYMENT', 'REFUND'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function taxRateFor(category, taxes) {
  switch (category) {
    case 'ROOM': return taxes.roomGstPercent;
    case 'HALL': return taxes.hallGstPercent;
    case 'FOOD': return taxes.foodGstPercent;
    case 'SERVICE':
    case 'OTHER': return taxes.serviceGstPercent;
    default: throw new Error(`No tax rate for category ${category}`);
  }
}

/** Groups line amounts by category and applies GST per category. */
function computeTax(lines, taxes) {
  const byCategory = new Map();
  for (const line of lines) byCategory.set(line.category, (byCategory.get(line.category) || 0) + line.amount);

  const taxLines = [];
  for (const [category, amount] of byCategory) {
    if (amount <= 0) continue;
    const ratePercent = taxRateFor(category, taxes);
    const { taxable, tax } = taxes.pricesIncludeTax ? splitInclusiveTax(amount, ratePercent) : addExclusiveTax(amount, ratePercent);
    taxLines.push({ category, ratePercent, taxable, tax });
  }
  const taxable = taxLines.reduce((s, t) => s + t.taxable, 0);
  const tax = taxLines.reduce((s, t) => s + t.tax, 0);
  const linesTotal = lines.reduce((s, l) => s + l.amount, 0);
  return { taxLines, taxable, tax, total: taxes.pricesIncludeTax ? linesTotal : linesTotal + tax };
}

// --- Rates frozen at booking time ------------------------------------------

function parseSnapshot(booking) {
  const snapshot = JSON.parse(booking.rate_snapshot || '{}');
  return { rent: snapshot.rent || {}, meals: snapshot.meals || {} };
}

/** Freezes today's rates for every night of a stay, keeping rates already frozen. */
function buildRateSnapshot(store, unit, nights, previous = { rent: {}, meals: {} }) {
  const snapshot = { rent: {}, meals: {} };
  for (const date of nights) {
    snapshot.rent[date] = previous.rent[date] ?? units.rentForNight(store, unit, date);
    snapshot.meals[date] = previous.meals[date] ?? units.mealRatesFor(store, date);
  }
  return snapshot;
}

function stayPricing(store, booking, unit) {
  const snapshot = parseSnapshot(booking);
  return pricing.computeStay({
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    rentForNight: (date) => booking.nightly_rate ?? snapshot.rent[date] ?? units.rentForNight(store, unit, date),
    mealRatesFor: (date) => snapshot.meals[date] ?? units.mealRatesFor(store, date),
    mealPlan: JSON.parse(booking.meal_plan || '{}'),
    mealSchedule: JSON.parse(booking.meal_schedule || '[]'),
    discounts: {
      roomType: booking.room_discount_type,
      roomValue: booking.room_discount_value,
      mealType: booking.meal_discount_type,
      mealValue: booking.meal_discount_value
    }
  });
}

function describeDiscount(type, value) {
  return type === 'PERCENT' ? `${value}%` : 'flat';
}

function stayLines(booking, unit, stay) {
  const unitCategory = unit.kind === 'HALL' ? 'HALL' : 'ROOM';
  const lines = pricing.groupNightsByRent(stay.nights).map((group) => ({
    description: `${unit.name} · ${group.count} ${unit.kind === 'HALL' ? 'day' : 'night'}${group.count > 1 ? 's' : ''} from ${formatDisplayDate(group.from)}`,
    category: unitCategory,
    qty: group.count,
    rate: group.rate,
    amount: group.count * group.rate
  }));
  if (stay.roomDiscount) {
    lines.push({
      description: `Discount on ${unit.kind === 'HALL' ? 'hall' : 'room'} (${describeDiscount(booking.room_discount_type, booking.room_discount_value)})`,
      category: unitCategory, qty: 1, rate: -stay.roomDiscount, amount: -stay.roomDiscount
    });
  }
  for (const group of pricing.groupMeals(stay.nights)) {
    lines.push({ description: MEAL_LABELS[group.meal], category: 'FOOD', qty: group.count, rate: group.rate, amount: group.count * group.rate });
  }
  if (stay.mealDiscount) {
    lines.push({
      description: `Discount on meals (${describeDiscount(booking.meal_discount_type, booking.meal_discount_value)})`,
      category: 'FOOD', qty: 1, rate: -stay.mealDiscount, amount: -stay.mealDiscount
    });
  }
  return lines;
}

function activeCharges(store, bookingId) {
  return store.all('SELECT * FROM charges WHERE booking_id = ? AND voided_at IS NULL ORDER BY date, id', bookingId);
}

function paidTotal(payments) {
  return payments.filter((p) => !p.voided_at).reduce((sum, p) => sum + (p.kind === 'REFUND' ? -p.amount : p.amount), 0);
}

function forBooking(store, booking) {
  const unit = units.getById(store, booking.unit_id);
  const taxes = settings.getSection(store, 'taxes');
  const stay = stayPricing(store, booking, unit);
  const charges = activeCharges(store, booking.id);
  const lines = booking.status === 'CANCELLED' || booking.status === 'NO_SHOW' ? [] : stayLines(booking, unit, stay);
  for (const charge of charges) {
    lines.push({
      description: `${charge.description} (${formatDisplayDate(charge.date)})`, category: charge.category,
      qty: charge.qty, rate: charge.unit_price ?? charge.amount, amount: charge.amount, chargeId: charge.id
    });
  }
  const payments = store.all('SELECT * FROM payments WHERE booking_id = ? ORDER BY received_at, id', booking.id);
  const totals = computeTax(lines, taxes);
  const paid = paidTotal(payments);
  return { stay, lines, ...totals, paid, balance: totals.total - paid, payments, charges };
}

// --- Charges and payments --------------------------------------------------

function getBookingRow(store, id) {
  const booking = store.get('SELECT * FROM bookings WHERE id = ?', id);
  if (!booking) throw notFound('Booking not found');
  return booking;
}

/**
 * Adds an extra to a folio. Either pick a catalogue item (its price can be changed for this
 * guest) or type a description; amount = qty × unit price. `amount` alone is accepted for
 * single-line postings such as restaurant bills.
 */
function postCharge(ctx, bookingId, body) {
  const booking = getBookingRow(ctx.store, bookingId);
  if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) throw conflict('Cannot add charges to a cancelled booking');
  const item = body.catalogItemId ? ctx.store.get('SELECT * FROM menu_items WHERE id = ?', v.id(body.catalogItemId, 'Item')) : null;
  if (body.catalogItemId && !item) throw notFound('Item not found');
  const qty = v.integer(body.qty, 'Quantity', { min: 1, max: 999, fallback: 1 });
  const hasUnitPrice = body.unitPrice !== undefined && body.unitPrice !== null && body.unitPrice !== '';
  const unitPrice = hasUnitPrice ? v.rupees(body.unitPrice, 'Price') : item ? item.price : v.rupees(body.amount, 'Amount');
  const amount = unitPrice * qty;
  if (!amount) throw badRequest('Amount must be more than zero');
  const id = ctx.store.insert('charges', {
    booking_id: booking.id,
    date: body.date ? v.ymd(body.date, 'Date') : ctx.today(),
    description: item ? item.name : v.text(body.description, 'Description', { required: true, max: 120 }),
    category: item ? item.tax_category : v.oneOf(body.category, 'Category', CHARGE_CATEGORIES, 'OTHER'),
    qty,
    unit_price: unitPrice,
    amount,
    order_id: body.orderId ?? null,
    created_by: ctx.actor,
    created_at: ctx.now()
  });
  audit.record(ctx, 'charge.post', 'booking', booking.id, `${id}`);
  return id;
}

function voidCharge(ctx, chargeId, reason) {
  const charge = ctx.store.get('SELECT * FROM charges WHERE id = ?', chargeId);
  if (!charge || charge.voided_at) throw notFound('Charge not found');
  ctx.store.update('charges', chargeId, { voided_at: ctx.now(), void_reason: v.text(reason, 'Reason', { required: true, max: 200 }) });
  audit.record(ctx, 'charge.void', 'booking', charge.booking_id, `${chargeId}`);
}

function recordPayment(ctx, target, body) {
  const kind = v.oneOf(body.kind, 'Payment type', PAYMENT_KINDS, 'PAYMENT');
  const amount = v.rupees(body.amount, 'Amount');
  if (!amount) throw badRequest('Amount must be more than zero');
  const id = ctx.store.insert('payments', {
    booking_id: target.bookingId ?? null,
    order_id: target.orderId ?? null,
    kind,
    mode: v.oneOf(body.mode, 'Payment mode', PAYMENT_MODES, 'CASH'),
    amount,
    reference: v.text(body.reference, 'Reference', { max: 80 }),
    note: v.text(body.note, 'Note', { max: 200 }),
    received_at: ctx.now(),
    created_by: ctx.actor
  });
  audit.record(ctx, `payment.${kind.toLowerCase()}`, target.bookingId ? 'booking' : 'order', target.bookingId ?? target.orderId, `${id}`);
  return id;
}

function voidPayment(ctx, paymentId, reason) {
  const payment = ctx.store.get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!payment || payment.voided_at) throw notFound('Payment not found');
  ctx.store.update('payments', paymentId, { voided_at: ctx.now(), void_reason: v.text(reason, 'Reason', { required: true, max: 200 }) });
  audit.record(ctx, 'payment.void', payment.booking_id ? 'booking' : 'order', payment.booking_id ?? payment.order_id, `${paymentId}`);
}

module.exports = {
  CHARGE_CATEGORIES, PAYMENT_MODES, PAYMENT_KINDS,
  computeTax, buildRateSnapshot, parseSnapshot, stayPricing, forBooking, paidTotal,
  postCharge, voidCharge, recordPayment, voidPayment
};
