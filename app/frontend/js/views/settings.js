// Admin settings. Loading /api/settings triggers the PIN prompt if admin is locked.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { loadBootstrap } from '../state.js';
import { pageHead, panel, table, field, check, toast, showError, val, loading } from '../ui.js';
import { dateTime } from '../format.js';

export async function render(page) {
  loading(page);
  let all;
  try {
    all = await api.get('/api/settings');
  } catch (err) {
    append(clear(page), pageHead('Settings'), h('div', { class: 'notice' }, err.message));
    return;
  }
  const audit = await api.get('/api/audit');

  append(clear(page),
    pageHead('Settings', {
      eyebrow: 'Back office',
      lede: 'Property details and wording printed on invoices, receipts and registration cards. Prices are under Prices & catalogue.',
      actions: [h('a', { class: 'button', href: '#/documents' }, 'Documents & printing'), h('a', { class: 'button', href: '#/menu' }, 'Prices & catalogue')]
    }),
    h('div', { class: 'columns two' },
      h('div', {}, propertyForm(all.property), taxesForm(all.taxes)),
      h('div', {}, policyForm(all.policy), reportsForm(all.reports), declarationForm(all.declaration), pinForm())),
    h('div', { style: { height: '18px' } }),
    panel('Activity log', { count: 'latest 200', flush: true }, table([
      { title: 'When', value: (a) => dateTime(a.at) },
      { title: 'Who', value: (a) => a.actor },
      { title: 'What', value: (a) => a.action },
      { title: 'Detail', value: (a) => `${a.entity}${a.entity_id ? ` #${a.entity_id}` : ''} ${a.detail}` }
    ], audit)));
}

function sectionForm(title, section, fields, toBody) {
  const form = h('form', { class: 'stack', novalidate: true }, fields, h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Save')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (invalid) return invalid.reportValidity();
    try {
      await api.put(`/api/settings/${section}`, toBody(form));
      await loadBootstrap();
      toast(`${title} saved`);
    } catch (err) {
      showError(err);
    }
  });
  return panel(title, {}, form);
}

function propertyForm(p) {
  const keys = ['name', 'tagline', 'address', 'phone', 'email', 'gstin', 'invoicePrefix', 'upiId', 'bankDetails', 'invoiceTerms'];
  return sectionForm('Property & documents', 'property', h('div', { class: 'grid c2' },
    field('Name', { name: 'name', value: p.name, required: true, maxlength: 80 }),
    field('Tagline', { name: 'tagline', value: p.tagline, maxlength: 120 }),
    field('Address', { name: 'address', value: p.address, maxlength: 300 }, { wide: true, hint: 'End with city and state; the invoice uses them as place of supply.' }),
    field('Phone', { name: 'phone', value: p.phone, maxlength: 40 }),
    field('Email', { name: 'email', value: p.email, maxlength: 120 }),
    field('GSTIN', { name: 'gstin', value: p.gstin, maxlength: 15 }),
    field('Invoice prefix', { name: 'invoicePrefix', value: p.invoicePrefix, required: true, maxlength: 8 }),
    field('UPI ID', { name: 'upiId', value: p.upiId, maxlength: 80, placeholder: 'viravillas@okhdfc' }),
    field('Bank details', { name: 'bankDetails', type: 'textarea', value: p.bankDetails, maxlength: 300, placeholder: 'Account name, number, IFSC' }, { wide: true }),
    field('Terms printed on invoices', { name: 'invoiceTerms', type: 'textarea', value: p.invoiceTerms, maxlength: 600 }, { wide: true })),
  (form) => Object.fromEntries(keys.map((k) => [k, val(form, k)])));
}

function taxesForm(t) {
  const rows = [['room', 'Rooms'], ['hall', 'Halls'], ['food', 'Food'], ['service', 'Services']];
  return sectionForm('GST', 'taxes', [
    h('div', { class: 'grid c2' }, rows.flatMap(([key, label]) => [
      field(`${label} GST %`, { name: `${key}GstPercent`, type: 'number', min: 0, max: 40, step: '0.5', value: t[`${key}GstPercent`], required: true }),
      field(`${label} SAC code`, { name: `${key}Sac`, value: t[`${key}Sac`], maxlength: 8, inputmode: 'numeric' })
    ])),
    check('Prices already include GST', { name: 'pricesIncludeTax', checked: t.pricesIncludeTax }),
    h('p', { class: 'hint' }, 'Check rates and SAC codes with your accountant. Blank SAC codes are left off invoices.')
  ], (form) => ({
    ...Object.fromEntries(rows.flatMap(([key]) => [[`${key}GstPercent`, val(form, `${key}GstPercent`)], [`${key}Sac`, val(form, `${key}Sac`)]])),
    pricesIncludeTax: val(form, 'pricesIncludeTax')
  }));
}

function policyForm(p) {
  return sectionForm('Timings & booking terms', 'policy', h('div', { class: 'grid c3' },
    field('Check-in time', { name: 'checkInTime', type: 'time', value: p.checkInTime, required: true }),
    field('Check-out time', { name: 'checkOutTime', type: 'time', value: p.checkOutTime, required: true }),
    field('Time zone', { name: 'timeZone', value: p.timeZone, required: true }),
    h('div', { class: 'span-all' }, field('Printed on booking confirmations', { name: 'bookingTerms', type: 'textarea', value: p.bookingTerms, maxlength: 800 }))),
  (form) => ({ checkInTime: val(form, 'checkInTime'), checkOutTime: val(form, 'checkOutTime'), timeZone: val(form, 'timeZone'), bookingTerms: val(form, 'bookingTerms') }));
}

function reportsForm(r) {
  return sectionForm('Daily report email', 'reports', [
    field('Send reports to', { name: 'email', value: r.email, maxlength: 300, placeholder: 'owner@gmail.com, manager@gmail.com' },
      { hint: '“Email report” opens Gmail in the browser with the day’s report ready — just press Send.' })
  ], (form) => ({ email: val(form, 'email') }));
}

function declarationForm(d) {
  return sectionForm('Declaration wording', 'declaration', [
    h('p', { class: 'hint' }, 'One clause per line. Printed on the registration card the guest signs.'),
    field('Clauses', { name: 'clauses', type: 'textarea', value: d.clauses.join('\n'), rows: 9 })
  ], (form) => ({ clauses: val(form, 'clauses').split('\n').map((s) => s.trim()).filter(Boolean) }));
}

function pinForm() {
  const form = h('form', { class: 'grid c2', novalidate: true },
    field('New PIN', { name: 'pin', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', required: true, autocomplete: 'new-password' }),
    field('Repeat', { name: 'pin2', type: 'password', inputmode: 'numeric', pattern: '\\d{4,8}', required: true, autocomplete: 'new-password' }),
    h('p', { class: 'hint span-all' }, 'The PIN also protects guest ID numbers and photos. Keep it safe: without it they cannot be viewed.'),
    h('div', {}, h('button', { type: 'submit', class: 'primary' }, 'Change PIN')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.elements.pin.checkValidity()) return form.elements.pin.reportValidity();
    if (val(form, 'pin') !== val(form, 'pin2')) return showError(new Error('The PINs do not match'));
    try {
      await api.put('/api/auth/pin', { pin: val(form, 'pin') });
      toast('PIN changed. Unlock again with the new PIN.');
      location.reload();
    } catch (err) {
      showError(err);
    }
  });
  return panel('Admin PIN', {}, form);
}
