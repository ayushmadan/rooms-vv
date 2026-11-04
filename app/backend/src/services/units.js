const v = require('../lib/validate');
const { stayNights, addDays } = require('../lib/dates');
const { notFound, conflict, badRequest } = require('../lib/http');
const settings = require('./settings');
const audit = require('./audit');

const HK_STATUSES = ['CLEAN', 'DIRTY', 'OUT_OF_ORDER'];

const DEFAULT_UNITS = [
  { code: '101', name: 'Room 101', kind: 'ROOM', room_type: 'Large', floor: 'First', base_rate: 220000, max_guests: 3 },
  { code: '102', name: 'Room 102', kind: 'ROOM', room_type: 'Large', floor: 'First', base_rate: 220000, max_guests: 3 },
  { code: '103', name: 'Room 103', kind: 'ROOM', room_type: 'Standard', floor: 'First', base_rate: 180000, max_guests: 2 },
  { code: '104', name: 'Room 104', kind: 'ROOM', room_type: 'Standard', floor: 'First', base_rate: 180000, max_guests: 2 },
  { code: '201', name: 'Room 201', kind: 'ROOM', room_type: 'Large', floor: 'Second', base_rate: 220000, max_guests: 3 },
  { code: '202', name: 'Room 202', kind: 'ROOM', room_type: 'Large', floor: 'Second', base_rate: 220000, max_guests: 3 },
  { code: '203', name: 'Room 203', kind: 'ROOM', room_type: 'Standard', floor: 'Second', base_rate: 180000, max_guests: 2 },
  { code: '204', name: 'Room 204', kind: 'ROOM', room_type: 'Standard', floor: 'Second', base_rate: 180000, max_guests: 2 },
  { code: 'PH', name: 'Party Hall', kind: 'HALL', room_type: 'Hall', floor: 'Ground', base_rate: 500000, max_guests: 100 },
  { code: 'DH', name: 'Dining Hall', kind: 'HALL', room_type: 'Hall', floor: 'Ground', base_rate: 2000000, max_guests: 150 }
];

function list(store, { includeInactive = false } = {}) {
  return store.all(`SELECT * FROM units ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY sort, code`);
}

function getById(store, id) {
  const unit = store.get('SELECT * FROM units WHERE id = ?', id);
  if (!unit) throw notFound('Room or hall not found');
  return unit;
}

function parseUnit(body) {
  return {
    code: v.text(body.code, 'Code', { required: true, max: 12 }).toUpperCase(),
    name: v.text(body.name, 'Name', { required: true, max: 60 }),
    kind: v.oneOf(body.kind, 'Kind', ['ROOM', 'HALL']),
    room_type: v.text(body.roomType, 'Type', { max: 40 }),
    floor: v.text(body.floor, 'Floor', { max: 20 }),
    base_rate: v.rupees(body.baseRate, 'Rate per night'),
    max_guests: v.integer(body.maxGuests, 'Max guests', { min: 1, max: 1000, fallback: 2 }),
    sort: v.integer(body.sort, 'Sort order', { min: 0, max: 9999, fallback: 0 })
  };
}

function create(ctx, body) {
  const unit = parseUnit(body);
  if (ctx.store.get('SELECT 1 AS x FROM units WHERE code = ?', unit.code)) throw conflict(`Code ${unit.code} is already used`);
  const now = ctx.now();
  const id = ctx.store.insert('units', { ...unit, created_at: now, updated_at: now });
  audit.record(ctx, 'unit.create', 'unit', id, unit.code);
  return getById(ctx.store, id);
}

function update(ctx, id, body) {
  const existing = getById(ctx.store, id);
  const unit = parseUnit(body);
  const clash = ctx.store.get('SELECT id FROM units WHERE code = ? AND id <> ?', unit.code, id);
  if (clash) throw conflict(`Code ${unit.code} is already used`);
  ctx.store.update('units', id, { ...unit, active: body.active === undefined ? existing.active : v.bool(body.active) ? 1 : 0, updated_at: ctx.now() });
  audit.record(ctx, 'unit.update', 'unit', id, unit.code);
  return getById(ctx.store, id);
}

function setHousekeeping(ctx, id, body) {
  const unit = getById(ctx.store, id);
  const status = v.oneOf(body.status, 'Status', HK_STATUSES);
  const note = v.text(body.note, 'Note', { max: 300 });
  if (status === 'OUT_OF_ORDER' && !note) throw badRequest('Give a reason when marking out of order');
  ctx.store.tx(() => {
    ctx.store.update('units', id, { hk_status: status, hk_note: note, updated_at: ctx.now() });
    ctx.store.insert('housekeeping_log', {
      unit_id: id, from_status: unit.hk_status, to_status: status, note, created_by: ctx.actor, created_at: ctx.now()
    });
  });
  return getById(ctx.store, id);
}

/** Called by check-out so the room shows up on the housekeeping list. */
function markDirty(ctx, id) {
  const unit = getById(ctx.store, id);
  if (unit.hk_status === 'OUT_OF_ORDER') return;
  ctx.store.update('units', id, { hk_status: 'DIRTY', updated_at: ctx.now() });
  ctx.store.insert('housekeeping_log', {
    unit_id: id, from_status: unit.hk_status, to_status: 'DIRTY', note: 'Guest checked out', created_by: ctx.actor, created_at: ctx.now()
  });
}

function housekeepingLog(store, { limit = 100 } = {}) {
  return store.all(
    `SELECT l.*, u.code AS unit_code, u.name AS unit_name FROM housekeeping_log l
     JOIN units u ON u.id = l.unit_id ORDER BY l.id DESC LIMIT ?`,
    limit
  );
}

function seedDefaults(ctx) {
  if (ctx.store.get('SELECT 1 AS x FROM units LIMIT 1')) return;
  const now = ctx.now();
  DEFAULT_UNITS.forEach((unit, index) => ctx.store.insert('units', { ...unit, sort: index, created_at: now, updated_at: now }));
}

// --- Rates -----------------------------------------------------------------

function rentForNight(store, unit, date) {
  const override = store.get('SELECT rate FROM rate_overrides WHERE unit_id = ? AND date = ?', unit.id, date);
  return override ? override.rate : unit.base_rate;
}

function mealRatesFor(store, date) {
  const override = store.get('SELECT breakfast, lunch, dinner FROM meal_rate_overrides WHERE date = ?', date);
  return override || settings.getSection(store, 'meals');
}

function listRateOverrides(store, { from, to }) {
  return store.all(
    `SELECT r.unit_id, r.date, r.rate, u.code AS unit_code FROM rate_overrides r JOIN units u ON u.id = r.unit_id
     WHERE r.date >= ? AND r.date <= ? ORDER BY r.date, u.sort`,
    from, to
  );
}

function setRateOverride(ctx, body) {
  const unit = getById(ctx.store, v.id(body.unitId, 'unitId'));
  const from = v.ymd(body.from, 'From date');
  const to = v.ymd(body.to || body.from, 'To date');
  if (to < from) throw badRequest('To date must be on or after from date');
  const clear = v.bool(body.clear);
  const rate = clear ? null : v.rupees(body.rate, 'Rate');
  const dates = stayNights(from, addDays(to, 1));
  if (dates.length > 366) throw badRequest('Choose a range of at most one year');
  ctx.store.tx(() => {
    for (const date of dates) {
      if (clear) ctx.store.run('DELETE FROM rate_overrides WHERE unit_id = ? AND date = ?', unit.id, date);
      else {
        ctx.store.run(
          'INSERT INTO rate_overrides (unit_id, date, rate) VALUES (?, ?, ?) ON CONFLICT(unit_id, date) DO UPDATE SET rate = excluded.rate',
          unit.id, date, rate
        );
      }
    }
  });
  audit.record(ctx, clear ? 'rate.clear' : 'rate.set', 'unit', unit.id, `${from}..${to}`);
  return { updated: dates.length };
}

function listMealOverrides(store, { from, to }) {
  return store.all('SELECT * FROM meal_rate_overrides WHERE date >= ? AND date <= ? ORDER BY date', from, to);
}

function setMealOverride(ctx, body) {
  const date = v.ymd(body.date, 'Date');
  if (v.bool(body.clear)) {
    ctx.store.run('DELETE FROM meal_rate_overrides WHERE date = ?', date);
    return { date, cleared: true };
  }
  const row = {
    breakfast: v.rupees(body.breakfast, 'Breakfast'),
    lunch: v.rupees(body.lunch, 'Lunch'),
    dinner: v.rupees(body.dinner, 'Dinner')
  };
  ctx.store.run(
    `INSERT INTO meal_rate_overrides (date, breakfast, lunch, dinner) VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET breakfast = excluded.breakfast, lunch = excluded.lunch, dinner = excluded.dinner`,
    date, row.breakfast, row.lunch, row.dinner
  );
  audit.record(ctx, 'meal-rate.set', 'meal_rate', null, date);
  return { date, ...row };
}

module.exports = {
  HK_STATUSES, list, getById, create, update, setHousekeeping, markDirty, housekeepingLog, seedDefaults,
  rentForNight, mealRatesFor, listRateOverrides, setRateOverride, listMealOverrides, setMealOverride
};
