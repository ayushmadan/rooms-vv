// Shown on a computer that has not been activated by the owner.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { field, toast, showError } from '../ui.js';

export function render(root, { onDone }) {
  const { machineCode } = state.boot.license;
  const keyField = field('Activation key', { name: 'key', type: 'textarea', required: true, rows: 3, placeholder: 'Paste the key you received' });
  const copy = h('button', { type: 'button', class: 'small', onclick: () => navigator.clipboard?.writeText(machineCode).then(() => toast('Machine code copied')) }, 'Copy');
  const form = h('form', { class: 'stack', novalidate: true },
    keyField,
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
  append(clear(root), h('div', { class: 'setup' },
    h('img', { class: 'seal', src: 'assets/logo.png', alt: '' }),
    h('div', { class: 'eyebrow' }, 'Activation'),
    h('h1', {}, 'Activate this computer'),
    h('p', { class: 'hint', style: { fontSize: '14px' } }, 'This copy of Vira Villas Rooms is not activated yet. Send the machine code below to the owner and enter the key you receive. No internet is needed.'),
    h('div', { class: 'panel', style: { margin: '22px 0' } }, h('div', { class: 'body row', style: { justifyContent: 'space-between' } },
      h('div', {}, h('div', { class: 'hint' }, 'Machine code'), h('div', { style: { fontFamily: 'var(--serif)', fontSize: '28px', letterSpacing: '2px' } }, machineCode)),
      copy)),
    form));
}
