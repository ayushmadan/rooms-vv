const crypto = require('crypto');
const v = require('../lib/validate');
const { badRequest } = require('../lib/http');

const DEFAULT_DECLARATION = [
  'I have provided accurate identity and contact details and produced a valid government-issued photo ID for myself and every guest staying with me.',
  'I accept responsibility for the conduct and safety of all occupants and visitors associated with this booking.',
  'I will follow the property rules, local laws and the stated check-in and check-out times.',
  'I am liable for any damage, loss or penalty caused by me or my guests during the stay.',
  'The property is not responsible for loss of valuables not deposited with the front desk.',
  'I will not keep or consume prohibited substances or carry weapons on the premises.'
];

// Tax rates are defaults only; the owner confirms them in first-run setup.
const DEFAULTS = {
  property: {
    name: 'Vira Villas',
    tagline: 'Stay. Celebrate. Cherish.',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    invoicePrefix: 'VV',
    bankDetails: '',
    upiId: '',
    invoiceTerms: 'Goods and services once billed will not be taken back. Subject to local jurisdiction.'
  },
  // SAC codes are printed on GST invoices; blank codes are simply not shown.
  taxes: {
    roomGstPercent: 5, hallGstPercent: 18, foodGstPercent: 5, serviceGstPercent: 18, pricesIncludeTax: true,
    roomSac: '996311', hallSac: '', foodSac: '996331', serviceSac: ''
  },
  meals: { breakfast: 10000, lunch: 15000, dinner: 20000 },
  policy: {
    checkInTime: '12:00', checkOutTime: '11:00', timeZone: 'Asia/Kolkata',
    bookingTerms: 'Valid photo ID is required for every guest at check-in. Cancellations within 48 hours of arrival forfeit the advance.'
  },
  declaration: { clauses: DEFAULT_DECLARATION },
  backup: { folder: '', keepDays: 30 },
  reports: { email: '' },
  setup: { completed: false }
};

const SECTIONS = Object.keys(DEFAULTS);

function getSection(store, section) {
  if (!SECTIONS.includes(section)) throw new Error(`Unknown settings section: ${section}`);
  const row = store.get('SELECT value FROM settings WHERE key = ?', section);
  return { ...DEFAULTS[section], ...(row ? JSON.parse(row.value) : {}) };
}

function putSection(store, section, value) {
  store.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    section,
    JSON.stringify(value)
  );
}

function getAll(store) {
  return Object.fromEntries(SECTIONS.map((s) => [s, getSection(store, s)]));
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const SAC_PATTERN = /^\d{0,8}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sac(value, field) {
  const code = v.text(value, field, { max: 8 });
  if (!SAC_PATTERN.test(code)) throw badRequest(`${field} must be digits only`);
  return code;
}
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;

const parsers = {
  property(body) {
    const gstin = v.text(body.gstin, 'GSTIN', { max: 15 }).toUpperCase();
    if (gstin && !GSTIN_PATTERN.test(gstin)) throw badRequest('GSTIN must be 15 letters/digits');
    return {
      name: v.text(body.name, 'Property name', { required: true, max: 80 }),
      tagline: v.text(body.tagline, 'Tagline', { max: 120 }),
      address: v.text(body.address, 'Address', { max: 300 }),
      phone: v.text(body.phone, 'Phone', { max: 40 }),
      email: v.text(body.email, 'Email', { max: 120 }),
      gstin,
      invoicePrefix: v.text(body.invoicePrefix, 'Invoice prefix', { required: true, max: 8 }).toUpperCase().replace(/[^A-Z0-9]/g, ''),
      bankDetails: v.text(body.bankDetails, 'Bank details', { max: 300 }),
      upiId: v.text(body.upiId, 'UPI ID', { max: 80 }),
      invoiceTerms: v.text(body.invoiceTerms, 'Invoice terms', { max: 600 })
    };
  },
  taxes(body) {
    const percent = (value, field) => v.number(value, field, { min: 0, max: 40 });
    return {
      roomGstPercent: percent(body.roomGstPercent, 'Room GST'),
      hallGstPercent: percent(body.hallGstPercent, 'Hall GST'),
      foodGstPercent: percent(body.foodGstPercent, 'Food GST'),
      serviceGstPercent: percent(body.serviceGstPercent, 'Service GST'),
      pricesIncludeTax: v.bool(body.pricesIncludeTax),
      roomSac: sac(body.roomSac, 'Room SAC'),
      hallSac: sac(body.hallSac, 'Hall SAC'),
      foodSac: sac(body.foodSac, 'Food SAC'),
      serviceSac: sac(body.serviceSac, 'Service SAC')
    };
  },
  meals(body) {
    return {
      breakfast: v.rupees(body.breakfast, 'Breakfast rate'),
      lunch: v.rupees(body.lunch, 'Lunch rate'),
      dinner: v.rupees(body.dinner, 'Dinner rate')
    };
  },
  policy(body) {
    const time = (value, field) => {
      if (!TIME_PATTERN.test(value || '')) throw badRequest(`${field} must be HH:MM`);
      return value;
    };
    const timeZone = v.text(body.timeZone, 'Time zone', { required: true, max: 60 });
    try {
      new Intl.DateTimeFormat('en', { timeZone });
    } catch (_err) {
      throw badRequest('Unknown time zone');
    }
    return {
      checkInTime: time(body.checkInTime, 'Check-in time'), checkOutTime: time(body.checkOutTime, 'Check-out time'), timeZone,
      bookingTerms: v.text(body.bookingTerms, 'Booking terms', { max: 800 })
    };
  },
  declaration(body) {
    if (!Array.isArray(body.clauses)) throw badRequest('clauses must be a list');
    const clauses = body.clauses.map((c, i) => v.text(c, `Clause ${i + 1}`, { max: 600 })).filter(Boolean);
    if (!clauses.length || clauses.length > 20) throw badRequest('Provide between 1 and 20 declaration clauses');
    return { clauses };
  },
  reports(body) {
    const emails = v.text(body.email, 'Report email', { max: 300 }).split(/[,;\s]+/).filter(Boolean);
    const invalid = emails.find((e) => !EMAIL_PATTERN.test(e));
    if (invalid) throw badRequest(`${invalid} is not a valid email address`);
    return { email: emails.join(', ') };
  },
  backup(body) {
    return {
      folder: v.text(body.folder, 'Backup folder', { max: 400 }),
      keepDays: v.integer(body.keepDays, 'Days to keep', { min: 3, max: 365 })
    };
  }
};

function updateSection(store, section, body) {
  const parse = parsers[section];
  if (!parse) throw badRequest(`Settings section "${section}" cannot be edited here`);
  const value = parse(body || {});
  putSection(store, section, value);
  return value;
}

// --- Admin PIN -------------------------------------------------------------

const PIN_PATTERN = /^\d{4,8}$/;
const SCRYPT_KEY_LENGTH = 32;

function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pin, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return { salt, hash };
}

function setAdminPin(store, pin) {
  if (!PIN_PATTERN.test(String(pin || ''))) throw badRequest('PIN must be 4 to 8 digits');
  store.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    'security',
    JSON.stringify(hashPin(String(pin)))
  );
}

function verifyAdminPin(store, pin) {
  const row = store.get("SELECT value FROM settings WHERE key = 'security'");
  if (!row || typeof pin !== 'string') return false;
  const { salt, hash } = JSON.parse(row.value);
  const candidate = Buffer.from(hashPin(pin, salt).hash, 'hex');
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function hasAdminPin(store) {
  return Boolean(store.get("SELECT 1 AS ok FROM settings WHERE key = 'security'"));
}

module.exports = { DEFAULTS, getSection, putSection, getAll, updateSection, setAdminPin, verifyAdminPin, hasAdminPin };
