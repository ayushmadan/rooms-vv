// One-time import from the MongoDB-based version (1.x) of the app.
// Accepts the JSON files produced by MongoDB Compass "Export Collection" or `mongoexport --jsonArray`.
const fs = require('fs');
const path = require('path');
const { conflict, badRequest } = require('../lib/http');
const { ymdInZone, addDays, stayNights } = require('../lib/dates');
const { rupeesToPaise } = require('../lib/money');
const settings = require('./settings');
const folio = require('./folio');
const files = require('./files');
const guests = require('./guests');
const audit = require('./audit');

const LEGACY_TIME_ZONE = 'Asia/Kolkata';
const COLLECTIONS = ['settings', 'rooms', 'customers', 'bookings', 'rateconfigs', 'mealrateconfigs'];
const FLOOR_NAMES = { 0: 'Ground', 1: 'First', 2: 'Second' };
const SIZE_INFO = {
  BIG: { kind: 'ROOM', roomType: 'Large', rateKey: 'defaultBigRoomRent', fallback: 2200, maxGuests: 3 },
  SMALL: { kind: 'ROOM', roomType: 'Standard', rateKey: 'defaultSmallRoomRent', fallback: 1800, maxGuests: 2 },
  PARTY_HALL: { kind: 'HALL', roomType: 'Hall', rateKey: 'defaultPartyHallRent', fallback: 5000, maxGuests: 100 },
  DINING_HALL: { kind: 'HALL', roomType: 'Hall', rateKey: 'defaultDiningHallRent', fallback: 20000, maxGuests: 150 }
};
const STATUS_MAP = { BOOKED: 'BOOKED', CHECKED_IN: 'CHECKED_IN', CHECKED_OUT: 'CHECKED_OUT', CLEANED: 'CHECKED_OUT', CANCELLED: 'CANCELLED' };
const PAYMENT_KIND_MAP = { ADVANCE: 'ADVANCE', SETTLEMENT: 'PAYMENT', REFUND: 'REFUND' };
const PAYMENT_MODES = ['CASH', 'UPI', 'CREDIT_CARD', 'DEBIT_CARD'];
const DISCOUNT_MAP = { PERCENTAGE: 'PERCENT', AMOUNT: 'AMOUNT', NONE: 'NONE' };
const BOOKING_CODE_PATTERN = /^([A-Z]+)-(\d{6})-(\d{4})$/;

/** Converts MongoDB Extended JSON ($oid, $date, $numberLong, ...) into plain JS values. */
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== 'object') return value;
  if ('$oid' in value) return value.$oid;
  if ('$date' in value) {
    const raw = normalize(value.$date);
    return new Date(typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw).toISOString();
  }
  for (const key of ['$numberLong', '$numberInt', '$numberDouble', '$numberDecimal']) {
    if (key in value) return Number(value[key]);
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
}

function mapIdType(raw) {
  const text = String(raw || '').trim().toLowerCase();
  return guests.ID_TYPES.find((t) => t.toLowerCase() === text || text.startsWith(t.toLowerCase().slice(0, 4))) || (text ? 'Other' : '');
}

function readPhoto(ctx, photoPath, uploadDirs) {
  if (!photoPath) return null;
  const candidates = [photoPath, ...uploadDirs.map((dir) => path.join(dir, path.basename(photoPath)))];
  const found = candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch (_err) {
      return false;
    }
  });
  if (!found) return null;
  try {
    return files.save(ctx, { name: path.basename(found), buffer: fs.readFileSync(found) });
  } catch (_err) {
    return null; // Unreadable or unsupported legacy photo: import the guest without it.
  }
}

function assertEmptyTarget(store) {
  const used = store.get('SELECT (SELECT COUNT(*) FROM bookings) + (SELECT COUNT(*) FROM guests) AS n').n;
  if (used > 0) throw conflict('Old data can only be imported into an empty system. Use a fresh install, or export a backup and reset first.');
}

function importSettings(ctx, legacy) {
  if (!legacy) return;
  const meals = {
    breakfast: rupeesToPaise(legacy.breakfastRate ?? 100),
    lunch: rupeesToPaise(legacy.lunchRate ?? 150),
    dinner: rupeesToPaise(legacy.dinnerRate ?? 200)
  };
  settings.putSection(ctx.store, 'meals', meals);
  if (legacy.gstPercent !== undefined) {
    const taxes = settings.getSection(ctx.store, 'taxes');
    const rate = Number(legacy.gstPercent);
    settings.putSection(ctx.store, 'taxes', { ...taxes, roomGstPercent: rate, hallGstPercent: rate, foodGstPercent: rate, serviceGstPercent: rate, pricesIncludeTax: true });
  }
}

function importRooms(ctx, rooms, legacySettings) {
  ctx.store.run('DELETE FROM rate_overrides');
  ctx.store.run('DELETE FROM units');
  const idMap = new Map();
  const now = ctx.now();
  rooms.forEach((room, index) => {
    const info = SIZE_INFO[room.size] || SIZE_INFO.SMALL;
    const code = String(room.code).toUpperCase().slice(0, 12);
    const name = info.kind === 'HALL' ? (room.size === 'PARTY_HALL' ? 'Party Hall' : 'Dining Hall') : `Room ${code}`;
    const id = ctx.store.insert('units', {
      code, name, kind: info.kind, room_type: info.roomType, floor: FLOOR_NAMES[room.floor] ?? String(room.floor ?? ''),
      base_rate: rupeesToPaise(legacySettings?.[info.rateKey] ?? info.fallback), max_guests: info.maxGuests,
      active: room.active === false ? 0 : 1, sort: index, created_at: now, updated_at: now
    });
    idMap.set(room._id, id);
  });
  return idMap;
}

function importCustomers(ctx, customers, uploadDirs) {
  const idMap = new Map();
  let photos = 0;
  for (const c of customers) {
    const photoId = readPhoto(ctx, c.photoIdPath, uploadDirs);
    if (photoId) photos += 1;
    const id = ctx.store.insert('guests', {
      full_name: String(c.fullName || 'Unknown guest').slice(0, 120),
      phone: String(c.phone || '').slice(0, 20),
      email: String(c.email || '').slice(0, 120),
      address: String(c.address || '').slice(0, 300),
      id_type: mapIdType(c.idType),
      id_number: String(c.idNumber || '').toUpperCase().slice(0, 40),
      id_photo_file_id: photoId,
      created_by: 'import',
      created_at: c.createdAt || ctx.now(),
      updated_at: c.updatedAt || ctx.now()
    });
    idMap.set(c._id, id);
  }
  return { idMap, photos };
}

function importPayments(ctx, bookingId, legacy) {
  let recorded = 0;
  for (const entry of legacy.paymentHistory || []) {
    const amount = rupeesToPaise(entry.amount);
    if (amount <= 0) continue;
    const kind = PAYMENT_KIND_MAP[entry.type] || 'PAYMENT';
    ctx.store.insert('payments', {
      booking_id: bookingId, kind, mode: PAYMENT_MODES.includes(entry.mode) ? entry.mode : 'CASH', amount,
      note: String(entry.note || '').slice(0, 200), received_at: entry.at || legacy.createdAt || ctx.now(), created_by: 'import'
    });
    recorded += kind === 'REFUND' ? -amount : amount;
  }
  const difference = rupeesToPaise(legacy.totalPaid || 0) - recorded;
  if (difference > 0) {
    ctx.store.insert('payments', {
      booking_id: bookingId, kind: 'PAYMENT', mode: PAYMENT_MODES.includes(legacy.paymentMode) ? legacy.paymentMode : 'CASH',
      amount: difference, note: 'Balance carried over from old system', received_at: legacy.updatedAt || ctx.now(), created_by: 'import'
    });
  }
}

function importBookings(ctx, bookings, roomIds, customerIds) {
  const counters = new Map();
  let imported = 0;
  let skipped = 0;
  const unitsById = new Map(ctx.store.all('SELECT * FROM units').map((u) => [u.id, u]));
  for (const b of bookings) {
    const unit = unitsById.get(roomIds.get(b.roomId));
    const guestId = customerIds.get(b.customerId);
    if (!unit || !guestId || !b.checkInDate) {
      skipped += 1;
      continue;
    }
    const checkIn = ymdInZone(b.checkInDate, LEGACY_TIME_ZONE);
    let checkOut = ymdInZone(b.checkOutDate || b.checkInDate, LEGACY_TIME_ZONE);
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
    const status = STATUS_MAP[b.status] || 'BOOKED';
    const code = String(b.bookingCode || `VV-LEGACY-${String(b._id).slice(-6)}`).toUpperCase();
    const match = BOOKING_CODE_PATTERN.exec(code);
    if (match) counters.set(match[2], Math.max(counters.get(match[2]) || 0, Number(match[3])));
    const discounts = b.discounts || {};
    const amountOrPercent = (type, value) => (DISCOUNT_MAP[type] === 'AMOUNT' ? rupeesToPaise(value) : Number(value || 0));
    const nightlyBase = Number(b.pricingSnapshot?.nightlyBase || 0);

    const id = ctx.store.insert('bookings', {
      code,
      guest_id: guestId,
      unit_id: unit.id,
      check_in: checkIn,
      check_out: checkOut,
      status,
      nightly_rate: nightlyBase > 0 ? rupeesToPaise(nightlyBase) : null,
      rate_snapshot: JSON.stringify(folio.buildRateSnapshot(ctx.store, unit, stayNights(checkIn, checkOut))),
      meal_plan: JSON.stringify(b.mealPlan || {}),
      meal_schedule: JSON.stringify((b.mealSchedule || []).map(({ date, breakfast, lunch, dinner }) => ({ date, breakfast: !!breakfast, lunch: !!lunch, dinner: !!dinner }))),
      room_discount_type: DISCOUNT_MAP[discounts.roomDiscountType] || 'NONE',
      room_discount_value: amountOrPercent(discounts.roomDiscountType, discounts.roomDiscountValue),
      meal_discount_type: DISCOUNT_MAP[discounts.mealDiscountType] || 'NONE',
      meal_discount_value: amountOrPercent(discounts.mealDiscountType, discounts.mealDiscountValue),
      source: 'Imported',
      notes: String(b.notes || '').slice(0, 1000),
      checked_in_at: ['CHECKED_IN', 'CHECKED_OUT'].includes(status) ? b.checkInDate : null,
      checked_out_at: status === 'CHECKED_OUT' ? b.cleanedAt || b.checkOutDate : null,
      cancelled_at: status === 'CANCELLED' ? b.updatedAt || ctx.now() : null,
      cancel_reason: status === 'CANCELLED' ? 'Cancelled in old system' : '',
      created_by: String(b.createdBy || 'import').slice(0, 40),
      created_at: b.createdAt || ctx.now(),
      updated_at: b.updatedAt || ctx.now()
    });
    importPayments(ctx, id, b);
    imported += 1;
  }
  for (const [day, value] of counters) {
    ctx.store.run('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = MAX(value, excluded.value)', `booking:${day}`, value);
  }
  return { imported, skipped };
}

function importRateOverrides(ctx, rateConfigs, mealRateConfigs, roomIds) {
  for (const r of rateConfigs) {
    const unitId = roomIds.get(r.roomId);
    if (!unitId || !r.date) continue;
    ctx.store.run('INSERT OR REPLACE INTO rate_overrides (unit_id, date, rate) VALUES (?, ?, ?)', unitId, ymdInZone(r.date, LEGACY_TIME_ZONE), rupeesToPaise(r.rent));
  }
  const meals = settings.getSection(ctx.store, 'meals');
  for (const m of mealRateConfigs) {
    if (!m.date || !(m.breakfastRate || m.lunchRate || m.dinnerRate)) continue;
    ctx.store.run(
      'INSERT OR REPLACE INTO meal_rate_overrides (date, breakfast, lunch, dinner) VALUES (?, ?, ?, ?)',
      ymdInZone(m.date, LEGACY_TIME_ZONE),
      m.breakfastRate ? rupeesToPaise(m.breakfastRate) : meals.breakfast,
      m.lunchRate ? rupeesToPaise(m.lunchRate) : meals.lunch,
      m.dinnerRate ? rupeesToPaise(m.dinnerRate) : meals.dinner
    );
  }
}

/** @param {Record<string, object[]>} collections normalized documents keyed by collection name */
function importCollections(ctx, collections, { uploadDirs = [] } = {}) {
  assertEmptyTarget(ctx.store);
  const rooms = collections.rooms || [];
  if (!rooms.length) throw badRequest('No rooms found in the old data. Include rooms.json.');
  return ctx.store.tx(() => {
    const legacySettings = (collections.settings || []).find((s) => s.key === 'GLOBAL') || (collections.settings || [])[0];
    importSettings(ctx, legacySettings);
    const roomIds = importRooms(ctx, rooms, legacySettings);
    const { idMap: customerIds, photos } = importCustomers(ctx, collections.customers || [], uploadDirs);
    importRateOverrides(ctx, collections.rateconfigs || [], collections.mealrateconfigs || [], roomIds);
    const result = importBookings(ctx, collections.bookings || [], roomIds, customerIds);
    const summary = { rooms: roomIds.size, guests: customerIds.size, photos, bookings: result.imported, skippedBookings: result.skipped };
    audit.record(ctx, 'data.legacy-import', 'data', null, JSON.stringify(summary));
    return summary;
  });
}

/** Parses uploaded mongoexport files; the collection name comes from the file name. */
function collectionsFromFiles(uploads) {
  const collections = {};
  for (const upload of uploads) {
    // Compass names exports like "roomsvv.bookings.json"; mongoexport uses "bookings.json".
    const name = path.basename(upload.name || '', '.json').toLowerCase().split('.').pop();
    if (!COLLECTIONS.includes(name)) continue;
    let parsed;
    try {
      parsed = JSON.parse(upload.buffer.toString('utf8'));
    } catch (err) {
      throw badRequest(`${upload.name} is not valid JSON`, { cause: err });
    }
    collections[name] = normalize(Array.isArray(parsed) ? parsed : [parsed]);
  }
  if (!Object.keys(collections).length) throw badRequest(`Choose the exported files (${COLLECTIONS.map((c) => `${c}.json`).join(', ')})`);
  return collections;
}

module.exports = { normalize, importCollections, collectionsFromFiles, COLLECTIONS };
