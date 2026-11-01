import { h, clear, append } from '../dom.js';
import { api, admin } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, field, select, statusTag, toast, showError, val, loading } from '../ui.js';
import { date } from '../format.js';
import { idPhotoBlock, idNumberText } from '../idcard.js';

const FIELDS = ['fullName', 'phone', 'email', 'address', 'city', 'nationality', 'idType', 'idNumber', 'company', 'gstin', 'notes'];

export async function render(page, { id }) {
  loading(page);
  const g = await api.get(`/api/guests/${Number(id)}`);
  const editable = !g.locked || admin.isUnlocked;
  const rerender = () => render(page, { id });

  const form = h('form', { class: 'stack', novalidate: true },
    g.locked ? h('div', { class: 'notice' }, editable
      ? 'This guest has stayed with you. Changes are recorded against your admin session.'
      : 'This guest has stayed with you, so identity details are locked. Unlock admin to correct them.') : null,
    h('fieldset', { disabled: !editable, style: { border: 0, padding: 0, margin: 0 } },
      h('div', { class: 'grid c3' },
        field('Full name', { name: 'fullName', value: g.fullName, required: true, maxlength: 120 }),
        field('Phone', { name: 'phone', value: g.phone, required: true, maxlength: 20 }),
        field('Email', { name: 'email', type: 'email', value: g.email, maxlength: 120 }),
        field('Address', { name: 'address', value: g.address, maxlength: 300 }, { wide: true }),
        field('City', { name: 'city', value: g.city, maxlength: 80 }),
        field('Nationality', { name: 'nationality', value: g.nationality, maxlength: 60 }),
        select('Photo ID type', [['', '—'], ...state.enums.idTypes], { name: 'idType', value: g.idType }),
        field('Photo ID number', { name: 'idNumber', value: g.idNumber, maxlength: 40 }, { hint: g.idNumber ? 'Shown masked. Retype only to correct it.' : '' }),
        field('Company', { name: 'company', value: g.company, maxlength: 120 }),
        field('Company GSTIN', { name: 'gstin', value: g.gstin, maxlength: 15 }),
        field('Notes', { name: 'notes', value: g.notes, maxlength: 500 }, { wide: true })),
      h('div', { class: 'row', style: { marginTop: '16px' } }, h('button', { type: 'submit', class: 'primary' }, 'Save guest'))));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/guests/${g.id}`, Object.fromEntries(FIELDS.map((n) => [n, val(form, n)])));
      toast('Guest saved');
    } catch (err) {
      showError(err);
    }
  });

  append(clear(page),
    pageHead(g.fullName, {
      eyebrow: 'Guest',
      lede: [g.phone, g.city].filter(Boolean).join(' · '),
      actions: [h('a', { class: 'button primary', href: `#/new-booking?guest=${g.id}` }, 'New booking for this guest')]
    }),
    h('div', { class: 'columns main-side' },
      h('div', {},
        panel('Details', {}, form),
        panel('Stays', { count: g.history.length, flush: true }, table([
          { title: 'Booking', value: (s) => s.code },
          { title: 'Room', value: (s) => s.unit_name },
          { title: 'Arrival', value: (s) => date(s.check_in) },
          { title: 'Departure', value: (s) => date(s.check_out) },
          { title: 'Status', value: (s) => statusTag(s.status) }
        ], g.history, { onRowClick: (s) => { location.hash = `#/booking/${s.id}`; }, empty: 'No stays yet.' }))),
      panel('Photo ID', {},
        h('p', {}, idNumberText(g)),
        idPhotoBlock(g, { canChange: editable, onChanged: rerender }),
        h('p', { class: 'hint', style: { marginTop: '12px' } }, 'ID numbers and photos are encrypted. Viewing them needs the admin PIN.'))));
}
