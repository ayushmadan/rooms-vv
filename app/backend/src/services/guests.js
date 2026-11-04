const v = require('../lib/validate');
const { notFound, forbidden, badRequest } = require('../lib/http');
const files = require('./files');
const vault = require('./vault');
const audit = require('./audit');

const ID_TYPES = ['Aadhaar', 'Passport', 'Driving Licence', 'Voter ID', 'PAN', 'Other'];
const SEARCH_LIMIT = 50;
const PHOTO_COLUMNS = { front: 'id_photo_file_id', back: 'id_photo_back_file_id' };

function toDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    nationality: row.nationality,
    idType: row.id_type,
    // Always masked: older data may still hold the plain number until the admin unlocks once.
    idNumber: vault.mask(row.id_number),
    hasIdPhoto: Boolean(row.id_photo_file_id),
    hasIdPhotoBack: Boolean(row.id_photo_back_file_id),
    company: row.company,
    gstin: row.gstin,
    notes: row.notes,
    createdAt: row.created_at,
    stayCount: row.stay_count ?? undefined
  };
}

function getRow(store, id) {
  const row = store.get('SELECT * FROM guests WHERE id = ?', id);
  if (!row) throw notFound('Guest not found');
  return row;
}

function get(store, id) {
  return toDto(getRow(store, id));
}

function search(store, query) {
  const term = String(query || '').trim();
  const base = `SELECT g.*, (SELECT COUNT(*) FROM bookings b WHERE b.guest_id = g.id AND b.status <> 'CANCELLED') AS stay_count FROM guests g`;
  if (!term) return store.all(`${base} ORDER BY g.updated_at DESC LIMIT ?`, SEARCH_LIMIT).map(toDto);
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return store
    .all(
      `${base} WHERE g.phone LIKE ? ESCAPE '\\' OR g.full_name LIKE ? ESCAPE '\\' OR g.id_number LIKE ? ESCAPE '\\'
       ORDER BY g.updated_at DESC LIMIT ?`,
      like, like, like, SEARCH_LIMIT
    )
    .map(toDto);
}

function parseGuest(body) {
  const phone = v.text(body.phone, 'Phone', { required: true, max: 20 }).replace(/[^\d+]/g, '');
  if (phone.replace(/\D/g, '').length < 7) throw badRequest('Phone number looks too short');
  return {
    full_name: v.text(body.fullName, 'Full name', { required: true, max: 120 }),
    phone,
    email: v.text(body.email, 'Email', { max: 120 }),
    address: v.text(body.address, 'Address', { max: 300 }),
    city: v.text(body.city, 'City', { max: 80 }),
    nationality: v.text(body.nationality, 'Nationality', { max: 60 }) || 'Indian',
    id_type: body.idType ? v.oneOf(body.idType, 'ID type', ID_TYPES) : '',
    id_number: v.text(body.idNumber, 'ID number', { max: 40 }).toUpperCase(),
    company: v.text(body.company, 'Company', { max: 120 }),
    gstin: v.text(body.gstin, 'GSTIN', { max: 15 }).toUpperCase(),
    notes: v.text(body.notes, 'Notes', { max: 500 })
  };
}

/** Replaces a plain ID number with its masked form plus a sealed copy, when keys exist. */
function protectIdNumber(store, guest) {
  if (!guest.id_number || !vault.hasKeys(store)) return guest;
  return { ...guest, id_number: vault.mask(guest.id_number), id_number_enc: vault.seal(store, guest.id_number) };
}

function create(ctx, body, photo) {
  const guest = protectIdNumber(ctx.store, parseGuest(body));
  return ctx.store.tx(() => {
    const photoId = photo ? files.save(ctx, photo) : null;
    const now = ctx.now();
    const id = ctx.store.insert('guests', { ...guest, id_photo_file_id: photoId, created_by: ctx.actor, created_at: now, updated_at: now });
    audit.record(ctx, 'guest.create', 'guest', id);
    return get(ctx.store, id);
  });
}

/** Once a guest has stayed, their identity record is evidence; only an admin may change it. */
function isLocked(store, guestId) {
  return Boolean(
    store.get(
      `SELECT 1 AS x FROM bookings WHERE guest_id = ? AND (status IN ('CHECKED_IN', 'CHECKED_OUT') OR checked_in_at IS NOT NULL) LIMIT 1`,
      guestId
    )
  );
}

function update(ctx, id, body, photo) {
  const existing = getRow(ctx.store, id);
  if (isLocked(ctx.store, id) && !ctx.isAdmin) {
    throw forbidden('This guest has already stayed. Unlock admin to edit their details.');
  }
  const parsed = parseGuest(body);
  // The form sends back the masked number when the ID was not retyped: keep the sealed original.
  const unchangedId = parsed.id_number === existing.id_number;
  const guest = unchangedId ? (({ id_number, ...rest }) => rest)(parsed) : protectIdNumber(ctx.store, parsed);
  if (!unchangedId && !guest.id_number_enc) guest.id_number_enc = null;
  return ctx.store.tx(() => {
    const changes = { ...guest, updated_at: ctx.now() };
    if (photo) changes.id_photo_file_id = files.save(ctx, photo);
    ctx.store.update('guests', id, changes);
    audit.record(ctx, 'guest.update', 'guest', id);
    return get(ctx.store, id);
  });
}

function photoColumn(side) {
  const column = PHOTO_COLUMNS[side];
  if (!column) throw badRequest('Side must be front or back');
  return column;
}

function idPhoto(store, id, side = 'front') {
  const row = getRow(store, id);
  const fileId = row[photoColumn(side)];
  if (!fileId) throw notFound('No ID photo on file');
  return files.get(store, fileId);
}

/**
 * Stores one side of the guest's photo ID (encrypted). Filling an empty side is always allowed;
 * replacing a photo of a guest who has already stayed needs admin.
 */
function setIdPhoto(ctx, id, upload, side = 'front') {
  const row = getRow(ctx.store, id);
  const column = photoColumn(side);
  if (row[column] && isLocked(ctx.store, id) && !ctx.isAdmin) {
    throw forbidden('This guest has already stayed. Unlock admin to replace their ID photo.');
  }
  return ctx.store.tx(() => {
    ctx.store.update('guests', id, { [column]: files.save(ctx, upload), updated_at: ctx.now() });
    audit.record(ctx, 'guest.id-photo', 'guest', id, side);
    return get(ctx.store, id);
  });
}

/** Full ID number, for admin only (the route enforces it; opening the seal needs the PIN). */
function revealIdNumber(store, id) {
  const row = getRow(store, id);
  return row.id_number_enc ? vault.open(store, Buffer.from(row.id_number_enc)).toString('utf8') : row.id_number;
}

function history(store, id) {
  return store.all(
    `SELECT b.id, b.code, b.check_in, b.check_out, b.status, u.name AS unit_name
     FROM bookings b JOIN units u ON u.id = b.unit_id WHERE b.guest_id = ? ORDER BY b.check_in DESC`,
    id
  );
}

module.exports = { ID_TYPES, PHOTO_COLUMNS, toDto, get, getRow, search, create, update, idPhoto, setIdPhoto, revealIdNumber, history, isLocked };
