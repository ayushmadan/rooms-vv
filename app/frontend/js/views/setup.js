// First run: start fresh, move a data file from another computer, or import from version 1.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { field, check, pickFile, showError, val } from '../ui.js';
import { date, dateTime } from '../format.js';
import { joinAdminPc } from '../pairing.js';

export function render(root, { onDone }) {
  const wrap = h('div', { class: 'setup' });
  append(clear(root), wrap);
  showChoices(wrap, onDone);
}

function showChoices(wrap, onDone) {
  append(clear(wrap), 
    h('img', { class: 'seal', src: 'assets/logo.png', alt: '' }),
    h('div', { class: 'eyebrow' }, 'First-time setup'),
    h('h1', {}, 'Set up this front desk'),
    h('p', { class: 'hint' }, 'Everything is stored on this computer. No internet connection or database installation is needed.'),
    h('div', { class: 'choices' },
      h('button', { type: 'button', onclick: () => showFreshForm(wrap, onDone) },
        h('b', {}, 'Start fresh'), h('span', {}, 'Enter property details, taxes and an admin PIN. Rooms and tables can be changed later.')),
      h('button', { type: 'button', onclick: () => joinAdminPc({ firstRun: true }) },
        h('b', {}, 'Join the admin PC (front desk)'), h('span', {}, 'This desk shares bookings, guests and bills with the admin PC over the hotel network. Get a pairing code on the admin PC first.')),
      h('button', { type: 'button', onclick: () => moveFromComputer(wrap, onDone) },
        h('b', {}, 'Move from another computer'), h('span', {}, 'Open a .vvdata file exported from Backup & transfer on the other computer.'))));
}

function showFreshForm(wrap, onDone, note) {
  const form = h('form', { class: 'stack', novalidate: true },
    note ? h('div', { class: 'notice' }, note) : null,
    h('h2', {}, 'Property'),
    h('div', { class: 'grid c2' },
      field('Property name', { name: 'name', value: 'Vira Villas', required: true, maxlength: 80 }),
      field('Tagline', { name: 'tagline', value: 'Stay. Celebrate. Cherish.', maxlength: 120 }),
      field('Address', { name: 'address', maxlength: 300 }, { wide: true }),
      field('Phone', { name: 'phone', maxlength: 40 }),
      field('Email', { name: 'email', type: 'email', maxlength: 120 }),
      field('GSTIN', { name: 'gstin', maxlength: 15, pattern: '[0-9A-Za-z]{15}' }, { hint: 'Printed on invoices. Leave blank if not registered.' }),
      field('Invoice prefix', { name: 'invoicePrefix', value: 'VV', required: true, maxlength: 8 }, { hint: 'Invoices are numbered VV/26-27/0001.' })),
    h('h2', {}, 'GST rates'),
    h('p', { class: 'hint' }, 'Check these with your accountant. They can be changed later in Settings.'),
    h('div', { class: 'grid c4' },
      field('Rooms %', { name: 'roomGstPercent', type: 'number', value: '5', min: 0, max: 40, step: '0.5', required: true }),
      field('Halls %', { name: 'hallGstPercent', type: 'number', value: '18', min: 0, max: 40, step: '0.5', required: true }),
      field('Food %', { name: 'foodGstPercent', type: 'number', value: '5', min: 0, max: 40, step: '0.5', required: true }),
      field('Services %', { name: 'serviceGstPercent', type: 'number', value: '18', min: 0, max: 40, step: '0.5', required: true })),
    check('Prices already include GST', { name: 'pricesIncludeTax', checked: true }),
    h('h2', {}, 'Meal rates (per person per meal)'),
    h('div', { class: 'grid c3' },
      field('Breakfast ₹', { name: 'breakfast', type: 'number', value: '100', min: 0, required: true }),
      field('Lunch ₹', { name: 'lunch', type: 'number', value: '150', min: 0, required: true }),
      field('Dinner ₹', { name: 'dinner', type: 'number', value: '200', min: 0, required: true })),
    h('h2', {}, 'Admin PIN'),
    h('p', { class: 'hint' }, 'Needed for rates, refunds, reports, voids and data transfer. Use 4 to 8 digits.'),
    h('div', { class: 'grid c2' },
      field('PIN', { name: 'pin', type: 'password', inputmode: 'numeric', required: true, pattern: '\\d{4,8}', autocomplete: 'new-password' }),
      field('Repeat PIN', { name: 'pin2', type: 'password', inputmode: 'numeric', required: true, pattern: '\\d{4,8}', autocomplete: 'new-password' })),
    h('div', { class: 'row' },
      h('button', { type: 'button', onclick: () => showChoices(wrap, onDone) }, 'Back'),
      h('button', { type: 'submit', class: 'primary' }, 'Finish setup')));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    if (val(form, 'pin') !== val(form, 'pin2')) return showError(new Error('The two PINs do not match'));
    try {
      await api.post('/api/setup', {
        property: ['name', 'tagline', 'address', 'phone', 'email', 'gstin', 'invoicePrefix'].reduce((o, k) => ({ ...o, [k]: val(form, k) }), {}),
        taxes: {
          roomGstPercent: val(form, 'roomGstPercent'), hallGstPercent: val(form, 'hallGstPercent'),
          foodGstPercent: val(form, 'foodGstPercent'), serviceGstPercent: val(form, 'serviceGstPercent'),
          pricesIncludeTax: val(form, 'pricesIncludeTax')
        },
        meals: { breakfast: val(form, 'breakfast'), lunch: val(form, 'lunch'), dinner: val(form, 'dinner') },
        pin: val(form, 'pin')
      });
      onDone();
    } catch (err) {
      showError(err);
    }
  });

  append(clear(wrap), h('div', { class: 'eyebrow' }, 'Start fresh'), h('h1', {}, 'Property details'), h('hr'), form);
  form.elements.name.focus();
}

async function moveFromComputer(wrap, onDone) {
  const file = await pickFile({ accept: '.vvdata' });
  if (!file) return;
  append(clear(wrap), h('div', { class: 'loading' }, `Checking ${file.name}…`));
  try {
    const { uploadId, summary } = await api.upload('POST', '/api/data/import/upload', file);
    append(clear(wrap), 
      h('div', { class: 'eyebrow' }, 'Move from another computer'),
      h('h1', {}, summary.propertyName || 'Data file'),
      h('dl', { class: 'pairs', style: { margin: '18px 0' } },
        h('dt', {}, 'Exported'), h('dd', {}, summary.meta ? dateTime(summary.meta.exportedAt) : 'Unknown'),
        h('dt', {}, 'Guests'), h('dd', {}, summary.counts.guests),
        h('dt', {}, 'Bookings'), h('dd', {}, summary.counts.bookings),
        h('dt', {}, 'Invoices'), h('dd', {}, summary.counts.invoices),
        h('dt', {}, 'Last booking'), h('dd', {}, summary.lastBookingAt ? date(summary.lastBookingAt.slice(0, 10)) : '—')),
      h('p', {}, 'The admin PIN from the other computer will work here.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: () => showChoices(wrap, onDone) }, 'Back'),
        h('button', {
          type: 'button', class: 'primary',
          onclick: async () => {
            try {
              await api.post('/api/data/import/confirm', { uploadId });
              onDone();
            } catch (err) {
              showError(err);
            }
          }
        }, 'Use this data')));
  } catch (err) {
    showChoices(wrap, onDone);
    showError(err);
  }
}

