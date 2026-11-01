// One booking: guest, stay, declaration, folio, payments and every front-desk action.
import { h, clear, append } from '../dom.js';
import { api, admin } from '../api.js';
import { state } from '../state.js';
import {
  panel, table, statusTag, tag, field, select, check, modeOptions, formDialog, confirmDialog, toast, showError,
  val, openPrint, loading, chipField
} from '../ui.js';
import { pickLine } from '../billing.js';
import { idPhotoBlock, idNumberText, idPhotoInput, uploadIdPhoto } from '../idcard.js';
import { money, date, dateTime, plural, localInputValue, fromLocalInput, addDays, LABELS } from '../format.js';
import { SOURCES } from './booking-new.js';

const PURPOSES = ['Leisure', 'Business', 'Wedding / function', 'Pilgrimage', 'Medical', 'Transit', 'Other'];
const DISCOUNT_TYPES = [['NONE', 'No discount'], ['PERCENT', 'Percent'], ['AMOUNT', 'Amount ₹']];

/** The rate currently charged per night: the agreed rate, or the first night's frozen rate. */
function currentRate(b) {
  return b.nightlyRate ?? b.folio.nights[0]?.rent ?? 0;
}

/** Fields to change the price of the stay at check-in or check-out. */
function priceFields(b) {
  return h('div', { class: 'grid c3' },
    field(`Rate per ${b.unit.kind === 'HALL' ? 'day' : 'night'} ₹`, { name: 'rate', type: 'number', min: 0, step: '1', value: currentRate(b) / 100 }),
    select('Discount on room', DISCOUNT_TYPES, { name: 'roomDiscountType', value: b.discounts.roomType }),
    field('Discount value', { name: 'roomDiscountValue', type: 'number', min: 0, step: '0.01', value: b.discounts.roomType === 'AMOUNT' ? b.discounts.roomValue / 100 : b.discounts.roomValue }));
}

/** Saves a changed rate or discount before check-in/out; returns true if anything changed. */
async function applyPriceChanges(b, form) {
  const rate = Math.round(Number(val(form, 'rate')) * 100);
  const discountType = val(form, 'roomDiscountType');
  const discountValue = Number(val(form, 'roomDiscountValue') || 0);
  const oldDiscountValue = b.discounts.roomType === 'AMOUNT' ? b.discounts.roomValue / 100 : b.discounts.roomValue;
  const changed = rate !== currentRate(b) || discountType !== b.discounts.roomType || discountValue !== oldDiscountValue;
  if (!changed) return false;
  await api.patch(`/api/bookings/${b.id}`, {
    nightlyRate: rate / 100, roomDiscountType: discountType, roomDiscountValue: discountValue
  });
  return true;
}

const PRINTABLES = [
  ['declaration', 'Registration card & declaration', 'Guest details, accompanying guests and the declaration to sign at check-in.'],
  ['confirmation', 'Booking confirmation', 'Dates, rooms, amount and advance, for the guest to keep.'],
  ['folio', 'Folio statement', 'Running bill with all charges and payments so far.']
];

function printDialog(b) {
  const invoice = b.invoices.find((i) => i.status === 'ISSUED');
  const items = [
    ...PRINTABLES.map(([path, title, text]) => [`/print/${path}/${b.id}`, title, text]),
    ...(invoice ? [[`/print/invoice/${invoice.id}`, `Tax invoice ${invoice.number}`, 'GST invoice issued at check-out.']] : []),
    ...b.folio.payments.filter((p) => !p.voided).map((p) => [`/print/receipt/${p.id}`, `Receipt R-${p.id}`, `${LABELS.kind[p.kind]} of ${money(p.amount)} by ${LABELS.mode[p.mode]}, ${dateTime(p.receivedAt)}`])
  ];
  return formDialog({
    title: 'Print documents',
    lede: `${b.code} · ${b.guest.fullName}`,
    body: h('div', { class: 'stack' }, items.map(([url, title, text]) => h('button', {
      type: 'button', style: { justifyContent: 'space-between', textAlign: 'left', whiteSpace: 'normal', padding: '12px 14px' },
      onclick: () => openPrint(url)
    }, h('span', {}, h('strong', {}, title), h('div', { class: 'hint' }, text)), h('span', { class: 'hint' }, 'Open')))),
    submitLabel: 'Done',
    cancelLabel: 'Close',
    onSubmit: () => true
  });
}

export async function render(page, params) {
  const id = Number(params.id);
  loading(page);
  const reload = async () => draw(page, await api.get(`/api/bookings/${id}`));
  await reload();
  if (params.action === 'check-in') checkInDialog(await api.get(`/api/bookings/${id}`), reload);
  if (params.action === 'check-out') checkOutDialog(await api.get(`/api/bookings/${id}`), reload);
  if (params.action) history.replaceState(null, '', `#/booking/${id}`);
}

function draw(page, b) {
  const reload = async () => draw(page, await api.get(`/api/bookings/${b.id}`));
  const run = (fn) => () => fn(b, reload).catch?.(showError);
  const unitWord = b.unit.kind === 'HALL' ? 'Hall' : 'Room';

  const actions = [];
  if (b.status === 'BOOKED') {
    actions.push(h('button', { class: 'accent', onclick: run(checkInDialog) }, 'Check in'));
    actions.push(h('button', { onclick: run(editStayDialog) }, 'Change stay'));
    actions.push(h('button', { class: 'danger', onclick: run(cancelDialog) }, 'Cancel'));
  }
  if (b.status === 'CHECKED_IN') {
    actions.push(h('button', { class: 'accent', onclick: run(checkOutDialog) }, 'Check out'));
    actions.push(h('button', { onclick: run(editStayDialog) }, 'Extend / move'));
  }
  if (b.status === 'CHECKED_OUT') actions.push(h('button', { class: 'primary', onclick: run(issueInvoice) }, 'Tax invoice'));
  if (b.status !== 'BOOKED' && admin.isUnlocked) actions.push(h('button', { class: 'quiet', onclick: run(revert) }, 'Undo last step'));

  const printMenu = h('button', { onclick: () => printDialog(b) }, 'Print…');

  append(clear(page), 
    h('div', { class: 'booking-head' },
      h('div', {},
        h('div', { class: 'eyebrow' }, `${b.code}${b.groupCode ? ` · group ${b.groupCode}` : ''} · `, statusTag(b.status)),
        h('div', { class: 'who' }, h('a', { href: `#/guest/${b.guest.id}`, style: { textDecoration: 'none' } }, b.guest.fullName)),
        h('div', { class: 'facts' },
          fact(unitWord, b.unit.name),
          fact('Arrival', date(b.checkIn)),
          fact('Departure', date(b.checkOut)),
          fact('Nights', b.nights),
          fact('Guests', `${b.adults}${b.children ? ` + ${b.children}` : ''}`),
          fact('Phone', b.guest.phone),
          fact('Source', b.source))),
      h('div', { class: 'act' }, actions, h('span', { style: { width: '8px' } }), printMenu)),
    b.status === 'CANCELLED' || b.status === 'NO_SHOW' ? h('div', { class: 'notice danger', style: { marginBottom: '18px' } }, `${LABELS.status[b.status]}: ${b.cancelReason}`) : null,
    b.group.length ? h('div', { class: 'notice', style: { marginBottom: '18px' } }, 'Booked together with ', b.group.map((g, i) => [i ? ', ' : '', h('a', { href: `#/booking/${g.id}` }, `${g.unit} (${g.code})`)])) : null,
    h('div', { class: 'columns main-side' },
      h('div', {}, folioPanel(b, reload), paymentsPanel(b, reload), invoicesPanel(b, reload)),
      h('div', {}, guestPanel(b, reload), declarationPanel(b, reload), stayPanel(b))));
}

function fact(label, value) {
  return h('span', {}, h('b', {}, label), value);
}

// --- Panels --------------------------------------------------------------

function folioPanel(b, reload) {
  const f = b.folio;
  const canPost = ['BOOKED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status);
  return h('section', { class: 'panel' },
    h('header', {}, h('h2', {}, 'Folio'), h('span', { class: 'count' }, state.boot.taxes.pricesIncludeTax ? 'Prices include GST' : 'GST added'),
      h('div', { class: 'tools' }, canPost ? h('button', { class: 'small', onclick: () => chargeDialog(b, reload) }, 'Add charge') : null)),
    h('div', { class: 'body flush' },
      table([
        { title: 'Description', value: (l) => l.description },
        { title: 'Type', value: (l) => LABELS.category[l.category] || l.category },
        { title: 'Qty', num: true, value: (l) => l.qty },
        { title: 'Rate', num: true, value: (l) => money(l.rate) },
        { title: 'Amount', num: true, value: (l) => money(l.amount) },
        { title: '', value: (l) => (l.chargeId && admin.isUnlocked ? h('button', { class: 'quiet small', onclick: (e) => { e.stopPropagation(); voidDialog('charge', l.chargeId, reload); } }, 'Void') : '') }
      ], f.lines, { empty: 'No charges.' }),
      h('div', { style: { padding: '10px 16px' } },
        h('dl', { class: 'pairs', style: { gridTemplateColumns: '1fr auto', maxWidth: '340px', marginLeft: 'auto' } },
          h('dt', {}, 'Taxable value'), h('dd', { class: 'num' }, money(f.taxable)),
          f.taxLines.map((t) => [h('dt', {}, `GST ${t.ratePercent}% on ${LABELS.category[t.category].toLowerCase()}`), h('dd', {}, money(t.tax))]),
          h('dt', {}, 'Total'), h('dd', {}, h('strong', {}, money(f.total))),
          h('dt', {}, 'Received'), h('dd', {}, money(f.paid)))),
      h('div', { class: 'balance-line' },
        h('span', {}, f.balance >= 0 ? 'Balance due' : 'Refund due'),
        h('strong', { class: f.balance > 0 ? 'money-due' : 'money-ok' }, money(Math.abs(f.balance))))));
}

function paymentsPanel(b, reload) {
  return panel('Payments', {
    count: plural(b.folio.payments.filter((p) => !p.voided).length, 'entry', 'entries'),
    flush: true,
    tools: ['CANCELLED', 'NO_SHOW'].includes(b.status) && b.folio.paid <= 0 ? null : h('button', { class: 'small primary', onclick: () => paymentDialog(b, reload) }, 'Record payment')
  }, table([
    { title: 'When', value: (p) => dateTime(p.receivedAt) },
    { title: 'Type', value: (p) => LABELS.kind[p.kind] },
    { title: 'Mode', value: (p) => LABELS.mode[p.mode] },
    { title: 'Reference', value: (p) => [p.reference, p.note].filter(Boolean).join(' · ') || '—' },
    { title: 'By', value: (p) => p.createdBy },
    { title: 'Amount', num: true, value: (p) => `${p.kind === 'REFUND' ? '− ' : ''}${money(p.amount)}` },
    {
      title: '', value: (p) => (p.voided ? 'void' : h('div', { class: 'row end' },
        h('button', { class: 'quiet small', onclick: () => openPrint(`/print/receipt/${p.id}`) }, 'Receipt'),
        admin.isUnlocked ? h('button', { class: 'quiet small', onclick: () => voidDialog('payment', p.id, reload) }, 'Void') : null))
    }
  ], b.folio.payments, { rowClass: (p) => (p.voided ? 'void' : ''), empty: 'No payments yet.' }));
}

function invoicesPanel(b) {
  if (!b.invoices.length) return null;
  return panel('Invoices', { flush: true }, table([
    { title: 'Number', value: (i) => i.number },
    { title: 'Issued', value: (i) => dateTime(i.issuedAt) },
    { title: 'Status', value: (i) => tag(i.status, i.status === 'ISSUED' ? 'Issued' : 'Void') },
    { title: 'Total', num: true, value: (i) => money(i.total) }
  ], b.invoices, { onRowClick: (i) => openPrint(`/print/invoice/${i.id}`) }));
}

function guestPanel(b, reload) {
  const g = b.guest;
  return panel('Guest', { tools: h('a', { class: 'button small', href: `#/guest/${g.id}` }, 'Open profile') },
    h('dl', { class: 'pairs' },
      h('dt', {}, 'Phone'), h('dd', {}, g.phone),
      g.email ? [h('dt', {}, 'Email'), h('dd', {}, g.email)] : null,
      h('dt', {}, 'Address'), h('dd', {}, [g.address, g.city].filter(Boolean).join(', ') || '—'),
      h('dt', {}, 'Nationality'), h('dd', {}, g.nationality),
      h('dt', {}, 'Photo ID'), h('dd', {}, idNumberText(g)),
      g.company ? [h('dt', {}, 'Company'), h('dd', {}, `${g.company}${g.gstin ? ` · ${g.gstin}` : ''}`)] : null),
    h('div', { style: { marginTop: '14px' } }, idPhotoBlock(g, { canChange: !b.guestLocked || admin.isUnlocked, onChanged: reload })));
}

function declarationPanel(b, reload) {
  const d = b.declaration;
  const canEdit = ['BOOKED', 'CHECKED_IN'].includes(b.status) || admin.isUnlocked;
  return panel('Declaration', { tools: canEdit ? h('button', { class: 'small', onclick: () => declarationDialog(b, reload) }, d ? 'Edit' : 'Fill in') : null },
    d ? h('dl', { class: 'pairs' },
      h('dt', {}, 'Arriving from'), h('dd', {}, d.arrivingFrom || '—'),
      h('dt', {}, 'Going to'), h('dd', {}, d.goingTo || '—'),
      h('dt', {}, 'Purpose'), h('dd', {}, d.purpose || '—'),
      h('dt', {}, 'Vehicle'), h('dd', {}, d.vehicleNo || '—'),
      d.passportNo ? [h('dt', {}, 'Passport'), h('dd', {}, `${d.passportNo}${d.visaNo ? ` · visa ${d.visaNo}` : ''}`)] : null,
      h('dt', {}, 'With'), h('dd', {}, d.coGuests.length ? d.coGuests.map((c) => `${c.name}${c.age !== '' ? ` (${c.age})` : ''}`).join(', ') : '—'))
      : h('p', { class: 'hint' }, 'Recorded at check-in. Prints on the registration card for the guest to sign.'),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'small', onclick: () => openPrint(`/print/declaration/${b.id}`) }, 'Print for signature')));
}

function stayPanel(b) {
  const meals = Object.entries(b.mealPlan).filter(([, on]) => on).map(([k]) => k);
  return panel('Stay', {},
    h('dl', { class: 'pairs' },
      h('dt', {}, 'Checked in'), h('dd', {}, b.checkedInAt ? dateTime(b.checkedInAt) : '—'),
      h('dt', {}, 'Checked out'), h('dd', {}, b.checkedOutAt ? dateTime(b.checkedOutAt) : '—'),
      h('dt', {}, 'Rate'), h('dd', {}, b.nightlyRate !== null ? `${money(b.nightlyRate)} per night (agreed)` : 'Standard rate'),
      h('dt', {}, 'Meals'), h('dd', {}, b.mealSchedule.length ? 'Varies by day' : meals.length ? meals.join(', ') : 'None'),
      h('dt', {}, 'Booked by'), h('dd', {}, `${b.createdBy} · ${dateTime(b.createdAt)}`),
      b.notes ? [h('dt', {}, 'Notes'), h('dd', {}, b.notes)] : null));
}

// --- Dialog building blocks ---------------------------------------------

function guestIdentityFields(g, photoInput) {
  return h('div', { class: 'grid c3' },
    field('Full name', { name: 'fullName', value: g.fullName, required: true, maxlength: 120 }),
    field('Phone', { name: 'phone', value: g.phone, required: true, maxlength: 20 }),
    field('Nationality', { name: 'nationality', value: g.nationality || 'Indian', maxlength: 60 }),
    field('Address', { name: 'address', value: g.address, maxlength: 300 }, { wide: true }),
    field('City', { name: 'city', value: g.city, maxlength: 80 }),
    select('Photo ID type', [['', 'Choose…'], ...state.enums.idTypes], { name: 'idType', value: g.idType, required: true }),
    field('Photo ID number', { name: 'idNumber', value: g.idNumber, required: true, maxlength: 40 }, { hint: g.idNumber ? 'Shown masked. Retype only to correct it.' : '' }),
    photoInput.node);
}

function readGuest(form, g) {
  return {
    ...g,
    fullName: val(form, 'fullName'), phone: val(form, 'phone'), nationality: val(form, 'nationality'),
    address: val(form, 'address'), city: val(form, 'city'), idType: val(form, 'idType'), idNumber: val(form, 'idNumber')
  };
}

function coGuestRow(c = {}) {
  const row = h('div', { class: 'grid c4 co-guest', style: { gridTemplateColumns: '2fr 70px 1fr 1fr 1.3fr auto', alignItems: 'end' } },
    field('Name', { 'data-k': 'name', value: c.name || '', maxlength: 120 }),
    field('Age', { 'data-k': 'age', type: 'number', min: 0, max: 120, value: c.age ?? '' }),
    field('Relation', { 'data-k': 'relation', value: c.relation || '', maxlength: 40 }),
    select('ID type', [['', '—'], ...state.enums.idTypes], { 'data-k': 'idType', value: c.idType || '' }),
    field('ID number', { 'data-k': 'idNumber', value: c.idNumber || '', maxlength: 40 }),
    h('button', { type: 'button', class: 'quiet small', onclick: () => row.remove() }, 'Remove'));
  return row;
}

function declarationFields(d = {}, nationality = 'Indian') {
  const rows = h('div', { class: 'stack' }, (d.coGuests || []).map(coGuestRow));
  const foreignFields = h('div', { class: 'grid c4' },
    field('Passport number', { name: 'passportNo', value: d.passportNo || '', maxlength: 20 }),
    field('Visa number', { name: 'visaNo', value: d.visaNo || '', maxlength: 30 }),
    field('Visa valid till', { name: 'visaValidTill', type: 'date', value: d.visaValidTill || '' }),
    field('Arrived in India on', { name: 'arrivedInIndiaOn', type: 'date', value: d.arrivedInIndiaOn || '' }));
  const foreign = h('div', { hidden: /^indian$/i.test(nationality || 'Indian') }, h('div', { class: 'eyebrow' }, 'Foreign national (Form C)'), foreignFields);
  const node = h('div', { class: 'stack' },
    h('div', { class: 'grid c4' },
      field('Arriving from', { name: 'arrivingFrom', value: d.arrivingFrom || '', maxlength: 120 }),
      field('Going to', { name: 'goingTo', value: d.goingTo || '', maxlength: 120 }),
      select('Purpose of visit', ['', ...PURPOSES], { name: 'purpose', value: d.purpose || '' }),
      field('Vehicle number', { name: 'vehicleNo', value: d.vehicleNo || '', maxlength: 20 })),
    h('div', {}, h('div', { class: 'eyebrow' }, 'Accompanying guests'), rows,
      h('button', { type: 'button', class: 'small', style: { marginTop: '8px' }, onclick: () => rows.append(coGuestRow()) }, 'Add guest')),
    foreign,
    field('Remarks', { name: 'remarks', value: d.remarks || '', maxlength: 500 }));
  node.setForeign = (isForeign) => { foreign.hidden = !isForeign; };
  return node;
}

function readDeclaration(form) {
  const coGuests = [...form.querySelectorAll('.co-guest')].map((row) => Object.fromEntries(
    [...row.querySelectorAll('[data-k]')].map((el) => [el.dataset.k, el.value.trim()])
  )).filter((c) => c.name);
  return {
    arrivingFrom: val(form, 'arrivingFrom'), goingTo: val(form, 'goingTo'), purpose: val(form, 'purpose'), vehicleNo: val(form, 'vehicleNo'),
    passportNo: val(form, 'passportNo'), visaNo: val(form, 'visaNo'), visaValidTill: val(form, 'visaValidTill'), arrivedInIndiaOn: val(form, 'arrivedInIndiaOn'),
    remarks: val(form, 'remarks'), coGuests
  };
}

async function savePhotoFrom(photoInput, guestId) {
  const chosen = photoInput.read();
  if (chosen) await uploadIdPhoto(guestId, chosen);
}

// --- Actions -------------------------------------------------------------

async function checkInDialog(b, reload) {
  const decl = declarationFields(b.declaration || {}, b.guest.nationality);
  const photoInput = idPhotoInput(b.guest);
  const done = await formDialog({
    title: `Check in · ${b.unit.name}`,
    lede: `${b.guest.fullName} · ${date(b.checkIn)} to ${date(b.checkOut)}. Confirm identity and fill the declaration.`,
    wide: true,
    submitLabel: 'Check in',
    submitClass: 'accent',
    body: () => {
      const identity = guestIdentityFields(b.guest, photoInput);
      identity.querySelector('[name="nationality"]').addEventListener('input', (e) => decl.setForeign(!/^indian$/i.test(e.target.value.trim())));
      return h('div', { class: 'stack' },
        h('div', { class: 'eyebrow' }, 'Primary guest'), identity,
        h('div', { class: 'grid c4' },
          field('Adults', { name: 'adults', type: 'number', min: 1, value: b.adults, required: true }),
          field('Children', { name: 'children', type: 'number', min: 0, value: b.children }),
          field('Check-in time', { name: 'at', type: 'datetime-local', value: localInputValue() }, { wide: true })),
        h('details', { class: 'more' }, h('summary', {}, `Change the rate (now ${money(currentRate(b))} per ${b.unit.kind === 'HALL' ? 'day' : 'night'})`), h('div', { class: 'stack' }, priceFields(b))),
        h('div', { class: 'eyebrow' }, 'Declaration'), decl);
    },
    onSubmit: async (form) => {
      if (!b.guest.hasIdPhoto && !photoInput.hasNewPhoto()) {
        if (!window.confirm('No ID photo is on file. Check in without one?')) throw new Error('Add a photo of the guest ID, or confirm to continue without it.');
      }
      await savePhotoFrom(photoInput, b.guest.id);
      await applyPriceChanges(b, form);
      return api.post(`/api/bookings/${b.id}/check-in`, {
        guest: readGuest(form, b.guest),
        declaration: readDeclaration(form),
        adults: val(form, 'adults'), children: val(form, 'children') || 0,
        at: fromLocalInput(val(form, 'at'))
      });
    }
  });
  if (!done) return;
  toast(`${b.guest.fullName} checked in to ${b.unit.name}`);
  await reload();
  if (await confirmDialog({ title: 'Print registration card?', message: 'Print the registration and declaration for the guest to sign.', confirmLabel: 'Print' })) {
    openPrint(`/print/declaration/${b.id}`);
  }
}

async function checkOutDialog(b, reload) {
  const f = b.folio;
  const earliestCheckOut = state.today > b.checkIn ? state.today : addDays(b.checkIn, 1);
  const early = earliestCheckOut < b.checkOut;
  const done = await formDialog({
    title: `Check out · ${b.unit.name}`,
    lede: `${b.guest.fullName} · total ${money(f.total)}, received ${money(f.paid)}.`,
    submitLabel: 'Check out',
    submitClass: 'accent',
    body: h('div', { class: 'stack' },
      h('div', { class: 'balance-line', style: { padding: '8px 0' } }, h('span', {}, 'Balance due'), h('strong', { class: f.balance > 0 ? 'money-due' : 'money-ok' }, money(f.balance))),
      h('details', { class: 'more' }, h('summary', {}, 'Adjust the room rate or discount before billing'),
        h('div', { class: 'stack' }, priceFields(b), h('p', { class: 'hint' }, 'The balance is recalculated when you check out. Extras can be changed from the folio.'))),
      f.balance > 0 ? h('div', { class: 'stack' },
        chipField('Paid by', 'mode', modeOptions(state.enums), 'CASH'),
        h('div', { class: 'grid c2' },
          field('Collect now ₹', { name: 'amount', type: 'number', min: 0, step: '0.01', value: (f.balance / 100).toFixed(2) }),
          field('Reference', { name: 'reference', maxlength: 80 }))) : null,
      f.balance > 0 ? check('Let the guest leave with balance pending', { name: 'allowBalance' }) : null,
      early ? check(`Leaving early — bill until ${date(earliestCheckOut)} instead of ${date(b.checkOut)}`, { name: 'shortenStay', checked: true }) : null,
      field('Check-out time', { name: 'at', type: 'datetime-local', value: localInputValue() })),
    onSubmit: async (form) => {
      if (await applyPriceChanges(b, form)) {
        const updated = await api.get(`/api/bookings/${b.id}`);
        const collect = Number(val(form, 'amount') || 0) * 100;
        if (collect > updated.folio.balance) {
          form.elements.amount.value = (Math.max(0, updated.folio.balance) / 100).toFixed(2);
          throw new Error(`New balance after the change is ${money(updated.folio.balance)}. The amount to collect was updated — check and confirm again.`);
        }
      }
      const amount = Number(val(form, 'amount') || 0);
      if (amount > 0) await api.post(`/api/bookings/${b.id}/payments`, { amount, mode: val(form, 'mode'), reference: val(form, 'reference'), kind: 'PAYMENT' });
      return api.post(`/api/bookings/${b.id}/check-out`, {
        allowBalance: Boolean(val(form, 'allowBalance')), shortenStay: Boolean(val(form, 'shortenStay')), at: fromLocalInput(val(form, 'at'))
      });
    }
  });
  if (!done) return;
  toast(`${b.guest.fullName} checked out. ${b.unit.name} marked for cleaning.`);
  await reload();
  if (await confirmDialog({ title: 'Print tax invoice?', message: 'Issue the GST invoice for this stay now.', confirmLabel: 'Issue and print' })) {
    await issueInvoice(b, reload);
  }
}

async function issueInvoice(b, reload) {
  try {
    const { invoiceId } = await api.post(`/api/bookings/${b.id}/invoice`, {});
    openPrint(`/print/invoice/${invoiceId}`);
  } catch (err) {
    if (err.status !== 409 || !/Reissue/.test(err.message)) throw err;
    const ok = await confirmDialog({ title: 'Folio changed', message: `${err.message} The old invoice will be marked void and a new number issued.`, confirmLabel: 'Reissue' });
    if (!ok) return;
    const { invoiceId } = await api.post(`/api/bookings/${b.id}/invoice`, { reissue: true });
    openPrint(`/print/invoice/${invoiceId}`);
  }
  await reload();
}

async function editStayDialog(b, reload) {
  const units = await api.get('/api/units');
  const done = await formDialog({
    title: b.status === 'CHECKED_IN' ? 'Extend or move' : 'Change stay',
    lede: 'Nights already priced keep their rate; new nights use today\'s rates unless an agreed rate is set.',
    wide: true,
    body: h('div', { class: 'stack' },
      h('div', { class: 'grid c4' },
        field('Arrival', { name: 'checkIn', type: 'date', value: b.checkIn, required: true, disabled: b.status === 'CHECKED_IN' }),
        field('Departure', { name: 'checkOut', type: 'date', value: b.checkOut, required: true }),
        select('Room or hall', units.map((u) => [u.id, `${u.code} · ${u.name}`]), { name: 'unitId', value: b.unit.id }, { wide: true }),
        field('Adults', { name: 'adults', type: 'number', min: 1, value: b.adults }),
        field('Children', { name: 'children', type: 'number', min: 0, value: b.children }),
        field('Agreed rate per night ₹', { name: 'nightlyRate', type: 'number', min: 0, value: b.nightlyRate !== null ? b.nightlyRate / 100 : '' }, { hint: 'Blank = standard rate' }),
        select('Source', SOURCES, { name: 'source', value: b.source })),
      h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Meals every night:'),
        ['breakfast', 'lunch', 'dinner'].map((m) => check(m[0].toUpperCase() + m.slice(1), { name: `meal_${m}`, checked: Boolean(b.mealPlan[m]) }))),
      h('div', { class: 'grid c4' },
        select('Room discount', DISCOUNT_TYPES, { name: 'roomDiscountType', value: b.discounts.roomType }),
        field('Value', { name: 'roomDiscountValue', type: 'number', min: 0, step: '0.01', value: b.discounts.roomType === 'AMOUNT' ? b.discounts.roomValue / 100 : b.discounts.roomValue }),
        select('Meal discount', DISCOUNT_TYPES, { name: 'mealDiscountType', value: b.discounts.mealType }),
        field('Value', { name: 'mealDiscountValue', type: 'number', min: 0, step: '0.01', value: b.discounts.mealType === 'AMOUNT' ? b.discounts.mealValue / 100 : b.discounts.mealValue })),
      field('Notes', { name: 'notes', type: 'textarea', value: b.notes, maxlength: 1000 })),
    onSubmit: (form) => api.patch(`/api/bookings/${b.id}`, {
      checkIn: b.status === 'CHECKED_IN' ? undefined : val(form, 'checkIn'),
      checkOut: val(form, 'checkOut'),
      unitId: val(form, 'unitId'),
      adults: val(form, 'adults'), children: val(form, 'children') || 0,
      nightlyRate: val(form, 'nightlyRate'),
      source: val(form, 'source'),
      mealPlan: { breakfast: val(form, 'meal_breakfast'), lunch: val(form, 'meal_lunch'), dinner: val(form, 'meal_dinner') },
      roomDiscountType: val(form, 'roomDiscountType'), roomDiscountValue: val(form, 'roomDiscountValue') || 0,
      mealDiscountType: val(form, 'mealDiscountType'), mealDiscountValue: val(form, 'mealDiscountValue') || 0,
      notes: val(form, 'notes')
    })
  });
  if (done) {
    toast('Stay updated');
    reload();
  }
}

async function cancelDialog(b, reload) {
  const done = await formDialog({
    title: 'Cancel booking',
    lede: `${b.code} · ${b.guest.fullName}. Advance received: ${money(b.folio.paid)}.`,
    submitLabel: 'Cancel booking',
    submitClass: 'danger',
    cancelLabel: 'Keep booking',
    body: h('div', { class: 'stack' },
      field('Reason', { name: 'reason', required: true, maxlength: 200 }),
      check('Guest did not arrive (no-show)', { name: 'noShow' }),
      b.folio.paid > 0 ? h('p', { class: 'hint' }, 'Record any refund from the Payments panel afterwards (needs admin PIN).') : null),
    onSubmit: (form) => api.post(`/api/bookings/${b.id}/cancel`, { reason: val(form, 'reason'), noShow: val(form, 'noShow') })
  });
  if (done) {
    toast('Booking cancelled');
    reload();
  }
}

async function revert(b, reload) {
  const ok = await confirmDialog({ title: 'Undo last step', message: `Move this booking back from "${LABELS.status[b.status]}"? Use this only to correct a mistake.`, confirmLabel: 'Undo' });
  if (!ok) return;
  await api.post(`/api/bookings/${b.id}/revert`);
  reload();
}

function paymentDialog(b, reload) {
  const due = Math.max(0, b.folio.balance);
  return formDialog({
    title: 'Record payment',
    lede: `Balance due ${money(b.folio.balance)}`,
    body: h('div', { class: 'stack' },
      chipField('Type', 'kind', [['PAYMENT', 'Payment'], ['ADVANCE', 'Advance'], ['REFUND', 'Refund (admin)']], b.status === 'BOOKED' ? 'ADVANCE' : 'PAYMENT'),
      chipField('Paid by', 'mode', modeOptions(state.enums), 'CASH'),
      h('div', { class: 'grid c2' },
        field('Amount ₹', { name: 'amount', type: 'number', min: 0.01, step: '0.01', required: true, value: due ? (due / 100).toFixed(2) : '' }),
        field('Reference / UTR', { name: 'reference', maxlength: 80 }),
        field('Note', { name: 'note', maxlength: 200 }, { wide: true }))),
    submitLabel: 'Record',
    onSubmit: (form) => api.post(`/api/bookings/${b.id}/payments`, {
      amount: val(form, 'amount'), kind: val(form, 'kind'), mode: val(form, 'mode'), reference: val(form, 'reference'), note: val(form, 'note')
    })
  }).then(async (result) => {
    if (!result) return;
    toast('Payment recorded');
    await reload();
    const latest = result.folio.payments.filter((p) => !p.voided).at(-1);
    if (latest && await confirmDialog({ title: 'Print receipt?', message: `Receipt R-${latest.id} for ${money(latest.amount)}.`, confirmLabel: 'Print receipt' })) {
      openPrint(`/print/receipt/${latest.id}`);
    }
  });
}

function chargeDialog(b, reload) {
  return pickLine({
    title: 'Add to bill',
    lede: 'Pick laundry, extra bed, transport and other extras, or type a custom item. Restaurant bills are added from Restaurant & bills.',
    withDate: state.today,
    onSubmit: (line) => api.post(`/api/bookings/${b.id}/charges`, {
      catalogItemId: line.catalogItemId, description: line.name, category: line.category, qty: line.qty, unitPrice: line.unitPrice, date: line.date
    })
  }).then((r) => r && reload());
}

function voidDialog(kind, id, reload) {
  return formDialog({
    title: `Void ${kind}`,
    body: field('Reason', { name: 'reason', required: true, maxlength: 200 }),
    submitLabel: 'Void',
    submitClass: 'danger',
    onSubmit: (form) => api.post(`/api/${kind === 'charge' ? 'charges' : 'payments'}/${id}/void`, { reason: val(form, 'reason') })
  }).then((r) => r && reload());
}

function declarationDialog(b, reload) {
  const decl = declarationFields(b.declaration || {}, b.guest.nationality);
  return formDialog({
    title: 'Guest declaration',
    wide: true,
    body: decl,
    onSubmit: (form) => api.put(`/api/bookings/${b.id}/declaration`, readDeclaration(form))
  }).then((r) => r && reload());
}
