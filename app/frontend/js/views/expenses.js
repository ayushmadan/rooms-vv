import { h, clear, append } from '../dom.js';
import { api, admin, query } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, field, select, modeOptions, toast, showError, val, confirmDialog } from '../ui.js';
import { money, date, addDays, LABELS } from '../format.js';

export async function render(page, params) {
  const from = params.from || addDays(state.today, -6);
  const to = params.to || state.today;
  const rows = await api.get(`/api/expenses?${query({ from, to })}`);
  const live = rows.filter((e) => !e.voided);
  const byCategory = Object.entries(live.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + e.amount }), {})).sort((a, b) => b[1] - a[1]);
  const reload = (f = from, t = to) => { location.hash = `#/expenses?${query({ from: f, to: t })}`; };

  const form = h('form', { class: 'grid c3', novalidate: true },
    field('Date', { name: 'date', type: 'date', value: state.today, required: true }),
    select('Category', state.enums.expenseCategories, { name: 'category' }),
    field('Amount ₹', { name: 'amount', type: 'number', min: 0.01, step: '0.01', required: true }),
    field('What for', { name: 'description', maxlength: 200 }, { wide: true }),
    select('Paid by', modeOptions(state.enums), { name: 'mode', value: 'CASH' }),
    field('Paid to', { name: 'paidTo', maxlength: 80 }, { wide: true }),
    h('div', { style: { alignSelf: 'end' } }, h('button', { type: 'submit', class: 'primary' }, 'Add expense')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.elements.amount.checkValidity()) return form.elements.amount.reportValidity();
    try {
      await api.post('/api/expenses', Object.fromEntries(['date', 'category', 'amount', 'description', 'mode', 'paidTo'].map((n) => [n, val(form, n)])));
      toast('Expense added');
      render(page, params);
    } catch (err) {
      showError(err);
    }
  });

  const fromInput = h('input', { type: 'date', value: from, 'aria-label': 'From' });
  const toInput = h('input', { type: 'date', value: to, 'aria-label': 'To' });

  append(clear(page), 
    pageHead('Expenses', { lede: 'Daily spends — groceries, gas, repairs, wages. Cash expenses reduce cash in hand on the day sheet.' }),
    panel('New expense', {}, form),
    h('div', { class: 'columns main-side', style: { marginTop: '18px' } },
      panel('Expenses', {
        count: `${date(from)} – ${date(to)}`,
        flush: true,
        tools: [fromInput, toInput, h('button', { class: 'small', onclick: () => reload(fromInput.value, toInput.value) }, 'Show')]
      }, table([
        { title: 'Date', value: (e) => date(e.date) },
        { title: 'Category', value: (e) => e.category },
        { title: 'What for', value: (e) => [e.description, e.paidTo && `to ${e.paidTo}`].filter(Boolean).join(' ') || '—' },
        { title: 'Mode', value: (e) => LABELS.mode[e.mode] },
        { title: 'By', value: (e) => e.createdBy },
        { title: 'Amount', num: true, value: (e) => money(e.amount) },
        { title: '', value: (e) => (!e.voided && admin.isUnlocked ? h('button', { class: 'quiet small', onclick: () => voidExpense(e) }, 'Void') : '') }
      ], rows, { rowClass: (e) => (e.voided ? 'void' : ''), empty: 'No expenses in this period.', foot: rows.length ? ['Total', '', '', '', '', { text: money(live.reduce((s, e) => s + e.amount, 0)), num: true }, ''] : null })),
      panel('By category', { flush: true }, table([
        { title: 'Category', value: ([c]) => c },
        { title: 'Spent', num: true, value: ([, a]) => money(a) }
      ], byCategory, { empty: '—' }))));

  async function voidExpense(e) {
    if (!(await confirmDialog({ title: 'Void expense', message: `Void ${money(e.amount)} for ${e.category}?`, confirmLabel: 'Void', danger: true }))) return;
    try {
      await api.post(`/api/expenses/${e.id}/void`);
      render(page, params);
    } catch (err) {
      showError(err);
    }
  }
}
