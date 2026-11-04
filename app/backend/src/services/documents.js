// Admin-adjustable wording and layout options for printed documents.
//
// The designs themselves ship with the app. Admins change titles, notes, signature labels,
// which sections appear, the accent colour and heading style. Only the fields an admin
// actually changes are stored ("overrides"); everything else keeps following the built-in
// defaults, so an app update that improves a document reaches every install automatically
// while keeping each property's own edits.
const v = require('../lib/validate');
const { badRequest } = require('../lib/http');

const STORE_KEY = 'documents';
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** Field kinds: text (one line), note (multi-line), bool (show/hide a section). */
const DOCUMENTS = {
  general: {
    label: 'All documents',
    fields: {
      accent: { kind: 'colour', label: 'Accent colour', default: '#d4891c' },
      headingStyle: { kind: 'choice', label: 'Headings', options: [['serif', 'Classic serif'], ['sans', 'Modern sans']], default: 'serif' },
      showLogo: { kind: 'bool', label: 'Show the logo', default: true },
      showTagline: { kind: 'bool', label: 'Show the tagline', default: true },
      thermalWidth: { kind: 'choice', label: 'Receipt printer paper', options: [['80', '80 mm'], ['58', '58 mm']], default: '80' }
    }
  },
  registration: {
    label: 'Registration card & declaration',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Registration card' },
      intro: { kind: 'note', label: 'Declaration opening line', hint: '{guest} is replaced by the guest name.', default: 'I, {guest}, on behalf of myself and all guests listed above, declare that:' },
      guestSign: { kind: 'text', label: 'Guest signature label', default: 'Guest signature' },
      deskSign: { kind: 'text', label: 'Front desk signature label', default: 'Received by' },
      showKeyIssued: { kind: 'bool', label: 'Room key box', default: true },
      showCoGuests: { kind: 'bool', label: 'Accompanying guests table', default: true },
      showTravel: { kind: 'bool', label: 'Travel details', default: true },
      showIdPhoto: { kind: 'bool', label: 'ID photo (admin prints only)', default: true },
      footerNote: { kind: 'note', label: 'Note at the bottom', default: '' }
    }
  },
  invoice: {
    label: 'Tax invoice',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Tax invoice' },
      showSac: { kind: 'bool', label: 'SAC codes', default: true },
      showWords: { kind: 'bool', label: 'Amount in words', default: true },
      showTaxSummary: { kind: 'bool', label: 'GST summary', default: true },
      showPayments: { kind: 'bool', label: 'Payments received', default: true },
      showPayTo: { kind: 'bool', label: 'UPI / bank details', default: true },
      showTerms: { kind: 'bool', label: 'Terms', default: true },
      customerSign: { kind: 'text', label: 'Customer signature label', default: 'Customer signature' },
      signatorySign: { kind: 'text', label: 'Signatory label', default: 'Authorised signatory' },
      footerNote: { kind: 'text', label: 'Footer', default: 'Computer-generated invoice' }
    }
  },
  folio: {
    label: 'Folio statement',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Guest folio' },
      note: { kind: 'note', label: 'Note', default: 'This is a running statement, not a tax invoice. The GST invoice is issued at check-out.' },
      showPayments: { kind: 'bool', label: 'Payments received', default: true },
      showPayTo: { kind: 'bool', label: 'UPI / bank details', default: true }
    }
  },
  confirmation: {
    label: 'Booking confirmation',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Booking confirmation' },
      greeting: { kind: 'text', label: 'Greeting', hint: '{guest} is replaced by the guest name.', default: 'Dear {guest},' },
      intro: { kind: 'note', label: 'Opening line', hint: '{property} is replaced by the property name.', default: 'Thank you for choosing {property}. Your reservation is confirmed as below.' },
      showPayTo: { kind: 'bool', label: 'UPI / bank details', default: true },
      showTerms: { kind: 'bool', label: 'Booking terms', default: true }
    }
  },
  receipt: {
    label: 'Payment receipt',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Payment receipt' },
      refundTitle: { kind: 'text', label: 'Title for refunds', default: 'Refund voucher' },
      showBalance: { kind: 'bool', label: 'Bill total and balance', default: true },
      footerNote: { kind: 'note', label: 'Note', default: '' }
    }
  },
  thermal: {
    label: 'Restaurant receipt (thermal)',
    fields: {
      footer: { kind: 'text', label: 'Last line', default: 'Thank you. Visit again.' },
      showGstin: { kind: 'bool', label: 'Our GSTIN', default: true },
      showUpi: { kind: 'bool', label: 'UPI ID', default: true }
    }
  },
  kot: {
    label: 'Kitchen order ticket',
    fields: {
      title: { kind: 'text', label: 'Heading', default: 'KITCHEN ORDER' }
    }
  },
  daySheet: {
    label: 'Day sheet',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Day sheet' },
      preparedBy: { kind: 'text', label: 'Left signature', default: 'Prepared by' },
      checkedBy: { kind: 'text', label: 'Right signature', default: 'Checked by' }
    }
  },
  register: {
    label: 'Guest register',
    fields: {
      title: { kind: 'text', label: 'Title', default: 'Guest register' },
      showSignature: { kind: 'bool', label: 'Signature column', default: true }
    }
  }
};

function defaultsOf(type) {
  return Object.fromEntries(Object.entries(DOCUMENTS[type].fields).map(([key, f]) => [key, f.default]));
}

function readOverrides(store) {
  const row = store.get('SELECT value FROM settings WHERE key = ?', STORE_KEY);
  return row ? JSON.parse(row.value) : {};
}

/** Every document's effective settings: today's built-in defaults with the admin's changes on top. */
function getAll(store) {
  const overrides = readOverrides(store);
  return Object.fromEntries(Object.keys(DOCUMENTS).map((type) => {
    // Ignore stored keys that a newer version no longer has.
    const known = Object.fromEntries(Object.entries(overrides[type] || {}).filter(([key]) => key in DOCUMENTS[type].fields));
    return [type, { ...defaultsOf(type), ...known }];
  }));
}

function get(store, type) {
  return getAll(store)[type];
}

function parseField(field, value, label) {
  switch (field.kind) {
    case 'bool': return v.bool(value);
    case 'text': return v.text(value, label, { max: 120 });
    case 'note': return v.text(value, label, { max: 600 });
    case 'colour': {
      const colour = String(value || '').trim();
      if (!HEX_COLOUR.test(colour)) throw badRequest(`${label} must be a colour like #d4891c`);
      return colour.toLowerCase();
    }
    case 'choice': return v.oneOf(value, label, field.options.map(([key]) => key));
    default: throw new Error(`Unknown field kind ${field.kind}`);
  }
}

/** Saves a document's settings, keeping only values that differ from the built-in defaults. */
function save(store, type, body = {}) {
  const spec = DOCUMENTS[type];
  if (!spec) throw badRequest('Unknown document');
  const changed = {};
  for (const [key, field] of Object.entries(spec.fields)) {
    if (!(key in body)) continue;
    const value = parseField(field, body[key], field.label);
    if (value !== field.default) changed[key] = value;
  }
  const overrides = readOverrides(store);
  if (Object.keys(changed).length) overrides[type] = changed;
  else delete overrides[type];
  store.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', STORE_KEY, JSON.stringify(overrides));
  return get(store, type);
}

function reset(store, type) {
  if (!DOCUMENTS[type]) throw badRequest('Unknown document');
  return save(store, type, {});
}

/** Field descriptions for the settings screen, plus which fields differ from the defaults. */
function describe(store) {
  const overrides = readOverrides(store);
  const current = getAll(store);
  return Object.entries(DOCUMENTS).map(([type, spec]) => ({
    type,
    label: spec.label,
    values: current[type],
    customised: Object.keys(overrides[type] || {}).filter((key) => key in spec.fields),
    fields: Object.entries(spec.fields).map(([key, f]) => ({ key, kind: f.kind, label: f.label, hint: f.hint || '', options: f.options || null, default: f.default }))
  }));
}

/** Replaces {guest} / {property} placeholders. The result is still escaped when rendered. */
function fill(text, values) {
  return String(text || '').replace(/\{(guest|property)\}/g, (_m, key) => values[key] || '');
}

module.exports = { DOCUMENTS, getAll, get, save, reset, describe, fill };
