// Documents & printing: admin wording and layout options over the built-in designs, with a
// live preview. Fields left unchanged follow the built-in design, including after updates.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { pageHead, panel, field, check, chips, toast, showError, val, loading, confirmDialog } from '../ui.js';
import { addDays } from '../format.js';

const SWATCHES = ['#d4891c', '#8a5310', '#2f5f8f', '#2e7d55', '#a43a3a', '#1c1916'];
// The preview renders at this width (an A4 sheet plus margins) and is scaled to fit its panel.
const PREVIEW_WIDTH = 900;
const PREVIEW_HEIGHT = 1150;

export async function render(page, params) {
  loading(page);
  let docs;
  let samples;
  try {
    [docs, samples] = await Promise.all([api.get('/api/documents'), api.get('/api/documents/samples')]);
  } catch (err) {
    append(clear(page), pageHead('Documents & printing'), h('div', { class: 'notice' }, err.message));
    return;
  }
  const current = docs.find((d) => d.type === params.doc) || docs[0];
  const preview = h('iframe', {
    title: `Preview of ${current.label}`,
    style: { width: `${PREVIEW_WIDTH}px`, height: `${PREVIEW_HEIGHT}px`, border: 0, transformOrigin: '0 0', background: '#e7e2d9' }
  });
  const frame = h('div', { style: { overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--line)' } }, preview);
  const fit = () => {
    const scale = frame.clientWidth / PREVIEW_WIDTH;
    if (!scale) return;
    preview.style.transform = `scale(${scale})`;
    frame.style.height = `${Math.round(PREVIEW_HEIGHT * scale)}px`;
  };
  new ResizeObserver(fit).observe(frame);
  const previewNote = h('p', { class: 'hint' });

  async function refreshPreview() {
    const path = previewPath(current.type, samples);
    if (!path) {
      previewNote.textContent = 'Nothing to preview yet — this document appears once there is a matching booking, bill or payment.';
      preview.removeAttribute('src');
      return;
    }
    previewNote.textContent = 'Preview uses your most recent real record.';
    const { ticket } = await api.post('/api/auth/print-ticket').catch(() => ({}));
    preview.src = `${path}${path.includes('?') ? '&' : '?'}ticket=${ticket || ''}&t=${Date.now()}`;
  }

  const form = buildForm(current, async (values) => {
    try {
      await api.put(`/api/documents/${current.type}`, values);
      toast(`${current.label} saved`);
      render(page, { doc: current.type });
    } catch (err) {
      showError(err);
    }
  });

  append(clear(page),
    pageHead('Documents & printing', {
      eyebrow: 'Back office',
      lede: 'Adjust wording and what appears on each printout. Anything you leave unchanged follows the built-in design, so improvements in app updates arrive automatically.'
    }),
    h('div', { style: { display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr) minmax(0, 1fr)', gap: '18px', alignItems: 'start' } },
      panel('Documents', { flush: true }, h('nav', { 'aria-label': 'Documents' }, docs.map((d) => h('a', {
        href: `#/documents?doc=${d.type}`,
        style: {
          display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '11px 16px', borderBottom: '1px solid var(--line)',
          background: d.type === current.type ? 'var(--brand-wash)' : 'transparent', fontWeight: d.type === current.type ? 600 : 400
        }
      }, d.label, d.customised.length ? h('span', { class: 'tag BOOKED', title: 'Has your changes' }, 'Edited') : null)))),
      panel(current.label, {
        tools: current.customised.length ? h('button', {
          class: 'small quiet',
          onclick: async () => {
            if (!(await confirmDialog({ title: 'Reset to default?', message: `${current.label} goes back to the built-in design and wording.`, confirmLabel: 'Reset' }))) return;
            await api.del(`/api/documents/${current.type}`).catch(showError);
            render(page, { doc: current.type });
          }
        }, 'Reset to default') : null
      }, form),
      h('section', { class: 'panel', style: { position: 'sticky', top: '78px' } },
        h('header', {}, h('h2', {}, 'Preview'), h('div', { class: 'tools' }, h('button', { class: 'small', onclick: refreshPreview }, 'Refresh'))),
        h('div', { class: 'body' }, previewNote,
          frame))));
  refreshPreview();
}

function previewPath(type, s) {
  const register = `/print/register?from=${addDays(s.today, -30)}&to=${s.today}`;
  const paths = {
    general: s.invoice && `/print/invoice/${s.invoice}`,
    registration: s.booking && `/print/declaration/${s.booking}`,
    invoice: s.invoice && `/print/invoice/${s.invoice}`,
    folio: s.booking && `/print/folio/${s.booking}`,
    confirmation: s.booking && `/print/confirmation/${s.booking}`,
    receipt: s.payment && `/print/receipt/${s.payment}`,
    thermal: s.orderInvoice && `/print/invoice/${s.orderInvoice}?format=thermal`,
    kot: s.kot && `/print/kot/${s.kot.orderId}/${s.kot.kotNo}`,
    daySheet: `/print/daily?date=${s.today}`,
    register
  };
  return paths[type] || null;
}

function changedMark(doc, key) {
  return doc.customised.includes(key) ? h('span', { class: 'tag BOOKED', style: { marginLeft: '6px' } }, 'Changed') : null;
}

function buildForm(doc, onSave) {
  const text = [];
  const toggles = [];
  for (const f of doc.fields) {
    const value = doc.values[f.key];
    if (f.kind === 'bool') {
      toggles.push(h('div', { class: 'row' }, check(f.label, { name: f.key, checked: Boolean(value) }), changedMark(doc, f.key)));
    } else if (f.kind === 'colour') {
      const input = h('input', { type: 'color', name: f.key, value, style: { width: '56px', padding: '2px', minHeight: '34px' } });
      text.push(h('div', { class: 'field', style: { display: 'grid', gap: '6px' } },
        h('span', { style: { fontSize: '12.5px', fontWeight: 500 } }, f.label, changedMark(doc, f.key)),
        h('div', { class: 'row' }, input, SWATCHES.map((c) => h('button', {
          type: 'button', title: c, 'aria-label': `Use ${c}`,
          style: { width: '28px', height: '28px', minHeight: '28px', padding: 0, borderRadius: '50%', background: c, border: '2px solid #fff', boxShadow: '0 0 0 1px var(--line-strong)' },
          onclick: () => { input.value = c; }
        })))));
    } else if (f.kind === 'choice') {
      text.push(h('div', { class: 'field', style: { display: 'grid', gap: '6px' } },
        h('span', { style: { fontSize: '12.5px', fontWeight: 500 } }, f.label, changedMark(doc, f.key)), chips(f.key, f.options, value)));
    } else {
      text.push(h('div', {}, field(f.label, { name: f.key, value, type: f.kind === 'note' ? 'textarea' : 'text', maxlength: f.kind === 'note' ? 600 : 120, placeholder: f.default }, { hint: f.hint }),
        doc.customised.includes(f.key) ? h('div', { class: 'hint', style: { marginTop: '4px' } }, 'Built-in: ', h('em', {}, f.default || '(blank)')) : null));
    }
  }
  const form = h('form', { class: 'stack', novalidate: true },
    text,
    toggles.length ? h('div', {}, h('div', { class: 'eyebrow' }, 'Show on the printout'), h('div', { class: 'stack', style: { gap: '8px' } }, toggles)) : null,
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Save')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSave(Object.fromEntries(doc.fields.map((f) => [f.key, val(form, f.key)])));
  });
  return form;
}
