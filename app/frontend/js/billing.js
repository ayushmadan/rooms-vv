// Picking a priced line from the catalogue (food or services), with quantity and price
// editable for this guest, or entering a custom line. Used for folio charges and bills.
import { h } from './dom.js';
import { api } from './api.js';
import { field, select, formDialog, val } from './ui.js';
import { money, toPaise } from './format.js';

const CUSTOM = 'custom';
const TYPE_LABEL = { FOOD: 'Food', SERVICE: 'Services' };

let catalogCache = null;

export async function loadCatalog({ refresh = false } = {}) {
  if (!catalogCache || refresh) catalogCache = await api.get('/api/menu');
  return catalogCache;
}

/** <select> grouped by type and group, with a custom option at the end. */
function catalogSelect(catalog, { types }) {
  const groups = new Map();
  for (const item of catalog.filter((i) => types.includes(i.type))) {
    const key = `${TYPE_LABEL[item.type]} · ${item.category}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return h('select', { name: 'item', required: true },
    h('option', { value: '' }, 'Choose an item…'),
    [...groups].map(([label, items]) => h('optgroup', { label }, items.map((i) => h('option', { value: i.id }, `${i.name} — ${money(i.price)}`)))),
    h('option', { value: CUSTOM }, 'Custom item (type a name)…'));
}

/**
 * Opens the line picker. Resolves to { catalogItemId?, name?, category, qty, unitPrice, date? } or null.
 * @param {{ title: string, lede?: string, types?: string[], withDate?: string, onSubmit?: Function }} options
 */
export async function pickLine({ title, lede, types = ['SERVICE', 'FOOD'], withDate, onSubmit }) {
  const catalog = await loadCatalog();
  const itemSelect = catalogSelect(catalog, { types });
  const custom = h('div', { class: 'grid c2', hidden: true },
    field('Item name', { name: 'name', maxlength: 80, placeholder: 'e.g. Dry cleaning - blazer' }),
    select('Type', [['SERVICE', 'Service'], ['FOOD', 'Food'], ['OTHER', 'Other']], { name: 'category' }));
  const qty = field('Quantity', { name: 'qty', type: 'number', min: 1, max: 999, value: 1, required: true });
  const price = field('Price each ₹', { name: 'unitPrice', type: 'number', min: 0, step: '0.01', required: true });
  const total = h('strong', { style: { fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 500 } }, money(0));

  const body = h('div', { class: 'stack' },
    h('label', { class: 'field' }, h('span', {}, 'Item'), itemSelect),
    custom,
    h('div', { class: 'grid c3' }, qty, price, withDate ? field('Date', { name: 'date', type: 'date', value: withDate }) : h('div')),
    h('div', { class: 'row', style: { justifyContent: 'space-between', borderTop: '1px solid var(--line)', paddingTop: '12px' } },
      h('span', { class: 'hint' }, 'Price can be changed for this guest only; the catalogue price stays the same.'), total));

  const refresh = () => {
    const form = body.closest('form');
    total.textContent = money(toPaise(form.elements.unitPrice.value) * Number(form.elements.qty.value || 0));
  };
  itemSelect.addEventListener('change', () => {
    const form = body.closest('form');
    const chosen = catalog.find((i) => String(i.id) === itemSelect.value);
    custom.hidden = itemSelect.value !== CUSTOM;
    form.elements.name.required = itemSelect.value === CUSTOM;
    if (chosen) form.elements.unitPrice.value = (chosen.price / 100).toString();
    refresh();
  });
  body.addEventListener('input', refresh);

  return formDialog({
    title, lede, body, submitLabel: 'Add',
    onSubmit: async (form) => {
      const isCustom = itemSelect.value === CUSTOM;
      const line = {
        qty: val(form, 'qty'),
        unitPrice: val(form, 'unitPrice'),
        ...(isCustom ? { name: val(form, 'name'), category: val(form, 'category') } : { catalogItemId: Number(itemSelect.value) }),
        ...(withDate ? { date: val(form, 'date') } : {})
      };
      return onSubmit ? onSubmit(line) : line;
    }
  });
}

/** Small dialog to change quantity and price of one bill line. */
export function editLine({ name, qty, unitPrice, onSubmit }) {
  return formDialog({
    title: name,
    body: h('div', { class: 'grid c2' },
      field('Quantity', { name: 'qty', type: 'number', min: 0, max: 999, value: qty, required: true }),
      field('Price each ₹', { name: 'unitPrice', type: 'number', min: 0, step: '0.01', value: unitPrice / 100, required: true })),
    submitLabel: 'Update',
    onSubmit: (form) => onSubmit({ qty: val(form, 'qty'), unitPrice: val(form, 'unitPrice') })
  });
}

