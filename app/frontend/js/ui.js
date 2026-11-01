// Shared UI pieces: fields, tables, dialogs, toasts, printing and downloads.
import { h, clear, append } from './dom.js';
import { LABELS } from './format.js';
import { api, admin } from './api.js';

// --- Fields ------------------------------------------------------------

export function field(label, attrs = {}, { hint, wide } = {}) {
  const tag = attrs.type === 'textarea' ? 'textarea' : 'input';
  const { type, ...rest } = attrs;
  const control = h(tag, { ...(tag === 'input' ? { type: type || 'text' } : {}), ...rest });
  if (tag === 'textarea' && attrs.value) control.value = attrs.value;
  return h('label', { class: `field${wide ? ' span-2' : ''}` },
    h('span', {}, label, attrs.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : ''),
    control,
    hint ? h('small', { class: 'hint' }, hint) : null);
}

/** options: array of [value, label] or strings */
export function select(label, options, attrs = {}, { wide } = {}) {
  const { value, ...rest } = attrs;
  const control = h('select', rest, options.map((o) => {
    const [v, text] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: String(v) === String(value ?? '') }, text);
  }));
  return h('label', { class: `field${wide ? ' span-2' : ''}` }, h('span', {}, label), control);
}

export function check(label, attrs = {}) {
  return h('label', { class: 'check' }, h('input', { type: 'checkbox', ...attrs }), label);
}

export function modeOptions(enums) {
  return enums.paymentModes.map((m) => [m, LABELS.mode[m]]);
}

// --- Display -----------------------------------------------------------

export function tag(code, text) {
  return h('span', { class: `tag ${code}` }, text || code);
}

export function statusTag(status) {
  return tag(status, LABELS.status[status] || status);
}

/** columns: [{ title, value: row => node|string, num?: bool }] */
export function table(columns, rows, { onRowClick, empty = 'Nothing here yet.', rowClass, foot } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  return h('table', { class: 'ledger' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', { class: c.num ? 'num' : '' }, c.title)))),
    h('tbody', {}, rows.map((row) => h('tr', {
      class: [onRowClick ? 'clickable' : '', rowClass ? rowClass(row) : ''].join(' ').trim(),
      onclick: onRowClick ? () => onRowClick(row) : undefined
    }, columns.map((c) => h('td', { class: c.num ? 'num' : '' }, c.value(row)))))),
    foot ? h('tfoot', {}, h('tr', {}, foot.map((cell) => h('td', { class: cell?.num ? 'num' : '', colspan: cell?.span }, cell?.text ?? cell)))) : null);
}

export function panel(title, { tools, count, flush } = {}, ...body) {
  return h('section', { class: 'panel' },
    h('header', {}, h('h2', {}, title), count !== undefined ? h('span', { class: 'count' }, count) : null, tools ? h('div', { class: 'tools' }, tools) : null),
    h('div', { class: `body${flush ? ' flush' : ''}` }, body));
}

export function pageHead(title, { eyebrow, lede, actions } = {}) {
  return h('div', { class: 'page-head' },
    h('div', {}, eyebrow ? h('div', { class: 'eyebrow' }, eyebrow) : null, h('h1', {}, title), lede ? h('div', { class: 'lede' }, lede) : null),
    actions ? h('div', { class: 'actions' }, actions) : null);
}

export function loading(container, text = 'Loading…') {
  append(clear(container), h('div', { class: 'loading' }, text));
}

// --- Toasts ------------------------------------------------------------

const TOAST_MS = 4200;

export function toast(message, { error = false } = {}) {
  let host = document.querySelector('.toasts');
  if (!host) {
    host = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const el = h('div', { class: `toast${error ? ' error' : ''}` }, message);
  host.append(el);
  setTimeout(() => el.remove(), error ? TOAST_MS * 2 : TOAST_MS);
}

export function showError(err) {
  toast(err?.message || String(err), { error: true });
}

// --- Dialogs -----------------------------------------------------------

/**
 * Opens a modal form. onSubmit receives the <form>; its return value resolves the promise.
 * Throwing keeps the dialog open and shows the message.
 */
export function formDialog({ title, lede, body, submitLabel = 'Save', submitClass = 'primary', wide = false, onSubmit, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const error = h('div', { class: 'd-error', role: 'alert' });
    const submit = h('button', { type: 'submit', class: submitClass }, submitLabel);
    const form = h('form', { method: 'dialog', novalidate: true },
      h('div', { class: 'd-head' }, h('h2', {}, title), lede ? h('p', {}, lede) : null),
      h('div', { class: 'd-body' }, typeof body === 'function' ? body() : body, error),
      h('div', { class: 'd-foot' },
        h('button', { type: 'button', onclick: () => close(null) }, cancelLabel),
        submit));
    const dialog = h('dialog', { class: wide ? 'wide' : '' }, form);
    let settled = false;

    function close(value) {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    }

    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(null);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.textContent = '';
      const invalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
      if (invalid) {
        const label = invalid.closest('label')?.querySelector('span')?.textContent?.replace('*', '').trim();
        error.textContent = `${label || 'A field'}: ${invalid.validationMessage}`;
        invalid.focus();
        return;
      }
      submit.disabled = true;
      try {
        close(onSubmit ? await onSubmit(form) : true);
      } catch (err) {
        error.textContent = err.message || String(err);
      } finally {
        submit.disabled = false;
      }
    });

    document.body.append(dialog);
    dialog.showModal();
    const first = form.querySelector('.d-body input:not([type=hidden]):not([type=checkbox]), .d-body select, .d-body textarea');
    (first || submit).focus();
  });
}

export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return formDialog({
    title,
    body: h('p', {}, message),
    submitLabel: confirmLabel,
    submitClass: danger ? 'danger' : 'primary',
    onSubmit: () => true
  }).then(Boolean);
}

/** Reads a named form control; numbers come back as strings. */
export function val(form, name) {
  const el = form.elements[name];
  if (!el) return undefined;
  if (el.type === 'checkbox') return el.checked;
  return el.value.trim();
}

// --- Printing and files ------------------------------------------------

/** Opens a print document. With admin unlocked, a short-lived ticket lets it show protected data. */
export async function openPrint(path) {
  let url = path;
  if (admin.isUnlocked) {
    const { ticket } = await api.post('/api/auth/print-ticket').catch(() => ({}));
    if (ticket) url += `${path.includes('?') ? '&' : '?'}ticket=${ticket}`;
  }
  const win = window.open(url, '_blank', 'width=980,height=900');
  if (!win) toast('Allow pop-up windows to print.', { error: true });
}

/** Object URL for a guest's ID photo (admin only), or null. Caller revokes it. */
export async function idPhotoUrl(guestId, side = 'front') {
  const blob = await api.get(`/api/guests/${guestId}/photo?side=${side}`);
  return URL.createObjectURL(blob);
}

/** Opens the webcam / document camera and resolves to a captured JPEG Blob, or null. */
export async function captureFromCamera() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch {
    toast('No camera is available on this computer.', { error: true });
    return null;
  }
  const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '10px', background: '#000' } });
  video.srcObject = stream;
  try {
    return await formDialog({
      title: 'Photograph the ID',
      lede: 'Hold the card flat and fill the frame. Both sides can be added one after another.',
      wide: true,
      body: video,
      submitLabel: 'Capture',
      submitClass: 'accent',
      onSubmit: async () => {
        const canvas = h('canvas', { width: video.videoWidth, height: video.videoHeight });
        canvas.getContext('2d').drawImage(video, 0, 0);
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      }
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: fileName });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function pickFile({ accept, multiple = false } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    input.addEventListener('change', () => {
      resolve(multiple ? [...input.files] : input.files[0] || null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(multiple ? [] : null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

const PHOTO_MAX_EDGE = 1600;
const PHOTO_QUALITY = 0.82;

/** Shrinks camera photos before upload so the data file stays small. PDFs pass through. */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = h('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// --- Choice chips ------------------------------------------------------

/**
 * Single-choice chips backed by a hidden input, so forms can read them with val().
 * options: [value, label][]
 */
export function chips(name, options, value, { onChange } = {}) {
  const input = h('input', { type: 'hidden', name, value: value ?? options[0][0] });
  const buttons = options.map(([v, label]) => h('button', {
    type: 'button', 'aria-pressed': String(String(v) === String(input.value)),
    onclick: () => {
      input.value = v;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === buttons.find((x) => x.dataset.value === String(v)))));
      if (onChange) onChange(v);
    },
    dataset: { value: String(v) }
  }, label));
  return h('div', { class: 'chips', role: 'group' }, input, buttons);
}

export function chipField(label, name, options, value, opts) {
  return h('div', { class: 'field', style: { display: 'grid', gap: '6px' } },
    h('span', { style: { fontSize: '12.5px', fontWeight: 500, color: 'var(--ink-2)' } }, label), chips(name, options, value, opts));
}

// --- Email report ------------------------------------------------------

const GMAIL_COMPOSE = 'https://mail.google.com/mail/?view=cm&fs=1';

/** Opens Gmail compose (in the browser where the owner is signed in) with the day report filled in. */
export async function emailDayReport(date) {
  const { to, subject, body } = await api.get(`/api/reports/daily/email?date=${date}`);
  if (!to) {
    toast('Add the report email address in Settings first.', { error: true });
    return;
  }
  const url = `${GMAIL_COMPOSE}&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  if (window.desktop?.composeEmail) await window.desktop.composeEmail(url);
  else window.open(url, '_blank', 'noopener');
  toast('Gmail opened with the report — press Send there.');
}
