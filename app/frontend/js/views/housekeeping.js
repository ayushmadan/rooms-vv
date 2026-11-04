import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { pageHead, panel, table, tag, field, formDialog, toast, showError, val } from '../ui.js';
import { dateTime, LABELS } from '../format.js';

const ORDER = { DIRTY: 0, OUT_OF_ORDER: 1, CLEAN: 2 };

export async function render(page) {
  const [units, log] = await Promise.all([api.get('/api/units'), api.get('/api/housekeeping/log')]);
  const reload = () => render(page);
  const sorted = [...units].sort((a, b) => ORDER[a.hk_status] - ORDER[b.hk_status] || a.sort - b.sort);

  async function setStatus(u, status) {
    let note = '';
    if (status === 'OUT_OF_ORDER') {
      note = await formDialog({
        title: `${u.name} out of order`,
        lede: 'It will not be offered for new check-ins until marked clean.',
        body: field('Reason', { name: 'note', required: true, maxlength: 300, placeholder: 'e.g. AC repair, plumbing' }),
        submitLabel: 'Mark out of order',
        submitClass: 'danger',
        onSubmit: (form) => val(form, 'note')
      });
      if (!note) return;
    }
    try {
      await api.post(`/api/units/${u.id}/housekeeping`, { status, note });
      toast(`${u.name}: ${LABELS.hk[status]}`);
      reload();
    } catch (err) {
      showError(err);
    }
  }

  append(clear(page), 
    pageHead('Housekeeping', { lede: 'Rooms become “needs cleaning” automatically at check-out.' }),
    panel('Rooms and halls', { flush: true }, table([
      { title: 'Room', value: (u) => h('strong', {}, `${u.code} · ${u.name}`) },
      { title: 'Status', value: (u) => tag(u.hk_status, LABELS.hk[u.hk_status]) },
      { title: 'Note', value: (u) => u.hk_note || '—' },
      {
        title: '', value: (u) => h('div', { class: 'row end' },
          u.hk_status !== 'CLEAN' ? h('button', { class: 'small primary', onclick: () => setStatus(u, 'CLEAN') }, 'Mark clean') : null,
          u.hk_status === 'CLEAN' ? h('button', { class: 'small', onclick: () => setStatus(u, 'DIRTY') }, 'Needs cleaning') : null,
          u.hk_status !== 'OUT_OF_ORDER' ? h('button', { class: 'small quiet', onclick: () => setStatus(u, 'OUT_OF_ORDER') }, 'Out of order') : null)
      }
    ], sorted)),
    panel('Recent activity', { flush: true }, table([
      { title: 'When', value: (l) => dateTime(l.created_at) },
      { title: 'Room', value: (l) => l.unit_name },
      { title: 'Change', value: (l) => `${LABELS.hk[l.from_status]} → ${LABELS.hk[l.to_status]}` },
      { title: 'Note', value: (l) => l.note || '—' },
      { title: 'By', value: (l) => l.created_by }
    ], log.slice(0, 40), { empty: 'No housekeeping changes yet.' })));
}
