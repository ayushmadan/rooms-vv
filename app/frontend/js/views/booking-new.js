// New booking: dates → rooms → guest → meals and price → advance. Live quote on the right.
import { h, clear, append } from '../dom.js';
import { api, query } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, field, select, check, modeOptions, chipField, toast, showError, val } from '../ui.js';
import { addDays, daysBetween, money, shortDate, plural } from '../format.js';

export const SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Booking.com', 'MakeMyTrip', 'Goibibo', 'Agoda', 'Airbnb', 'Travel agent', 'Corporate', 'Other'];
const QUICK_SOURCES = ['Walk-in', 'Phone', 'WhatsApp', 'Booking.com', 'MakeMyTrip', 'Agoda', 'Airbnb', 'Travel agent', 'Other'];
const MEALS = [['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner']];
const DISCOUNT_TYPES = [['NONE', 'No discount'], ['PERCENT', 'Percent'], ['AMOUNT', 'Amount ₹']];

export async function render(page, params) {
  const checkIn = params.checkIn || state.today;
  const form = h('form', { class: 'stack', novalidate: true, autocomplete: 'off' });
  const quoteHost = h('div', { class: 'body' });
  const unitHost = h('div');
  const guestHost = h('div');
  const mealGridHost = h('div');
  const nightsLabel = h('span', { class: 'hint' });
  let selectedGuest = null;
  const preselected = new Set(params.unit ? [Number(params.unit)] : []);

  // --- Stay
  const stay = panel('Stay', {},
    h('div', { class: 'grid c4' },
      field('Arrival', { name: 'checkIn', type: 'date', value: checkIn, required: true }),
      field('Departure', { name: 'checkOut', type: 'date', value: addDays(checkIn, 1), required: true }),
      field('Adults', { name: 'adults', type: 'number', min: 1, max: 500, value: 2, required: true }),
      field('Children', { name: 'children', type: 'number', min: 0, max: 500, value: 0 })),
    h('div', { class: 'row', style: { marginTop: '14px', justifyContent: 'space-between', alignItems: 'flex-end' } },
      chipField('Booked via', 'source', QUICK_SOURCES.map((x) => [x, x]), 'Walk-in'),
      nightsLabel));

  // --- Meals, agreed rate and discounts: optional, folded away until needed
  const optionsPanel = panel('Meals, rate & discount', {},
    h('div', { class: 'stack' },
      h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Meals every night:'), MEALS.map(([k, label]) => check(label, { name: `plan_${k}` }))),
      h('details', { class: 'more' }, h('summary', {}, 'Different meals on different days'),
        h('div', { class: 'stack' }, check('Choose meals day by day', { name: 'vary' }), mealGridHost)),
      h('details', { class: 'more' }, h('summary', {}, 'Agreed rate or discount'),
        h('div', { class: 'stack' }, h('div', { class: 'grid c3' },
          field('Rate per night ₹', { name: 'nightlyRate', type: 'number', min: 0, step: '1', placeholder: 'Standard rate' }, { hint: 'Leave blank for the room rate.' }),
          select('Room discount', DISCOUNT_TYPES, { name: 'roomDiscountType' }),
          field('Room discount value', { name: 'roomDiscountValue', type: 'number', min: 0, step: '0.01' }),
          h('div'),
          select('Meal discount', DISCOUNT_TYPES, { name: 'mealDiscountType' }),
          field('Meal discount value', { name: 'mealDiscountValue', type: 'number', min: 0, step: '0.01' }))))));

  const advancePanel = panel('Advance and notes', {},
    h('div', { class: 'stack' },
      chipField('Advance paid by', 'advanceMode', modeOptions(state.enums), 'UPI'),
      h('div', { class: 'grid c3' },
        field('Advance received ₹', { name: 'advanceAmount', type: 'number', min: 0, step: '1' }),
        field('Reference / UTR', { name: 'advanceReference', maxlength: 80 }),
        h('div'),
        field('Notes', { name: 'notes', type: 'textarea', maxlength: 1000 }, { wide: true }))));

  const submit = h('button', { type: 'submit', class: 'primary' }, 'Create booking');
  form.append(stay, panel('Rooms and halls', { tools: [h('span', { class: 'hint' }, 'Select one or more')] }, unitHost),
    panel('Guest', {}, guestHost), optionsPanel, advancePanel);

  append(clear(page), 
    pageHead('New booking', { eyebrow: 'Front desk', lede: `Check-in from ${state.boot.policy.checkInTime}, check-out by ${state.boot.policy.checkOutTime}.` }),
    h('div', { class: 'columns main-side' }, form,
      h('aside', { class: 'quote' }, h('section', { class: 'panel' }, h('header', {}, h('h2', {}, 'Quote')), quoteHost, h('div', { class: 'd-foot', style: { borderTop: '1px solid var(--rule)', padding: '12px 16px' } }, submit)))));

  const dates = () => ({ checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value });
  const datesValid = () => {
    const { checkIn: a, checkOut: b } = dates();
    return a && b && b > a;
  };
  const selectedUnitIds = () => [...form.querySelectorAll('input[name="unit"]:checked')].map((i) => Number(i.value));

  async function loadUnits() {
    if (!datesValid()) {
      nightsLabel.textContent = 'Departure must be after arrival.';
      clear(unitHost);
      return;
    }
    const { checkIn: a, checkOut: b } = dates();
    nightsLabel.textContent = plural(daysBetween(a, b), 'night');
    const keep = new Set([...selectedUnitIds(), ...preselected]);
    preselected.clear();
    const units = await api.get(`/api/availability?${query({ from: a, to: b })}`);
    append(clear(unitHost), h('div', { class: 'unit-picker' }, units.map((u) => h('label', { class: u.available ? '' : 'taken' },
      h('input', { type: 'checkbox', name: 'unit', value: u.id, disabled: !u.available, checked: u.available && keep.has(u.id) }),
      h('span', { class: 'code' }, u.code),
      h('span', { class: 'meta' }, u.available ? `${u.kind === 'HALL' ? u.name : u.roomType} · ${money(u.baseRate)}` : `Booked: ${u.clashes[0].guest}`)))));
    drawMealGrid();
    updateQuote();
  }

  function drawMealGrid() {
    clear(mealGridHost);
    if (!form.elements.vary?.checked || !datesValid()) return;
    const { checkIn: a, checkOut: b } = dates();
    const nights = Array.from({ length: daysBetween(a, b) }, (_, i) => addDays(a, i));
    const plan = Object.fromEntries(MEALS.map(([k]) => [k, form.elements[`plan_${k}`].checked]));
    mealGridHost.append(h('table', { class: 'meal-grid', style: { marginTop: '10px' } },
      h('thead', {}, h('tr', {}, h('th', {}, 'Night of'), MEALS.map(([, l]) => h('th', {}, l)))),
      h('tbody', {}, nights.map((d) => h('tr', {}, h('td', {}, shortDate(d)),
        MEALS.map(([k]) => h('td', {}, h('input', { type: 'checkbox', 'aria-label': `${k} ${d}`, dataset: { date: d, meal: k }, checked: plan[k] }))))))));
  }

  function stayTerms() {
    const mealPlan = Object.fromEntries(MEALS.map(([k]) => [k, form.elements[`plan_${k}`].checked]));
    const schedule = new Map();
    for (const box of mealGridHost.querySelectorAll('input[data-date]')) {
      const day = schedule.get(box.dataset.date) || { date: box.dataset.date };
      day[box.dataset.meal] = box.checked;
      schedule.set(box.dataset.date, day);
    }
    return {
      ...dates(),
      mealPlan,
      mealSchedule: [...schedule.values()],
      nightlyRate: val(form, 'nightlyRate') || undefined,
      roomDiscountType: val(form, 'roomDiscountType'),
      roomDiscountValue: val(form, 'roomDiscountValue') || 0,
      mealDiscountType: val(form, 'mealDiscountType'),
      mealDiscountValue: val(form, 'mealDiscountValue') || 0
    };
  }

  let quoteSeq = 0;
  async function updateQuote() {
    const seq = ++quoteSeq;
    const unitIds = selectedUnitIds();
    if (!unitIds.length || !datesValid()) {
      append(clear(quoteHost), h('p', { class: 'hint' }, 'Choose dates and at least one room to see the price.'));
      return;
    }
    try {
      const terms = stayTerms();
      const quotes = await Promise.all(unitIds.map((unitId) => api.post('/api/bookings/quote', { ...terms, unitId })));
      if (seq !== quoteSeq) return;
      const sum = (key) => quotes.reduce((s, q) => s + q[key], 0);
      const units = [...form.querySelectorAll('input[name="unit"]:checked')].map((i) => i.closest('label').querySelector('.code').textContent);
      append(clear(quoteHost), 
        h('dl', {},
          quotes.map((q, i) => [h('dt', {}, `${units[i]} · ${plural(q.nightCount, 'night')}`), h('dd', {}, money(q.roomGross))]),
          sum('mealGross') ? [h('dt', {}, 'Meals'), h('dd', {}, money(sum('mealGross')))] : null,
          sum('roomDiscount') + sum('mealDiscount') ? [h('dt', {}, 'Discount'), h('dd', {}, `− ${money(sum('roomDiscount') + sum('mealDiscount'))}`)] : null,
          [h('dt', {}, state.boot.taxes.pricesIncludeTax ? 'GST included' : 'GST'), h('dd', {}, money(sum('tax')))]),
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('strong', {}, money(sum('grandTotal')))),
        Number(val(form, 'advanceAmount')) > 0 ? h('p', { class: 'hint', style: { marginTop: '6px' } }, `Balance after advance: ${money(sum('grandTotal') - Math.round(Number(val(form, 'advanceAmount')) * 100))}`) : null);
    } catch (err) {
      if (seq === quoteSeq) append(clear(quoteHost), h('p', { class: 'warn' }, err.message));
    }
  }

  // --- Guest chooser
  function drawGuestSearch() {
    selectedGuest = null;
    const results = h('div');
    const search = h('input', { type: 'search', placeholder: 'Search by phone or name', 'aria-label': 'Find returning guest' });
    let timer;
    search.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const term = search.value.trim();
        clear(results);
        if (term.length < 3) return;
        const found = await api.get(`/api/guests?${query({ q: term })}`).catch(() => []);
        if (!found.length) return;
        results.append(h('div', { class: 'guest-results' }, found.slice(0, 8).map((g) => h('button', { type: 'button', onclick: () => chooseGuest(g) },
          h('span', {}, h('strong', {}, g.fullName), ` · ${g.phone}`), h('span', { class: 'hint' }, g.stayCount ? plural(g.stayCount, 'stay') : 'New')))));
      }, 220);
    });
    append(clear(guestHost), 
      h('label', { class: 'field' }, h('span', {}, 'Returning guest?'), search), results,
      h('div', { class: 'eyebrow', style: { marginTop: '16px' } }, 'Or a new guest'),
      h('div', { class: 'grid c3' },
        field('Full name', { name: 'g_fullName', required: true, maxlength: 120 }),
        field('Phone', { name: 'g_phone', type: 'tel', required: true, maxlength: 20 }),
        field('Email', { name: 'g_email', type: 'email', maxlength: 120 }),
        field('City', { name: 'g_city', maxlength: 80 }),
        field('Nationality', { name: 'g_nationality', value: 'Indian', maxlength: 60 }),
        field('Company (for GST bill)', { name: 'g_company', maxlength: 120 }),
        select('Photo ID type', [['', '— later, at check-in —'], ...state.enums.idTypes], { name: 'g_idType' }),
        field('Photo ID number', { name: 'g_idNumber', maxlength: 40 }),
        field('Company GSTIN', { name: 'g_gstin', maxlength: 15 })));
  }

  function chooseGuest(g) {
    selectedGuest = g;
    append(clear(guestHost), h('div', { class: 'chosen' },
      h('div', {}, h('strong', {}, g.fullName), h('div', { class: 'hint' }, [g.phone, g.city, g.idType && `${g.idType} ${g.idNumber}`].filter(Boolean).join(' · '))),
      h('button', { type: 'button', class: 'quiet', onclick: drawGuestSearch }, 'Change')));
  }

  function guestPayload() {
    if (selectedGuest) return { guestId: selectedGuest.id };
    const g = (k) => val(form, `g_${k}`);
    return { guest: { fullName: g('fullName'), phone: g('phone'), email: g('email'), city: g('city'), nationality: g('nationality'), company: g('company'), idType: g('idType'), idNumber: g('idNumber'), gstin: g('gstin') } };
  }

  form.addEventListener('change', (e) => {
    const name = e.target.name;
    if (name === 'checkIn' || name === 'checkOut') {
      if (name === 'checkIn' && form.elements.checkOut.value <= form.elements.checkIn.value) form.elements.checkOut.value = addDays(form.elements.checkIn.value, 1);
      loadUnits().catch(showError);
    } else if (name === 'vary' || name.startsWith('plan_')) {
      drawMealGrid();
      updateQuote();
    } else if (name !== 'notes' && !name.startsWith('g_')) updateQuote();
  });
  form.addEventListener('input', (e) => {
    if (['nightlyRate', 'roomDiscountValue', 'mealDiscountValue', 'advanceAmount'].includes(e.target.name)) updateQuote();
  });

  submit.addEventListener('click', async (e) => {
    e.preventDefault();
    const unitIds = selectedUnitIds();
    if (!unitIds.length) return showError(new Error('Select at least one room or hall'));
    const guestFields = selectedGuest ? [] : [form.elements.g_fullName, form.elements.g_phone];
    const invalid = [form.elements.checkIn, form.elements.checkOut, form.elements.adults, ...guestFields].find((el) => !el.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    submit.disabled = true;
    try {
      const amount = Number(val(form, 'advanceAmount') || 0);
      const result = await api.post('/api/bookings', {
        ...stayTerms(),
        ...guestPayload(),
        unitIds,
        adults: val(form, 'adults'),
        children: val(form, 'children') || 0,
        source: val(form, 'source'),
        notes: val(form, 'notes'),
        advance: amount > 0 ? { amount, mode: val(form, 'advanceMode'), reference: val(form, 'advanceReference') } : undefined
      });
      toast(`Booked ${result.bookings.map((b) => b.code).join(', ')}`);
      location.hash = `#/booking/${result.bookings[0].id}`;
    } catch (err) {
      showError(err);
    } finally {
      submit.disabled = false;
    }
  });

  drawGuestSearch();
  if (params.guest) api.get(`/api/guests/${Number(params.guest)}`).then(chooseGuest).catch(showError);
  await loadUnits();
}
