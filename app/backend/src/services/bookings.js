const v = require('../lib/validate');
const { badRequest, conflict, notFound, forbidden } = require('../lib/http');
const { stayNights, daysBetween, addDays } = require('../lib/dates');
const units = require('./units');
const guests = require('./guests');
const folio = require('./folio');
const settings = require('./settings');
const sequences = require('./sequences');
const audit = require('./audit');

const BLOCKING_STATUSES = ['BOOKED', 'CHECKED_IN'];
const DISCOUNT_TYPES = ['NONE', 'PERCENT', 'AMOUNT'];
const MAX_STAY_NIGHTS = 90;
const MAX_RANGE_DAYS = 400;

// --- Parsing ---------------------------------------------------------------

function parseDates(body) {
  const checkIn = v.ymd(body.checkIn, 'Arrival date');
  const checkOut = v.ymd(body.checkOut, 'Departure date');
  if (checkOut <= checkIn) throw badRequest('Departure must be after arrival');
  if (daysBetween(checkIn, checkOut) > MAX_STAY_NIGHTS) throw badRequest(`A single booking can be at most ${MAX_STAY_NIGHTS} nights`);
  return { checkIn, checkOut };
}

function parseMealPlan(plan = {}) {
  return { breakfast: v.bool(plan.breakfast), lunch: v.bool(plan.lunch), dinner: v.bool(plan.dinner) };
}

function parseMealSchedule(schedule, nights) {
  if (!Array.isArray(schedule)) return [];
  return schedule
    .filter((day) => nights.includes(day?.date))
    .map((day) => ({ date: day.date, ...parseMealPlan(day) }));
}

function parseDiscount(type, value, field) {
  const discountType = v.oneOf(type, `${field} discount type`, DISCOUNT_TYPES, 'NONE');
  if (discountType === 'NONE') return { type: 'NONE', value: 0 };
  if (discountType === 'PERCENT') return { type: discountType, value: v.number(value, `${field} discount %`, { min: 0, max: 100 }) };
  return { type: discountType, value: v.rupees(value, `${field} discount amount`) };
}

/** Shared by create, quote and update: everything about how a stay is priced. */
function parseStayTerms(body, nights) {
  const room = parseDiscount(body.roomDiscountType, body.roomDiscountValue, 'Room');
  const meal = parseDiscount(body.mealDiscountType, body.mealDiscountValue, 'Meal');
  const hasRate = body.nightlyRate !== undefined && body.nightlyRate !== null && body.nightlyRate !== '';
  return {
    nightly_rate: hasRate ? v.rupees(body.nightlyRate, 'Rate per night') : null,
    meal_plan: JSON.stringify(parseMealPlan(body.mealPlan)),
    meal_schedule: JSON.stringify(parseMealSchedule(body.mealSchedule, nights)),
    room_discount_type: room.type,
    room_discount_value: room.value,
    meal_discount_type: meal.type,
    meal_discount_value: meal.value
  };
}

// --- Availability ----------------------------------------------------------

function conflictsFor(store, unitId, checkIn, checkOut, ignoreBookingId = 0) {
  return store.all(
    `SELECT b.code, b.check_in, b.check_out, g.full_name FROM bookings b JOIN guests g ON g.id = b.guest_id
     WHERE b.unit_id = ? AND b.id <> ? AND b.status IN ('BOOKED', 'CHECKED_IN') AND b.check_in < ? AND ? < b.check_out`,
    unitId, ignoreBookingId, checkOut, checkIn
  );
}

function assertAvailable(store, unit, checkIn, checkOut, ignoreBookingId) {
  if (!unit.active) throw conflict(`${unit.name} is not in service`);
  const clashes = conflictsFor(store, unit.id, checkIn, checkOut, ignoreBookingId);
  if (clashes.length) {
    const first = clashes[0];
    throw conflict(`${unit.name} is already booked (${first.code}, ${first.full_name}, ${first.check_in} to ${first.check_out})`);
  }
}

function availability(store, { from, to }) {
  const checkIn = v.ymd(from, 'From');
  const checkOut = v.ymd(to, 'To');
  if (checkOut <= checkIn) throw badRequest('To date must be after from date');
  return units.list(store).map((unit) => {
    const clashes = conflictsFor(store, unit.id, checkIn, checkOut);
    return {
      id: unit.id, code: unit.code, name: unit.name, kind: unit.kind, roomType: unit.room_type, floor: unit.floor,
      baseRate: unit.base_rate, maxGuests: unit.max_guests, hkStatus: unit.hk_status,
      available: clashes.length === 0,
      clashes: clashes.map((c) => ({ code: c.code, guest: c.full_name, checkIn: c.check_in, checkOut: c.check_out }))
    };
  });
}

/** Units × dates grid for the reservations chart. */
function chart(store, { from, days }) {
  const start = v.ymd(from, 'From');
  const span = v.integer(days, 'Days', { min: 1, max: 62, fallback: 14 });
  const end = addDays(start, span);
  const rows = store.all(
    `SELECT b.id, b.code, b.unit_id, b.check_in, b.check_out, b.status, b.adults, b.children, g.full_name AS guest
     FROM bookings b JOIN guests g ON g.id = b.guest_id
     WHERE b.status IN ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT') AND b.check_in < ? AND ? < b.check_out
     ORDER BY b.check_in`,
    end, start
  );
  return {
    from: start,
    to: end,
    dates: stayNights(start, end),
    units: units.list(store).map((u) => ({ id: u.id, code: u.code, name: u.name, kind: u.kind, hkStatus: u.hk_status, roomType: u.room_type })),
    bookings: rows.map((b) => ({
      id: b.id, code: b.code, unitId: b.unit_id, checkIn: b.check_in, checkOut: b.check_out, status: b.status, guest: b.guest, pax: b.adults + b.children
    }))
  };
}

// --- Read ------------------------------------------------------------------

function getRow(store, id) {
  const booking = store.get('SELECT * FROM bookings WHERE id = ?', id);
  if (!booking) throw notFound('Booking not found');
  return booking;
}

function findByCode(store, code) {
  return store.get('SELECT * FROM bookings WHERE code = ?', String(code || '').trim().toUpperCase());
}

function summaryDto(store, row) {
  const f = folio.forBooking(store, row);
  return {
    id: row.id,
    code: row.code,
    groupCode: row.group_code,
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: daysBetween(row.check_in, row.check_out),
    adults: row.adults,
    children: row.children,
    source: row.source,
    checkedInAt: row.checked_in_at,
    checkedOutAt: row.checked_out_at,
    unit: { id: row.unit_id, code: row.unit_code, name: row.unit_name, kind: row.unit_kind },
    guest: { id: row.guest_id, fullName: row.guest_name, phone: row.guest_phone },
    total: f.total,
    paid: f.paid,
    balance: f.balance
  };
}

const LIST_SELECT = `
  SELECT b.*, u.code AS unit_code, u.name AS unit_name, u.kind AS unit_kind,
         g.full_name AS guest_name, g.phone AS guest_phone
  FROM bookings b JOIN units u ON u.id = b.unit_id JOIN guests g ON g.id = b.guest_id`;

function list(store, query) {
  const where = [];
  const params = [];
  if (query.from && query.to) {
    const from = v.ymd(query.from, 'From');
    const to = v.ymd(query.to, 'To');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) throw badRequest(`Choose a range of at most ${MAX_RANGE_DAYS} days`);
    where.push('b.check_in <= ? AND ? <= b.check_out');
    params.push(to, from);
  }
  if (query.status) {
    const statuses = String(query.status).split(',').filter((s) => ['BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'].includes(s));
    if (statuses.length) {
      where.push(`b.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (query.q) {
    const like = `%${String(query.q).trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(`(b.code LIKE ? ESCAPE '\\' OR g.full_name LIKE ? ESCAPE '\\' OR g.phone LIKE ? ESCAPE '\\')`);
    params.push(like, like, like);
  }
  if (query.guestId) {
    where.push('b.guest_id = ?');
    params.push(v.id(query.guestId, 'guestId'));
  }
  const limit = v.integer(query.limit, 'limit', { min: 1, max: 500, fallback: 200 });
  const sql = `${LIST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY b.check_in DESC, b.id DESC LIMIT ?`;
  return store.all(sql, ...params, limit).map((row) => summaryDto(store, row));
}

function detail(store, id) {
  const row = store.get(`${LIST_SELECT} WHERE b.id = ?`, id);
  if (!row) throw notFound('Booking not found');
  const f = folio.forBooking(store, row);
  const declaration = store.get('SELECT * FROM declarations WHERE booking_id = ?', id);
  const invoices = store.all('SELECT id, number, issued_at, total, status FROM invoices WHERE booking_id = ? ORDER BY id DESC', id);
  const group = row.group_code
    ? store.all(`${LIST_SELECT} WHERE b.group_code = ? AND b.id <> ? ORDER BY u.sort`, row.group_code, id).map((r) => ({ id: r.id, code: r.code, unit: r.unit_name, status: r.status }))
    : [];
  return {
    ...summaryDto(store, row),
    nightlyRate: row.nightly_rate,
    mealPlan: JSON.parse(row.meal_plan),
    mealSchedule: JSON.parse(row.meal_schedule),
    discounts: {
      roomType: row.room_discount_type, roomValue: row.room_discount_value,
      mealType: row.meal_discount_type, mealValue: row.meal_discount_value
    },
    notes: row.notes,
    cancelReason: row.cancel_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    guest: guests.get(store, row.guest_id),
    guestLocked: guests.isLocked(store, row.guest_id),
    declaration: declaration ? declarationDto(declaration) : null,
    folio: {
      lines: f.lines, taxLines: f.taxLines, taxable: f.taxable, tax: f.tax, total: f.total, paid: f.paid, balance: f.balance,
      payments: f.payments.map(paymentDto),
      nights: f.stay.nights
    },
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, issuedAt: i.issued_at, total: i.total, status: i.status })),
    group
  };
}

function paymentDto(p) {
  return {
    id: p.id, kind: p.kind, mode: p.mode, amount: p.amount, reference: p.reference, note: p.note,
    receivedAt: p.received_at, voided: Boolean(p.voided_at), voidReason: p.void_reason, createdBy: p.created_by
  };
}

function declarationDto(d) {
  return {
    coGuests: JSON.parse(d.co_guests), arrivingFrom: d.arriving_from, goingTo: d.going_to, purpose: d.purpose,
    vehicleNo: d.vehicle_no, passportNo: d.passport_no, visaNo: d.visa_no, visaValidTill: d.visa_valid_till,
    arrivedInIndiaOn: d.arrived_in_india_on, remarks: d.remarks, createdAt: d.created_at, updatedAt: d.updated_at
  };
}

// --- Quote and create ------------------------------------------------------

function quote(ctx, body) {
  const unit = units.getById(ctx.store, v.id(body.unitId, 'Room'));
  const { checkIn, checkOut } = parseDates(body);
  const nights = stayNights(checkIn, checkOut);
  const terms = parseStayTerms(body, nights);
  const draft = {
    id: 0, unit_id: unit.id, check_in: checkIn, check_out: checkOut, status: 'BOOKED',
    rate_snapshot: JSON.stringify(folio.buildRateSnapshot(ctx.store, unit, nights)), ...terms
  };
  const stay = folio.stayPricing(ctx.store, draft, unit);
  const tax = folio.computeTax(
    [{ category: unit.kind === 'HALL' ? 'HALL' : 'ROOM', amount: stay.roomNet }, { category: 'FOOD', amount: stay.mealNet }],
    settings.getSection(ctx.store, 'taxes')
  );
  return { unitId: unit.id, ...stay, tax: tax.tax, grandTotal: tax.total, clashes: conflictsFor(ctx.store, unit.id, checkIn, checkOut) };
}

function resolveGuest(ctx, body) {
  if (body.guestId) return guests.getRow(ctx.store, v.id(body.guestId, 'Guest')).id;
  if (!body.guest) throw badRequest('Choose an existing guest or enter new guest details');
  return guests.create(ctx, body.guest).id;
}

/** Creates one booking per selected room, linked by a group code, in a single transaction. */
function create(ctx, body) {
  const { checkIn, checkOut } = parseDates(body);
  const unitIds = [...new Set((Array.isArray(body.unitIds) ? body.unitIds : [body.unitId]).filter(Boolean).map((id) => v.id(id, 'Room')))];
  if (!unitIds.length) throw badRequest('Select at least one room or hall');
  const nights = stayNights(checkIn, checkOut);
  const terms = parseStayTerms(body, nights);
  const adults = v.integer(body.adults, 'Adults', { min: 1, max: 500, fallback: 1 });
  const children = v.integer(body.children, 'Children', { min: 0, max: 500, fallback: 0 });
  const source = v.text(body.source, 'Source', { max: 40 }) || 'Walk-in';
  const notes = v.text(body.notes, 'Notes', { max: 1000 });
  const prefix = settings.getSection(ctx.store, 'property').invoicePrefix || 'VV';

  return ctx.store.tx(() => {
    const guestId = resolveGuest(ctx, body);
    const created = [];
    for (const unitId of unitIds) {
      const unit = units.getById(ctx.store, unitId);
      assertAvailable(ctx.store, unit, checkIn, checkOut);
      const now = ctx.now();
      const code = sequences.bookingCode(ctx.store, prefix, checkIn);
      const id = ctx.store.insert('bookings', {
        code,
        group_code: '',
        guest_id: guestId,
        unit_id: unit.id,
        check_in: checkIn,
        check_out: checkOut,
        adults,
        children,
        ...terms,
        rate_snapshot: JSON.stringify(folio.buildRateSnapshot(ctx.store, unit, nights)),
        source,
        notes,
        created_by: ctx.actor,
        created_at: now,
        updated_at: now
      });
      created.push({ id, code });
      audit.record(ctx, 'booking.create', 'booking', id, code);
    }
    if (created.length > 1) {
      for (const b of created) ctx.store.update('bookings', b.id, { group_code: created[0].code });
    }
    if (body.advance && Number(body.advance.amount) > 0) {
      folio.recordPayment(ctx, { bookingId: created[0].id }, { ...body.advance, kind: 'ADVANCE' });
    }
    return { bookings: created };
  });
}

// --- Changes ---------------------------------------------------------------

function assertEditable(ctx, booking) {
  if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) throw conflict('This booking is cancelled');
  if (booking.status === 'CHECKED_OUT' && !ctx.isAdmin) throw forbidden('Checked-out bookings can be changed only by admin');
}

/** Moves, extends or reprices a booking. Rates already frozen for kept nights stay as they were. */
function update(ctx, id, body) {
  const booking = getRow(ctx.store, id);
  assertEditable(ctx, booking);
  const { checkIn, checkOut } = parseDates({ checkIn: body.checkIn ?? booking.check_in, checkOut: body.checkOut ?? booking.check_out });
  if (booking.status === 'CHECKED_IN' && checkIn !== booking.check_in) throw conflict('Arrival date cannot change after check-in');
  const unit = units.getById(ctx.store, body.unitId ? v.id(body.unitId, 'Room') : booking.unit_id);
  const nights = stayNights(checkIn, checkOut);
  const previous = unit.id === booking.unit_id ? folio.parseSnapshot(booking) : undefined;
  const terms = parseStayTerms({
    nightlyRate: booking.nightly_rate === null ? undefined : booking.nightly_rate / 100,
    mealPlan: JSON.parse(booking.meal_plan),
    mealSchedule: JSON.parse(booking.meal_schedule),
    roomDiscountType: booking.room_discount_type,
    roomDiscountValue: booking.room_discount_type === 'AMOUNT' ? booking.room_discount_value / 100 : booking.room_discount_value,
    mealDiscountType: booking.meal_discount_type,
    mealDiscountValue: booking.meal_discount_type === 'AMOUNT' ? booking.meal_discount_value / 100 : booking.meal_discount_value,
    ...body
  }, nights);

  return ctx.store.tx(() => {
    assertAvailable(ctx.store, unit, checkIn, checkOut, booking.id);
    ctx.store.update('bookings', id, {
      unit_id: unit.id,
      check_in: checkIn,
      check_out: checkOut,
      ...terms,
      rate_snapshot: JSON.stringify(folio.buildRateSnapshot(ctx.store, unit, nights, previous)),
      adults: v.integer(body.adults ?? booking.adults, 'Adults', { min: 1, max: 500 }),
      children: v.integer(body.children ?? booking.children, 'Children', { min: 0, max: 500 }),
      source: body.source === undefined ? booking.source : v.text(body.source, 'Source', { max: 40 }),
      notes: body.notes === undefined ? booking.notes : v.text(body.notes, 'Notes', { max: 1000 }),
      updated_at: ctx.now()
    });
    if (unit.id !== booking.unit_id && booking.status === 'CHECKED_IN') units.markDirty(ctx, booking.unit_id);
    audit.record(ctx, 'booking.update', 'booking', id, `${unit.code} ${checkIn}..${checkOut}`);
    return detail(ctx.store, id);
  });
}

function parseDeclaration(body = {}) {
  const coGuests = Array.isArray(body.coGuests) ? body.coGuests.slice(0, 30) : [];
  return {
    co_guests: JSON.stringify(
      coGuests
        .map((g, i) => ({
          name: v.text(g?.name, `Guest ${i + 2} name`, { max: 120 }),
          age: g?.age === '' || g?.age === undefined ? '' : v.integer(g.age, `Guest ${i + 2} age`, { min: 0, max: 120 }),
          relation: v.text(g?.relation, `Guest ${i + 2} relation`, { max: 40 }),
          idType: v.text(g?.idType, `Guest ${i + 2} ID type`, { max: 40 }),
          idNumber: v.text(g?.idNumber, `Guest ${i + 2} ID number`, { max: 40 }).toUpperCase()
        }))
        .filter((g) => g.name)
    ),
    arriving_from: v.text(body.arrivingFrom, 'Arriving from', { max: 120 }),
    going_to: v.text(body.goingTo, 'Next destination', { max: 120 }),
    purpose: v.text(body.purpose, 'Purpose of visit', { max: 120 }),
    vehicle_no: v.text(body.vehicleNo, 'Vehicle number', { max: 20 }).toUpperCase(),
    passport_no: v.text(body.passportNo, 'Passport number', { max: 20 }).toUpperCase(),
    visa_no: v.text(body.visaNo, 'Visa number', { max: 30 }).toUpperCase(),
    visa_valid_till: body.visaValidTill ? v.ymd(body.visaValidTill, 'Visa valid till') : '',
    arrived_in_india_on: body.arrivedInIndiaOn ? v.ymd(body.arrivedInIndiaOn, 'Arrived in India on') : '',
    remarks: v.text(body.remarks, 'Remarks', { max: 500 })
  };
}

function saveDeclaration(ctx, bookingId, body) {
  const booking = getRow(ctx.store, bookingId);
  const values = parseDeclaration(body);
  const guest = guests.getRow(ctx.store, booking.guest_id);
  if (guest.nationality && !/^indian$/i.test(guest.nationality) && !values.passport_no) {
    throw badRequest('Passport number is required for foreign nationals');
  }
  const existing = ctx.store.get('SELECT id FROM declarations WHERE booking_id = ?', bookingId);
  const now = ctx.now();
  if (existing) ctx.store.update('declarations', existing.id, { ...values, updated_at: now });
  else ctx.store.insert('declarations', { booking_id: bookingId, ...values, created_by: ctx.actor, created_at: now, updated_at: now });
  audit.record(ctx, 'declaration.save', 'booking', bookingId);
}

/** ISO instant from the UI, or now. Rejects instants far in the future. */
function parseEventTime(ctx, value, field) {
  if (!value) return ctx.now();
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw badRequest(`${field} is not a valid date and time`);
  if (ms > Date.parse(ctx.now()) + 60 * 60 * 1000) throw badRequest(`${field} cannot be in the future`);
  return new Date(ms).toISOString();
}

function checkIn(ctx, id, body = {}) {
  const booking = getRow(ctx.store, id);
  if (booking.status !== 'BOOKED') throw conflict(`Cannot check in a booking that is ${booking.status.replace('_', ' ').toLowerCase()}`);
  if (booking.check_in > ctx.today()) throw conflict(`This booking arrives on ${booking.check_in}. Change its dates to check in early.`);
  const unit = units.getById(ctx.store, booking.unit_id);
  if (unit.hk_status === 'OUT_OF_ORDER') throw conflict(`${unit.name} is out of order: ${unit.hk_note}`);
  const occupied = ctx.store.get("SELECT code FROM bookings WHERE unit_id = ? AND status = 'CHECKED_IN' AND id <> ?", unit.id, id);
  if (occupied) throw conflict(`${unit.name} is still occupied by ${occupied.code}. Check that guest out first.`);

  return ctx.store.tx(() => {
    if (body.guest) guests.update({ ...ctx, isAdmin: true }, booking.guest_id, body.guest);
    const guest = guests.getRow(ctx.store, booking.guest_id);
    if (!guest.id_type || !guest.id_number) throw badRequest('Record the guest photo ID type and number before check-in');
    saveDeclaration(ctx, id, body.declaration);
    ctx.store.update('bookings', id, {
      status: 'CHECKED_IN',
      checked_in_at: parseEventTime(ctx, body.at, 'Check-in time'),
      adults: v.integer(body.adults ?? booking.adults, 'Adults', { min: 1, max: 500 }),
      children: v.integer(body.children ?? booking.children, 'Children', { min: 0, max: 500 }),
      updated_at: ctx.now()
    });
    audit.record(ctx, 'booking.check-in', 'booking', id, booking.code);
    return detail(ctx.store, id);
  });
}

function checkOut(ctx, id, body = {}) {
  const booking = getRow(ctx.store, id);
  if (booking.status !== 'CHECKED_IN') throw conflict('Only checked-in guests can be checked out');
  const today = ctx.today();
  return ctx.store.tx(() => {
    // Leaving early: bill up to today, but never less than one night.
    const earliestCheckOut = today > booking.check_in ? today : addDays(booking.check_in, 1);
    if (v.bool(body.shortenStay) && earliestCheckOut < booking.check_out) {
      update(ctx, id, { checkOut: earliestCheckOut });
    }
    const current = getRow(ctx.store, id);
    const { balance } = folio.forBooking(ctx.store, current);
    if (balance > 0 && !v.bool(body.allowBalance)) {
      throw conflict(`Balance of Rs ${(balance / 100).toFixed(2)} is still due. Collect it or confirm check-out with balance.`);
    }
    ctx.store.update('bookings', id, { status: 'CHECKED_OUT', checked_out_at: parseEventTime(ctx, body.at, 'Check-out time'), updated_at: ctx.now() });
    units.markDirty(ctx, current.unit_id);
    audit.record(ctx, 'booking.check-out', 'booking', id, booking.code);
    return detail(ctx.store, id);
  });
}

function cancel(ctx, id, body = {}) {
  const booking = getRow(ctx.store, id);
  if (booking.status !== 'BOOKED') throw conflict('Only bookings that have not checked in can be cancelled');
  const status = v.bool(body.noShow) ? 'NO_SHOW' : 'CANCELLED';
  ctx.store.update('bookings', id, {
    status,
    cancelled_at: ctx.now(),
    cancel_reason: v.text(body.reason, 'Reason', { required: true, max: 200 }),
    updated_at: ctx.now()
  });
  audit.record(ctx, `booking.${status.toLowerCase()}`, 'booking', id, booking.code);
  return detail(ctx.store, id);
}

/** Undo a mistaken check-in or check-out. Admin only. */
function revertStatus(ctx, id) {
  const booking = getRow(ctx.store, id);
  const previous = { CHECKED_IN: 'BOOKED', CHECKED_OUT: 'CHECKED_IN', CANCELLED: 'BOOKED', NO_SHOW: 'BOOKED' }[booking.status];
  if (!previous) throw conflict('Nothing to undo');
  return ctx.store.tx(() => {
    if (previous === 'BOOKED' || previous === 'CHECKED_IN') {
      assertAvailable(ctx.store, units.getById(ctx.store, booking.unit_id), booking.check_in, booking.check_out, id);
    }
    const changes = { status: previous, updated_at: ctx.now() };
    if (booking.status === 'CHECKED_IN') changes.checked_in_at = null;
    if (booking.status === 'CHECKED_OUT') changes.checked_out_at = null;
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) Object.assign(changes, { cancelled_at: null, cancel_reason: '' });
    ctx.store.update('bookings', id, changes);
    audit.record(ctx, 'booking.revert', 'booking', id, `${booking.status} -> ${previous}`);
    return detail(ctx.store, id);
  });
}

module.exports = {
  BLOCKING_STATUSES, availability, chart, list, detail, getRow, findByCode, quote, create, update,
  checkIn, checkOut, cancel, revertStatus, saveDeclaration
};
