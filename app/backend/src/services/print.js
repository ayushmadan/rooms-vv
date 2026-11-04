// Printable documents rendered as standalone HTML pages (A4, A4 landscape or 80 mm thermal).
// Every value goes through the escaping `html` template.
const { html, raw } = require('../lib/html');
const { formatInr } = require('../lib/money');
const { formatDisplayDate, formatDisplayDateTime, daysBetween } = require('../lib/dates');
const { amountInWords } = require('../lib/words');
const { notFound } = require('../lib/http');
const settings = require('./settings');
const bookings = require('./bookings');
const invoices = require('./invoices');
const restaurant = require('./restaurant');
const reports = require('./reports');
const documents = require('./documents');

const CATEGORY_LABELS = { ROOM: 'Room', HALL: 'Hall', FOOD: 'Food & beverage', SERVICE: 'Services', OTHER: 'Other' };
const SAC_KEYS = { ROOM: 'roomSac', HALL: 'hallSac', FOOD: 'foodSac', SERVICE: 'serviceSac', OTHER: 'serviceSac' };
const MODE_LABELS = { CASH: 'Cash', UPI: 'UPI', CREDIT_CARD: 'Credit card', DEBIT_CARD: 'Debit card', BANK_TRANSFER: 'Bank transfer' };
const KIND_LABELS = { ADVANCE: 'Advance', PAYMENT: 'Payment', REFUND: 'Refund' };

const STYLES = raw(`
  @font-face { font-family: "Fraunces"; src: url("/fonts/fraunces.woff2") format("woff2"); font-weight: 100 900; font-display: block; }
  @font-face { font-family: "Plex"; src: url("/fonts/plex-sans-400.woff2") format("woff2"); font-weight: 400; font-display: block; }
  @font-face { font-family: "Plex"; src: url("/fonts/plex-sans-500.woff2") format("woff2"); font-weight: 500; font-display: block; }
  @font-face { font-family: "Plex"; src: url("/fonts/plex-sans-600.woff2") format("woff2"); font-weight: 600; font-display: block; }
  :root { --accent: #d4891c; --heading: "Fraunces", Georgia, serif; }
  @page { size: A4; margin: 12mm 13mm 14mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #e7e2d9; color: #1c1916; font: 9.6pt/1.5 "Plex", "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; }
  .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 64px auto 28px; padding: 13mm 14mm; box-shadow: 0 2px 18px rgba(28,25,22,.18); position: relative; }
  .sheet.landscape { width: 297mm; min-height: 210mm; }
  .sheet.thermal { width: 80mm; min-height: 0; padding: 4mm 3.5mm; font-size: 9pt; }
  .serif, h1, h2, h3 { font-family: var(--heading); font-weight: 500; margin: 0; letter-spacing: -.1px; }

  .head { display: grid; grid-template-columns: 58px 1fr auto; gap: 14px; align-items: center; }
  .head img { width: 58px; height: 58px; }
  .head .name { font-family: var(--heading); font-size: 22pt; line-height: 1.05; font-weight: 500; }
  .head .tag { font-family: var(--heading); font-style: italic; color: var(--accent); font-size: 9.5pt; }
  .head .meta { font-size: 8.4pt; color: #5c554c; line-height: 1.45; }
  .ref { border: 1px solid #1c1916; min-width: 58mm; }
  .ref .title { background: #1c1916; color: #fff; text-align: center; font: 600 8.6pt "Plex", sans-serif; letter-spacing: 2px; text-transform: uppercase; padding: 5px 10px; }
  .ref dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0; padding: 7px 10px; font-size: 8.8pt; }
  .ref dt { color: #6b645b; }
  .ref dd { margin: 0; text-align: right; font-weight: 500; }
  .rules { margin: 12px 0 14px; border-top: 2px solid #1c1916; position: relative; }
  .rules::after { content: ""; position: absolute; left: 0; top: 3px; width: 100%; border-top: 1px solid var(--accent); }

  .label { font-size: 7.2pt; letter-spacing: 1.1px; text-transform: uppercase; color: #7a7268; font-weight: 600; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
  .party { border: 1px solid #e3ddd2; border-radius: 3px; padding: 9px 11px; }
  .party .label { margin-bottom: 5px; }
  .party .who { font-family: var(--heading); font-size: 12.5pt; margin-bottom: 3px; }
  dl.kv { display: grid; grid-template-columns: 30% 70%; margin: 0; row-gap: 2px; font-size: 9pt; }
  dl.kv dt { color: #6b645b; }
  dl.kv dd { margin: 0; }
  .facts { display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid #1c1916; margin-bottom: 14px; }
  .facts > div { padding: 6px 9px; border-right: 1px solid #e3ddd2; }
  .facts > div:last-child { border-right: 0; }
  .facts .value { font-size: 10.5pt; font-weight: 500; }

  table { width: 100%; border-collapse: collapse; }
  thead th { background: #f4efe6; text-align: left; font-weight: 600; font-size: 7.4pt; letter-spacing: .9px; text-transform: uppercase; color: #4d473f; padding: 6px 7px; border-top: 1px solid #1c1916; border-bottom: 1px solid #1c1916; }
  tbody td { padding: 6px 7px; border-bottom: 1px solid #ebe6dc; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #6b645b; }
  .small { font-size: 8pt; }

  .summary { display: grid; grid-template-columns: 1fr 74mm; gap: 14px; margin-top: 12px; align-items: start; }
  .totals { border: 1px solid #1c1916; }
  .totals table td { border: 0; padding: 4px 10px; }
  .totals tr.grand td { background: #1c1916; color: #fff; font-weight: 600; font-size: 11.5pt; padding: 7px 10px; }
  .totals tr.due td { font-weight: 600; border-top: 1px solid #e3ddd2; }
  .words { font-family: var(--heading); font-style: italic; font-size: 10pt; }
  .note-box { border-left: 3px solid var(--accent); background: #fbf7f0; padding: 7px 10px; font-size: 8.4pt; color: #3d3832; margin-top: 8px; white-space: pre-line; }
  .section { font-family: var(--heading); font-size: 11.5pt; margin: 16px 0 6px; }
  ol.clauses { padding-left: 17px; margin: 4px 0 0; }
  ol.clauses li { margin-bottom: 4px; padding-left: 3px; }
  .fill { display: inline-block; min-width: 42mm; border-bottom: 1px dotted #8a8178; height: 1.2em; vertical-align: bottom; }
  .signs { display: grid; grid-template-columns: repeat(var(--cols, 2), 1fr); gap: 34px; margin-top: 34px; }
  .signs div { border-top: 1px solid #1c1916; padding-top: 4px; font-size: 8.4pt; color: #3d3832; }
  .signs b { display: block; font-weight: 500; color: #1c1916; }
  .footer { position: absolute; left: 14mm; right: 14mm; bottom: 9mm; display: flex; justify-content: space-between; font-size: 7.4pt; color: #8a8178; border-top: 1px solid #ebe6dc; padding-top: 4px; }
  .stamp { position: absolute; top: 38%; left: 0; right: 0; text-align: center; font: 700 88pt var(--heading); color: rgba(160, 30, 30, .14); transform: rotate(-22deg); pointer-events: none; }
  .idphoto { max-width: 100%; max-height: 120px; border: 1px solid #e3ddd2; margin-top: 6px; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); border: 1px solid #1c1916; margin: 4px 0 6px; }
  .kpis div { padding: 7px 9px; border-right: 1px solid #e3ddd2; }
  .kpis div:last-child { border-right: 0; }
  .kpis .value { font-family: var(--heading); font-size: 14pt; }
  .receipt-amount { display: flex; justify-content: space-between; align-items: center; border: 1px solid #1c1916; padding: 10px 14px; margin: 14px 0; }
  .receipt-amount .amt { font-family: var(--heading); font-size: 22pt; }

  .thermal .c { text-align: center; }
  .thermal .big { font-size: 14pt; font-weight: 600; }
  .thermal hr { border: 0; border-top: 1px dashed #1c1916; margin: 6px 0; }
  .thermal td, .thermal th { padding: 2px 0; border: 0; font-size: 9pt; background: none; letter-spacing: 0; text-transform: none; }
  .thermal th { border-bottom: 1px dashed #1c1916; }
  .thermal .name { font-family: var(--heading); font-size: 15pt; }

  .toolbar { position: fixed; top: 0; left: 0; right: 0; display: flex; gap: 8px; align-items: center; padding: 11px 18px; background: #1c1916; color: #efe9df; z-index: 10; font: 10pt "Plex", sans-serif; }
  .toolbar button { font: inherit; padding: 7px 16px; border: 1px solid #5c554c; background: transparent; color: inherit; cursor: pointer; border-radius: 6px; }
  .toolbar button:hover { border-color: #efe9df; }
  .toolbar button.primary { background: var(--accent); border-color: var(--accent); color: #1c1916; font-weight: 600; }
  .toolbar .grow { flex: 1; font-family: var(--heading); font-size: 12pt; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { margin: 0; box-shadow: none; width: auto; min-height: calc(297mm - 26mm); padding: 0; }
    .sheet.landscape { min-height: 0; }
    .sheet.thermal { width: 72mm; min-height: 0; }
    .footer { left: 0; right: 0; bottom: 0; }
    tr { break-inside: avoid; }
  }
`);

const HEADING_FONTS = { serif: '"Fraunces", Georgia, serif', sans: '"Plex", "Segoe UI", Arial, sans-serif' };

/** Admin choices that apply to every document, as CSS. Values are validated on save. */
function themeCss(general, size) {
  const width = Number(general.thermalWidth) === 58 ? 58 : 80;
  const pageRule = size === 'thermal'
    ? `@page { size: ${width}mm auto; margin: 2mm; } .sheet.thermal { width: ${width}mm; } @media print { .sheet.thermal { width: ${width - 8}mm; } }`
    : size === 'landscape' ? '@page { size: A4 landscape; margin: 10mm; }' : '';
  return `:root { --accent: ${general.accent}; --heading: ${HEADING_FONTS[general.headingStyle] || HEADING_FONTS.serif}; } ${pageRule}`;
}

function page({ title, body, size = 'a4', general }) {
  const pageRule = themeCss(general, size);
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${STYLES}${raw(pageRule)}</style></head>
<body>
<div class="toolbar"><span class="grow">${title}</span>
  <button type="button" class="primary" data-action="print">Print</button>
  <button type="button" data-action="pdf" hidden>Save as PDF</button>
  <button type="button" data-action="close">Close</button>
</div>
${body}
<script src="/js/print-toolbar.js"></script>
</body></html>`.toString();
}

/** Letterhead with a boxed reference block on the right: [[label, value], ...]. */
function letterhead({ property, general }, docTitle, refs) {
  return html`<header class="head" style="${general.showLogo ? '' : 'grid-template-columns: 1fr auto'}">
    ${general.showLogo ? html`<img src="/assets/logo.png" alt="">` : ''}
    <div>
      <div class="name">${property.name}</div>
      ${property.tagline && general.showTagline ? html`<div class="tag">${property.tagline}</div>` : ''}
      <div class="meta">${property.address}</div>
      <div class="meta">${[property.phone, property.email].filter(Boolean).join('  ·  ')}${property.gstin ? html`  ·  <b>GSTIN ${property.gstin}</b>` : ''}</div>
    </div>
    <div class="ref"><div class="title">${docTitle}</div>
      <dl>${refs.filter(([, value]) => value).map(([label, value]) => html`<dt>${label}</dt><dd>${value}</dd>`)}</dl></div>
  </header><div class="rules"></div>`;
}

function footer(property, text) {
  return html`<div class="footer"><span>${property.name}${property.phone ? ` · ${property.phone}` : ''}</span><span>${text}</span></div>`;
}

/** Shows the value, or a dotted line to write on when it is missing. */
function orBlank(value) {
  return value ? value : html`<span class="fill"></span>`;
}

function fact(label, value) {
  return html`<div><div class="label">${label}</div><div class="value">${value || '—'}</div></div>`;
}

function sacFor(category, taxes) {
  return taxes[SAC_KEYS[category]] || '';
}

function lineTable(lines, taxes, { sac = true } = {}) {
  const showSac = sac && lines.some((l) => sacFor(l.category, taxes));
  return html`<table><thead><tr><th style="width:5%">#</th><th>Description</th>${showSac ? html`<th>SAC</th>` : ''}<th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>
    ${lines.map((l, i) => html`<tr><td class="muted">${i + 1}</td><td>${l.description}<div class="small muted">${CATEGORY_LABELS[l.category] || l.category}</div></td>
      ${showSac ? html`<td>${sacFor(l.category, taxes)}</td>` : ''}<td class="num">${l.qty}</td><td class="num">${formatInr(l.rate)}</td><td class="num">${formatInr(l.amount)}</td></tr>`)}
  </tbody></table>`;
}

function taxTable(taxLines) {
  if (!taxLines.length) return '';
  return html`<table class="small"><thead><tr><th>GST summary</th><th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Total tax</th></tr></thead><tbody>
    ${taxLines.map((t) => {
      const half = Math.floor(t.tax / 2);
      return html`<tr><td>${CATEGORY_LABELS[t.category]} @ ${t.ratePercent}%</td><td class="num">${formatInr(t.taxable)}</td>
        <td class="num">${formatInr(half)}<div class="muted">${t.ratePercent / 2}%</div></td><td class="num">${formatInr(t.tax - half)}<div class="muted">${t.ratePercent / 2}%</div></td><td class="num">${formatInr(t.tax)}</td></tr>`;
    })}</tbody></table>`;
}

function totalsBox({ taxable, tax, total, paid, pricesIncludeTax }) {
  const balance = total - paid;
  return html`<div class="totals"><table>
    <tr><td>Taxable value</td><td class="num">${formatInr(taxable)}</td></tr>
    <tr><td>CGST + SGST</td><td class="num">${formatInr(tax)}</td></tr>
    <tr class="grand"><td>Total${pricesIncludeTax ? '' : ' payable'}</td><td class="num">${formatInr(total)}</td></tr>
    <tr><td>Received</td><td class="num">${formatInr(paid)}</td></tr>
    <tr class="due"><td>${balance >= 0 ? 'Balance due' : 'Refund due'}</td><td class="num">${formatInr(Math.abs(balance))}</td></tr>
  </table></div>`;
}

function paymentDetails(property) {
  const parts = [property.upiId && `UPI: ${property.upiId}`, property.bankDetails].filter(Boolean);
  return parts.length ? html`<div class="note-box"><span class="label">Pay to</span>\n${parts.join('\n')}</div>` : '';
}

function paymentsTable(payments, timeZone) {
  const active = payments.filter((p) => !p.voided);
  if (!active.length) return '';
  return html`<div class="section">Payments received</div>
    <table class="small"><thead><tr><th>Date</th><th>Receipt</th><th>Type</th><th>Mode</th><th>Reference</th><th class="num">Amount</th></tr></thead><tbody>
    ${active.map((p) => html`<tr><td>${formatDisplayDateTime(p.receivedAt, timeZone)}</td><td>R-${p.id}</td><td>${KIND_LABELS[p.kind]}</td><td>${MODE_LABELS[p.mode]}</td>
      <td>${p.reference || '—'}</td><td class="num">${p.kind === 'REFUND' ? '− ' : ''}${formatInr(p.amount)}</td></tr>`)}
    </tbody></table>`;
}

function context(store) {
  const docs = documents.getAll(store);
  return {
    property: settings.getSection(store, 'property'),
    policy: settings.getSection(store, 'policy'),
    taxes: settings.getSection(store, 'taxes'),
    general: docs.general,
    docs
  };
}

// --- Documents -------------------------------------------------------------

/** @param {{ showIdPhoto?: boolean, ticket?: string }} access photo only for admin print tickets */
function declaration(store, bookingId, { showIdPhoto = false, ticket = '' } = {}) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const doc = ctx.docs.registration;
  const { clauses } = settings.getSection(store, 'declaration');
  const b = bookings.detail(store, bookingId);
  const g = b.guest;
  const d = b.declaration || { coGuests: [] };
  const foreign = g.nationality && !/^indian$/i.test(g.nationality);
  const rows = d.coGuests.length ? d.coGuests : [{}, {}];
  const body = html`<div class="sheet">
    ${letterhead(ctx, doc.title, [['Booking', b.code], [b.unit.kind === 'HALL' ? 'Hall' : 'Room', b.unit.name], ['Checked in', b.checkedInAt ? formatDisplayDateTime(b.checkedInAt, policy.timeZone) : '']])}
    <div class="facts">
      ${fact('Arrival', `${formatDisplayDate(b.checkIn)} · ${policy.checkInTime}`)}
      ${fact('Departure', `${formatDisplayDate(b.checkOut)} · ${policy.checkOutTime}`)}
      ${fact('Nights', daysBetween(b.checkIn, b.checkOut))}
      ${fact('Guests', `${b.adults} adult${b.adults > 1 ? 's' : ''}${b.children ? ` · ${b.children} child${b.children > 1 ? 'ren' : ''}` : ''}`)}
    </div>
    <div class="parties">
      <div class="party"><div class="label">Primary guest</div><div class="who">${g.fullName}</div><dl class="kv">
        <dt>Phone</dt><dd>${g.phone}</dd>
        <dt>Email</dt><dd>${orBlank(g.email)}</dd>
        <dt>Address</dt><dd>${orBlank([g.address, g.city].filter(Boolean).join(', '))}</dd>
        <dt>Nationality</dt><dd>${g.nationality}</dd>
        <dt>Photo ID</dt><dd>${g.idType ? `${g.idType} · ${g.idNumber}` : orBlank('')}</dd>
        ${g.company ? html`<dt>Company</dt><dd>${g.company}${g.gstin ? ` · GSTIN ${g.gstin}` : ''}</dd>` : ''}
      </dl></div>
      ${doc.showTravel ? html`<div class="party"><div class="label">Travel details</div><dl class="kv">
        <dt>Arriving from</dt><dd>${orBlank(d.arrivingFrom)}</dd>
        <dt>Going to</dt><dd>${orBlank(d.goingTo)}</dd>
        <dt>Purpose</dt><dd>${orBlank(d.purpose)}</dd>
        <dt>Vehicle no.</dt><dd>${orBlank(d.vehicleNo)}</dd>
      </dl>${showIdPhoto && doc.showIdPhoto ? html`<div style="display:flex;gap:6px">
        ${g.hasIdPhoto ? html`<img class="idphoto" style="max-width:49%" src="/api/guests/${g.id}/photo?side=front&ticket=${ticket}" alt="Front of photo ID">` : ''}
        ${g.hasIdPhotoBack ? html`<img class="idphoto" style="max-width:49%" src="/api/guests/${g.id}/photo?side=back&ticket=${ticket}" alt="Back of photo ID">` : ''}</div>` : ''}</div>` : ''}
    </div>
    ${foreign ? html`<div class="party" style="margin-bottom:14px"><div class="label">Foreign national · Form C particulars</div><dl class="kv" style="grid-template-columns:22% 28% 22% 28%">
        <dt>Passport no.</dt><dd>${orBlank(d.passportNo)}</dd><dt>Visa no.</dt><dd>${orBlank(d.visaNo)}</dd>
        <dt>Visa valid till</dt><dd>${orBlank(formatDisplayDate(d.visaValidTill))}</dd><dt>Arrived in India</dt><dd>${orBlank(formatDisplayDate(d.arrivedInIndiaOn))}</dd>
      </dl></div>` : ''}
    ${doc.showCoGuests ? html`<div class="section">Accompanying guests</div>
    <table><thead><tr><th style="width:5%">#</th><th>Name</th><th style="width:8%">Age</th><th>Relation</th><th>Photo ID</th><th style="width:22%">Signature</th></tr></thead><tbody>
      ${rows.map((c, i) => html`<tr><td class="muted">${i + 2}</td><td>${orBlank(c.name)}</td><td>${c.age ?? ''}</td><td>${c.relation || ''}</td><td>${[c.idType, c.idNumber].filter(Boolean).join(' · ')}</td><td></td></tr>`)}
    </tbody></table>` : ''}
    <div class="section">Declaration</div>
    <p style="margin:0 0 4px">${documents.fill(doc.intro, { guest: g.fullName, property: property.name })}</p>
    <ol class="clauses">${clauses.map((c) => html`<li>${c}</li>`)}</ol>
    ${d.remarks ? html`<div class="note-box">${d.remarks}</div>` : ''}
    ${doc.footerNote ? html`<div class="note-box">${doc.footerNote}</div>` : ''}
    <div class="signs" style="--cols:${doc.showKeyIssued ? 3 : 2}"><div><b>${doc.guestSign}</b>Date: ${formatDisplayDate(b.checkIn)}</div><div><b>${doc.deskSign}</b>Front desk, ${property.name}</div>${doc.showKeyIssued ? html`<div><b>Room key issued</b>Key no. ____</div>` : ''}</div>
    ${footer(property, `${doc.title} · ${b.code}`)}
  </div>`;
  return page({ title: `Registration ${b.code}`, body, general: ctx.general });
}

function invoiceDocument(store, invoiceId, { thermal = false } = {}) {
  const ctx = context(store);
  const { property, policy, taxes } = ctx;
  const doc = ctx.docs.invoice;
  const inv = invoices.get(store, invoiceId);
  if (thermal) return thermalBill(ctx, inv);
  const booking = inv.bookingId ? bookings.detail(store, inv.bookingId) : null;
  const bill = inv.billTo;
  const body = html`<div class="sheet">
    ${inv.status === 'VOID' ? html`<div class="stamp">VOID</div>` : ''}
    ${letterhead(ctx, doc.title, [['Invoice no.', inv.number], ['Date', formatDisplayDateTime(inv.issuedAt, policy.timeZone)], [booking ? 'Booking' : 'Bill', booking ? booking.code : bill.orderCode]])}
    <div class="parties">
      <div class="party"><div class="label">Billed to</div><div class="who">${bill.name}</div><dl class="kv">
        ${bill.company ? html`<dt>Company</dt><dd>${bill.company}</dd>` : ''}
        ${bill.gstin ? html`<dt>GSTIN</dt><dd>${bill.gstin}</dd>` : ''}
        ${bill.phone ? html`<dt>Phone</dt><dd>${bill.phone}</dd>` : ''}
        ${bill.address ? html`<dt>Address</dt><dd>${bill.address}</dd>` : ''}
      </dl></div>
      <div class="party"><div class="label">${booking ? 'Stay' : 'Supply'}</div><dl class="kv">
        ${booking ? html`<dt>${booking.unit.kind === 'HALL' ? 'Hall' : 'Room'}</dt><dd>${booking.unit.name}</dd>
          <dt>Arrival</dt><dd>${formatDisplayDate(booking.checkIn)}</dd><dt>Departure</dt><dd>${formatDisplayDate(booking.checkOut)}</dd>
          <dt>Guests</dt><dd>${booking.adults + booking.children}</dd>` : html`<dt>Bill</dt><dd>${bill.orderCode}</dd>`}
        <dt>Place of supply</dt><dd>${property.address.split(',').slice(-2).join(',').trim() || '—'}</dd>
      </dl></div>
    </div>
    ${lineTable(inv.lines, taxes, { sac: doc.showSac })}
    <div class="summary">
      <div>
        ${doc.showWords ? html`<div class="label">Amount in words</div><div class="words">${amountInWords(inv.total)}</div>` : ''}
        ${doc.showTaxSummary ? html`<div style="margin-top:10px">${taxTable(inv.taxLines)}</div>` : ''}
        ${doc.showPayTo ? paymentDetails(property) : ''}
      </div>
      ${totalsBox({ ...inv, pricesIncludeTax: taxes.pricesIncludeTax })}
    </div>
    ${booking && doc.showPayments ? paymentsTable(booking.folio.payments, policy.timeZone) : ''}
    ${inv.status === 'VOID' ? html`<div class="note-box">Voided: ${inv.voidReason}</div>` : ''}
    ${property.invoiceTerms && doc.showTerms ? html`<div class="note-box"><span class="label">Terms</span>\n${property.invoiceTerms}</div>` : ''}
    <div class="signs"><div><b>${doc.customerSign}</b>I have checked and accept this bill</div><div style="text-align:right"><b>For ${property.name}</b>${doc.signatorySign}</div></div>
    ${footer(property, `${doc.footerNote} ${inv.number}`.trim())}
  </div>`;
  return page({ title: `Invoice ${inv.number}`, body, general: ctx.general });
}

function folioStatement(store, bookingId) {
  const ctx = context(store);
  const { property, policy, taxes } = ctx;
  const doc = ctx.docs.folio;
  const b = bookings.detail(store, bookingId);
  const body = html`<div class="sheet">
    ${letterhead(ctx, doc.title, [['Booking', b.code], ['Printed', formatDisplayDateTime(new Date().toISOString(), policy.timeZone)]])}
    <div class="facts">${fact('Guest', b.guest.fullName)}${fact(b.unit.kind === 'HALL' ? 'Hall' : 'Room', b.unit.name)}${fact('Arrival', formatDisplayDate(b.checkIn))}${fact('Departure', formatDisplayDate(b.checkOut))}</div>
    ${lineTable(b.folio.lines, taxes)}
    <div class="summary"><div>${taxTable(b.folio.taxLines)}${doc.showPayTo ? paymentDetails(property) : ''}</div>${totalsBox({ ...b.folio, pricesIncludeTax: taxes.pricesIncludeTax })}</div>
    ${doc.showPayments ? paymentsTable(b.folio.payments, policy.timeZone) : ''}
    ${doc.note ? html`<div class="note-box">${doc.note}</div>` : ''}
    <div class="signs"><div><b>Guest signature</b>Charges checked and accepted</div><div style="text-align:right"><b>For ${property.name}</b>Front desk</div></div>
    ${footer(property, `${doc.title} · ${b.code}`)}
  </div>`;
  return page({ title: `Folio ${b.code}`, body, general: ctx.general });
}

function bookingConfirmation(store, bookingId) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const doc = ctx.docs.confirmation;
  const b = bookings.detail(store, bookingId);
  const all = [b, ...b.group.map((g) => bookings.detail(store, g.id))];
  const total = all.reduce((s, x) => s + x.folio.total, 0);
  const paid = all.reduce((s, x) => s + x.folio.paid, 0);
  const meals = Object.entries(b.mealPlan).filter(([, on]) => on).map(([k]) => k[0].toUpperCase() + k.slice(1));
  const body = html`<div class="sheet">
    ${letterhead(ctx, doc.title, [['Booking', b.groupCode || b.code], ['Issued', formatDisplayDate(b.createdAt.slice(0, 10))], ['Status', b.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed']])}
    <p class="serif" style="font-size:15pt;margin:4px 0 2px">${documents.fill(doc.greeting, { guest: b.guest.fullName, property: property.name })}</p>
    <p class="muted" style="margin:0 0 14px">${documents.fill(doc.intro, { guest: b.guest.fullName, property: property.name })}</p>
    <div class="facts">
      ${fact('Check-in', `${formatDisplayDate(b.checkIn)} from ${policy.checkInTime}`)}
      ${fact('Check-out', `${formatDisplayDate(b.checkOut)} by ${policy.checkOutTime}`)}
      ${fact('Nights', daysBetween(b.checkIn, b.checkOut))}
      ${fact('Guests', b.adults + b.children)}
    </div>
    <table><thead><tr><th>Booking</th><th>Room / hall</th><th>Meals</th><th class="num">Amount</th></tr></thead><tbody>
      ${all.map((x) => html`<tr><td>${x.code}</td><td>${x.unit.name}</td><td>${meals.join(', ') || 'Room only'}</td><td class="num">${formatInr(x.folio.total)}</td></tr>`)}
    </tbody></table>
    <div class="summary"><div>${doc.showPayTo ? paymentDetails(property) : ''}</div><div class="totals"><table>
      <tr class="grand"><td>Total</td><td class="num">${formatInr(total)}</td></tr>
      <tr><td>Advance received</td><td class="num">${formatInr(paid)}</td></tr>
      <tr class="due"><td>Payable at check-in</td><td class="num">${formatInr(Math.max(0, total - paid))}</td></tr></table></div></div>
    ${policy.bookingTerms && doc.showTerms ? html`<div class="note-box"><span class="label">Please note</span>\n${policy.bookingTerms}</div>` : ''}
    <div class="signs"><div><b>Guest</b>${b.guest.phone}</div><div style="text-align:right"><b>For ${property.name}</b>Reservations</div></div>
    ${footer(property, `${doc.title} · ${b.code}`)}
  </div>`;
  return page({ title: `Confirmation ${b.code}`, body, general: ctx.general });
}

function paymentReceipt(store, paymentId) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const doc = ctx.docs.receipt;
  const p = store.get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!p) throw notFound('Payment not found');
  const b = p.booking_id ? bookings.detail(store, p.booking_id) : null;
  const order = p.order_id ? restaurant.orderDetail(store, p.order_id) : null;
  const from = b ? b.guest.fullName : order.customerName || 'Walk-in guest';
  const body = html`<div class="sheet">
    ${p.voided_at ? html`<div class="stamp">VOID</div>` : ''}
    ${letterhead(ctx, p.kind === 'REFUND' ? doc.refundTitle : doc.title, [['Receipt no.', `R-${p.id}`], ['Date', formatDisplayDateTime(p.received_at, policy.timeZone)], [b ? 'Booking' : 'Bill', b ? b.code : order.code]])}
    <p style="margin:6px 0">${p.kind === 'REFUND' ? 'Refunded to' : 'Received with thanks from'} <b class="serif" style="font-size:13pt">${from}</b>${b ? html` for the stay in ${b.unit.name}, ${formatDisplayDate(b.checkIn)} to ${formatDisplayDate(b.checkOut)}` : ''}.</p>
    <div class="receipt-amount"><div><div class="label">${KIND_LABELS[p.kind]} · ${MODE_LABELS[p.mode]}${p.reference ? ` · ${p.reference}` : ''}</div><div class="words">${amountInWords(p.amount)}</div></div><div class="amt">${formatInr(p.amount)}</div></div>
    ${b && doc.showBalance ? html`<table class="small" style="width:60%"><tbody>
      <tr><td>Bill total</td><td class="num">${formatInr(b.folio.total)}</td></tr>
      <tr><td>Total received to date</td><td class="num">${formatInr(b.folio.paid)}</td></tr>
      <tr><td><b>Balance</b></td><td class="num"><b>${formatInr(b.folio.balance)}</b></td></tr></tbody></table>` : ''}
    ${p.note ? html`<div class="note-box">${p.note}</div>` : ''}
    ${doc.footerNote ? html`<div class="note-box">${doc.footerNote}</div>` : ''}
    <div class="signs"><div><b>${p.kind === 'REFUND' ? 'Received by guest' : 'Paid by'}</b>${from}</div><div style="text-align:right"><b>For ${property.name}</b>${p.created_by}</div></div>
    ${footer(property, `Receipt R-${p.id}`)}
  </div>`;
  return page({ title: `Receipt R-${p.id}`, body, general: ctx.general });
}

function thermalBill(ctx, inv) {
  const { property, general } = ctx;
  const doc = ctx.docs.thermal;
  const timeZone = ctx.policy.timeZone;
  const body = html`<div class="sheet thermal">
    ${inv.status === 'VOID' ? html`<div class="stamp">VOID</div>` : ''}
    <div class="c"><div class="name">${property.name}</div><div>${property.address}</div>${property.gstin && doc.showGstin ? html`<div>GSTIN ${property.gstin}</div>` : ''}</div>
    <hr><div><b>Bill ${inv.number}</b></div><div>${formatDisplayDateTime(inv.issuedAt, timeZone)}</div><div>${inv.billTo.name}${inv.billTo.orderCode ? ` · ${inv.billTo.orderCode}` : ''}</div>
    ${inv.billTo.gstin ? html`<div>GSTIN ${inv.billTo.gstin}</div>` : ''}<hr>
    <table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Amt</th></tr></thead><tbody>
      ${inv.lines.map((l) => html`<tr><td>${l.description}</td><td class="num">${l.qty}</td><td class="num">${(l.amount / 100).toFixed(2)}</td></tr>`)}
    </tbody></table><hr>
    <table>
      <tr><td>Taxable</td><td class="num">${(inv.taxable / 100).toFixed(2)}</td></tr>
      ${inv.taxLines.map((t) => html`<tr><td>CGST ${t.ratePercent / 2}% + SGST ${t.ratePercent / 2}%</td><td class="num">${(t.tax / 100).toFixed(2)}</td></tr>`)}
      <tr><td class="big">Total</td><td class="num big">${formatInr(inv.total)}</td></tr>
    </table><hr><div class="c">${property.upiId && doc.showUpi ? html`<div>UPI: ${property.upiId}</div>` : ''}${doc.footer}</div>
  </div>`;
  return page({ title: `Bill ${inv.number}`, body, size: 'thermal', general });
}

function kot(store, orderId, kotNo) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const order = restaurant.orderDetail(store, orderId);
  const items = restaurant.kotItems(store, orderId, kotNo);
  const where = order.table ? `Table ${order.table.name}` : order.booking ? `Room ${order.booking.unit}` : 'Takeaway';
  const body = html`<div class="sheet thermal">
    <div class="c">${property.name} · ${ctx.docs.kot.title}</div><hr>
    <div class="big">KOT ${kotNo}  ·  ${where}</div>
    <div>${order.code} · ${formatDisplayDateTime(new Date().toISOString(), policy.timeZone)}</div><hr>
    <table><tbody>${items.map((i) => html`<tr><td class="big" style="width:14mm">${i.qty} ×</td><td class="big">${i.name}${i.note ? html`<div style="font-size:9pt;font-weight:400">— ${i.note}</div>` : ''}</td></tr>`)}</tbody></table>
    <hr><div>${order.covers} cover${order.covers > 1 ? 's' : ''}</div>
  </div>`;
  return page({ title: `KOT ${kotNo}`, body, size: 'thermal', general: ctx.general });
}

function dailyReport(store, date) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const doc = ctx.docs.daySheet;
  const r = reports.daily(store, { date });
  const stayTable = (rows, empty) => (rows.length
    ? html`<table class="small"><thead><tr><th>Booking</th><th>Room</th><th>Guest</th><th>Phone</th><th class="num">Pax</th><th>Status</th></tr></thead><tbody>
      ${rows.map((s) => html`<tr><td>${s.code}</td><td>${s.unit}</td><td>${s.guest}</td><td>${s.phone}</td><td class="num">${s.adults + s.children}</td><td>${s.status.replace('_', ' ').toLowerCase()}</td></tr>`)}</tbody></table>`
    : html`<p class="muted small">${empty}</p>`);
  const body = html`<div class="sheet">
    ${letterhead(ctx, doc.title, [['Date', formatDisplayDate(date)], ['Printed', formatDisplayDateTime(new Date().toISOString(), policy.timeZone)]])}
    <div class="kpis">
      <div><div class="label">Occupancy</div><div class="value">${r.rooms.occupancyPercent}%</div><div class="muted small">${r.rooms.occupied} of ${r.rooms.total} rooms</div></div>
      <div><div class="label">Room revenue</div><div class="value">${formatInr(r.revenue.room)}</div></div>
      <div><div class="label">Food & restaurant</div><div class="value">${formatInr(r.revenue.meals + r.revenue.restaurant + r.revenue.postedToRooms)}</div></div>
      <div><div class="label">Collected</div><div class="value">${formatInr(r.collectionTotal)}</div></div>
      <div><div class="label">Cash in hand</div><div class="value">${formatInr(r.cash.net)}</div><div class="muted small">after cash expenses</div></div>
    </div>
    <div class="section">Collections by mode</div>
    <table class="small"><tbody>${Object.entries(r.collections).map(([mode, amt]) => html`<tr><td>${MODE_LABELS[mode]}</td><td class="num">${formatInr(amt)}</td></tr>`)}
      <tr><td><b>Total</b></td><td class="num"><b>${formatInr(r.collectionTotal)}</b></td></tr></tbody></table>
    <div class="section">Arrivals (${r.arrivals.length})</div>${stayTable(r.arrivals, 'No arrivals.')}
    <div class="section">Departures (${r.departures.length})</div>${stayTable(r.departures, 'No departures.')}
    <div class="section">In house (${r.inHouse.length})</div>${stayTable(r.inHouse, 'No guests in house.')}
    <div class="section">Payments (${r.payments.length})</div>
    ${r.payments.length ? html`<table class="small"><thead><tr><th>Time</th><th>For</th><th>Type</th><th>Mode</th><th>By</th><th class="num">Amount</th></tr></thead><tbody>
      ${r.payments.map((p) => html`<tr><td>${formatDisplayDateTime(p.at, policy.timeZone)}</td><td>${p.ref}</td><td>${KIND_LABELS[p.kind]}</td><td>${MODE_LABELS[p.mode]}</td><td>${p.by}</td><td class="num">${p.kind === 'REFUND' ? '− ' : ''}${formatInr(p.amount)}</td></tr>`)}</tbody></table>`
      : html`<p class="muted small">No payments.</p>`}
    <div class="section">Expenses (${formatInr(r.expenseTotal)})</div>
    ${r.expenses.length ? html`<table class="small"><thead><tr><th>Category</th><th>Description</th><th>Paid to</th><th>Mode</th><th class="num">Amount</th></tr></thead><tbody>
      ${r.expenses.map((e) => html`<tr><td>${e.category}</td><td>${e.description}</td><td>${e.paidTo}</td><td>${MODE_LABELS[e.mode]}</td><td class="num">${formatInr(e.amount)}</td></tr>`)}</tbody></table>`
      : html`<p class="muted small">No expenses.</p>`}
    <div class="signs"><div><b>${doc.preparedBy}</b>Front desk</div><div style="text-align:right"><b>${doc.checkedBy}</b>Manager</div></div>
  </div>`;
  return page({ title: `${doc.title} ${date}`, body, general: ctx.general });
}

function guestRegister(store, from, to) {
  const ctx = context(store);
  const { property, policy } = ctx;
  const doc = ctx.docs.register;
  const rows = reports.guestRegister(store, { from, to }, { reveal: true });
  const body = html`<div class="sheet landscape">
    ${letterhead(ctx, doc.title, [['From', formatDisplayDate(from)], ['To', formatDisplayDate(to)], ['Entries', String(rows.length)]])}
    <table class="small"><thead><tr><th>#</th><th>Checked in</th><th>Room</th><th>Guest &amp; address</th><th>Nationality</th><th>Photo ID</th><th class="num">Pax</th><th>From → to</th><th>Purpose</th><th>Checked out</th>${doc.showSignature ? html`<th style="width:26mm">Signature</th>` : ''}</tr></thead><tbody>
    ${rows.map((r, i) => html`<tr>
      <td>${i + 1}</td><td>${formatDisplayDateTime(r.checked_in_at, policy.timeZone)}</td><td>${r.unit}</td>
      <td><b>${r.full_name}</b><br>${r.phone}<br><span class="muted">${[r.address, r.city].filter(Boolean).join(', ')}</span>
        ${r.co_guests.length ? html`<br><span class="muted">With: ${r.co_guests.map((c) => c.name).join(', ')}</span>` : ''}</td>
      <td>${r.nationality}${r.passport_no ? html`<br>PP ${r.passport_no}` : ''}</td><td>${r.id_type}<br>${r.id_number}</td>
      <td class="num">${r.adults + r.children}</td><td>${r.arriving_from || '—'} → ${r.going_to || '—'}</td><td>${r.purpose}</td>
      <td>${r.checked_out_at ? formatDisplayDateTime(r.checked_out_at, policy.timeZone) : ''}</td>${doc.showSignature ? html`<td></td>` : ''}</tr>`)}
    </tbody></table>
    ${rows.length ? '' : html`<p class="muted">No check-ins in this period.</p>`}
  </div>`;
  return page({ title: `${doc.title} ${from} to ${to}`, body, size: 'landscape', general: ctx.general });
}

module.exports = { declaration, invoiceDocument, folioStatement, bookingConfirmation, paymentReceipt, kot, dailyReport, guestRegister };
