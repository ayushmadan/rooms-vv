// Joining the admin PC from a front desk: find it on the network (or type its address),
// enter the code shown on the admin PC, then take a copy of the hotel's data.
import { h, clear, append } from './dom.js';
import { api } from './api.js';
import { field, formDialog, toast, val } from './ui.js';

export async function joinAdminPc({ firstRun = false } = {}) {
  const found = h('div', { class: 'stack', style: { gap: '8px' } }, h('p', { class: 'hint' }, 'Looking for the admin PC on this network…'));
  const address = field('Admin PC address', { name: 'address', placeholder: '192.168.1.20:47820', required: true, maxlength: 60 }, { hint: 'Shown on the admin PC under Network & licences.' });

  api.get('/api/sync/discover').then((hubs) => {
    if (!hubs.length) {
      append(clear(found), h('p', { class: 'hint' }, 'No admin PC answered. Type its address below (the admin PC shows it).'));
      return;
    }
    append(clear(found), hubs.map((hub) => h('button', {
      type: 'button', style: { justifyContent: 'space-between', padding: '12px 14px' },
      onclick: () => { address.querySelector('input').value = hub.address; }
    }, h('span', {}, h('strong', {}, hub.name || 'Admin PC'), h('div', { class: 'hint' }, hub.address)), h('span', { class: 'hint' }, 'Use'))));
  }).catch(() => append(clear(found), h('p', { class: 'hint' }, 'Type the admin PC address below.')));

  const done = await formDialog({
    title: 'Connect to the admin PC',
    lede: firstRun
      ? 'This desk will use the hotel’s data from the admin PC and stay in sync with it over the hotel network.'
      : 'This desk’s current data is backed up, then replaced with the hotel’s data from the admin PC.',
    wide: true,
    body: h('div', { class: 'stack' },
      found,
      h('div', { class: 'grid c3' },
        address,
        field('Pairing code', { name: 'code', placeholder: 'ABCD-EFGH', required: true, maxlength: 12, autocomplete: 'off', style: { textTransform: 'uppercase', letterSpacing: '2px' } }, { hint: 'On the admin PC: Network & licences → Add a desk.' }),
        field('Name for this desk', { name: 'label', value: 'Front desk', maxlength: 60 }))),
    submitLabel: 'Connect',
    submitClass: 'primary',
    onSubmit: (form) => api.post('/api/sync/pair', { address: val(form, 'address'), code: val(form, 'code').toUpperCase(), label: val(form, 'label') })
  });
  if (done) {
    toast(`Connected to ${done.desk?.hubName || 'the admin PC'}. Data copied.`);
    setTimeout(() => location.reload(), 600);
  }
  return Boolean(done);
}

