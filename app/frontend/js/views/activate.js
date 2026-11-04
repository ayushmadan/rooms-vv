// Shown when this computer may not be used: not activated, key removed, or not checked for too long.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { field, toast, showError } from '../ui.js';

const REASONS = {
  'not-activated': {
    title: 'Activate this computer',
    text: 'This copy of Vira Villas Rooms is not activated yet. Send the machine code below to the owner and enter the key you receive. No internet is needed.'
  },
  revoked: {
    title: 'This computer’s licence was removed',
    text: 'The owner has removed the licence for this computer, so it can no longer be used. If this is a mistake, ask the owner for a new key.'
  },
  'check-overdue': {
    title: 'Licence check needed',
    text: 'This computer has not been able to confirm its licence for 7 days. Connect it to the hotel network (so it can reach the admin PC) or to the internet, then check again.'
  }
};

export function render(root, { onDone }) {
  const { machineCode, reason } = state.boot.license;
  const copy = REASONS[reason] || REASONS['not-activated'];
  const form = h('form', { class: 'stack', novalidate: true },
    field('Activation key', { name: 'key', type: 'textarea', required: true, rows: 3, placeholder: 'Paste the key you received' }),
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary big' }, 'Activate')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/license/activate', { key: form.elements.key.value.trim() });
      onDone();
    } catch (err) {
      showError(err);
    }
  });

  async function checkAgain() {
    try {
      await api.post('/api/sync/run').catch(() => null); // reaches the admin PC if this is a paired desk
      const { status } = await api.post('/api/license/check');
      if (status.valid) onDone();
      else toast('Still could not confirm the licence. Check the network connection.', { error: true });
    } catch (err) {
      showError(err);
    }
  }

  append(clear(root), h('div', { class: 'setup' },
    h('img', { class: 'seal', src: 'assets/logo.png', alt: '' }),
    h('div', { class: 'eyebrow' }, 'Licence'),
    h('h1', {}, copy.title),
    h('p', { class: 'hint', style: { fontSize: '14px' } }, copy.text),
    h('div', { class: 'panel', style: { margin: '22px 0' } }, h('div', { class: 'body row', style: { justifyContent: 'space-between' } },
      h('div', {}, h('div', { class: 'hint' }, 'Machine code'), h('div', { style: { fontFamily: 'var(--serif)', fontSize: '28px', letterSpacing: '2px' } }, machineCode)),
      h('button', { type: 'button', class: 'small', onclick: () => navigator.clipboard?.writeText(machineCode).then(() => toast('Machine code copied')) }, 'Copy'))),
    reason === 'check-overdue' ? h('div', { class: 'row', style: { marginBottom: '22px' } }, h('button', { class: 'primary big', onclick: checkAgain }, 'Check again')) : null,
    reason === 'revoked' ? null : form));
}
