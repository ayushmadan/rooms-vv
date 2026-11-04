// Minimal auto-escaping HTML templating for server-rendered print documents.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

function render(value) {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === false || value === null || value === undefined) return '';
  return escapeHtml(value);
}

/** Tagged template: interpolated values are escaped unless already SafeHtml. */
function html(strings, ...values) {
  return new SafeHtml(strings.reduce((out, str, i) => out + str + (i < values.length ? render(values[i]) : ''), ''));
}

/** Marks trusted markup (e.g. a constant stylesheet) as safe. */
function raw(markup) {
  return new SafeHtml(markup);
}

module.exports = { html, raw, escapeHtml, SafeHtml };
