// Prices & catalogue: every price in the app is set here. Changes need the admin PIN and
// apply to new bookings and bills; existing bookings keep the rates they were made at.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { state, loadBootstrap } from '../state.js';
import { pageHead, panel, table, field, select, check, chipField, formDialog, toast, showError, val, loading } from '../ui.js';
import { money, date, addDays } from '../format.js';

const TABS = [['rooms', 'Rooms & halls'], ['special', 'Special rates'], ['meals', 'Meal plans'], ['food', 'Food menu'], ['services', 'Services'], ['tables', 'Tables']];

export async function render(page, params) {
  const tab = params.tab || 'rooms';
  const host = h('div');
  append(clear(page),
    pageHead('Prices & catalogue', { eyebrow: 'Back office', lede: 'Every price in one place. Staff can still adjust a price for a single guest at check-in, check-out or on a bill.' }),
    h('div', { class: 'segmented', style: { marginBottom: '18px' } },
      TABS.map(([key, label]) => h('button', { type: 'button', 'aria-pressed': String(key === tab), onclick: () => { location.hash = `#/menu?tab=${key}`; } }, label))),
    host);
  loading(host);
  const draw = { rooms: roomsTab, special: specialTab, meals: mealsTab, food: (x) => catalogTab(x, 'FOOD'), services: (x) => catalogTab(x, 'SERVICE'), tables: tablesTab }[tab] || roomsTab;
  await draw(host, () => render(page, params));
}

// --- Rooms and halls ---------------------------------------------------------

async function roomsTab(host, reload) {
  const units = await api.get('/api/units?all=1');
  append(clear(host), panel('Rooms and halls', {
    count: units.length,
    flush: true,
    tools: h('button', { class: 'small primary', onclick: () => editUnit(null).then((ok) => ok && reload()) }, 'Add room or hall')
  }, table([
    { title: 'Code', value: (u) => h('strong', {}, u.code) },
    { title: 'Name', value: (u) => u.name },
    { title: 'Type', value: (u) => `${u.kind === 'HALL' ? 'Hall' : 'Room'}${u.room_type ? ` · ${u.room_type}` : ''}` },
    { title: 'Floor', value: (u) => u.floor || '—' },
    { title: 'Max guests', num: true, value: (u) => u.max_guests },
    { title: 'Rate', num: true, value: (u) => h('strong', {}, `${money(u.base_rate)} / ${u.kind === 'HALL' ? 'day' : 'night'}`) },
    { title: 'In service', value: (u) => (u.active ? 'Yes' : 'No') }
  ], units, { onRowClick: (u) => editUnit(u).then((ok) => ok && reload()), rowClass: (u) => (u.active ? '' : 'void') })));
}

function editUnit(u) {
  return formDialog({
    title: u ? `Edit ${u.name}` : 'Add room or hall',
    lede: 'Rate changes apply to new bookings only.',
    body: h('div', { class: 'grid c2' },
      field('Code', { name: 'code', value: u?.code || '', required: true, maxlength: 12 }),
      field('Name', { name: 'name', value: u?.name || '', required: true, maxlength: 60 }),
      h('div', { class: 'span-2' }, chipField('Kind', 'kind', [['ROOM', 'Room'], ['HALL', 'Hall']], u?.kind || 'ROOM')),
      field('Type', { name: 'roomType', value: u?.room_type || '', placeholder: 'e.g. Deluxe, Standard', maxlength: 40 }),
      field('Floor', { name: 'floor', value: u?.floor || '', maxlength: 20 }),
      field('Rate per night ₹', { name: 'baseRate', type: 'number', min: 0, value: u ? u.base_rate / 100 : '', required: true }),
      field('Max guests', { name: 'maxGuests', type: 'number', min: 1, value: u?.max_guests ?? 2 }),
      field('Sort order', { name: 'sort', type: 'number', min: 0, value: u?.sort ?? 0 }),
      u ? check('In service', { name: 'active', checked: Boolean(u.active) }) : null),
    onSubmit: async (form) => {
      const body = Object.fromEntries(['code', 'name', 'kind', 'roomType', 'floor', 'maxGuests', 'baseRate', 'sort'].map((k) => [k, val(form, k)]));
      if (u) body.active = val(form, 'active');
      await (u ? api.put(`/api/units/${u.id}`, body) : api.post('/api/units', body));
      toast('Saved');
      return true;
    }
  });
}

// --- Special rates -----------------------------------------------------------

async function specialTab(host) {
  const units = (await api.get('/api/units')).filter((u) => u.active);
  const from = state.today;
  const to = addDays(state.today, 90);
  const list = h('div');
  const load = async () => {
    const rows = await api.get(`/api/rates?from=${from}&to=${to}`);
    append(clear(list), table([
      { title: 'Date', value: (r) => date(r.date) },
      { title: 'Room / hall', value: (r) => r.unit_code },
      { title: 'Rate', num: true, value: (r) => money(r.rate) }
    ], rows, { empty: 'No special rates in the next 90 days.' }));
  };
  const form = h('form', { class: 'grid c4', novalidate: true },
    select('Room or hall', units.map((u) => [u.id, `${u.code} · ${u.name} (${money(u.base_rate)})`]), { name: 'unitId' }, { wide: true }),
    field('From', { name: 'from', type: 'date', value: from, required: true }),
    field('To', { name: 'to', type: 'date', value: from, required: true }),
    field('Rate ₹', { name: 'rate', type: 'number', min: 0 }, { hint: 'Leave blank to remove special rates for these dates.' }),
    h('div', { style: { alignSelf: 'end' } }, h('button', { type: 'submit', class: 'primary' }, 'Apply')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const rate = val(form, 'rate');
      await api.post('/api/rates', { unitId: val(form, 'unitId'), from: val(form, 'from'), to: val(form, 'to'), rate: rate || undefined, clear: !rate });
      toast('Special rates updated');
      load();
    } catch (err) {
      showError(err);
    }
  });
  append(clear(host),
    panel('Set a rate for festivals, weekends or events', {}, form),
    panel('Upcoming special rates', { flush: true }, list));
  await load();
}

// --- Meal plans --------------------------------------------------------------

async function mealsTab(host) {
  const meals = state.boot.meals;
  const form = h('form', { class: 'grid c4', novalidate: true },
    field('Breakfast ₹', { name: 'breakfast', type: 'number', min: 0, value: meals.breakfast / 100, required: true }),
    field('Lunch ₹', { name: 'lunch', type: 'number', min: 0, value: meals.lunch / 100, required: true }),
    field('Dinner ₹', { name: 'dinner', type: 'number', min: 0, value: meals.dinner / 100, required: true }),
    h('div', { style: { alignSelf: 'end' } }, h('button', { type: 'submit', class: 'primary' }, 'Save meal rates')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/settings/meals', { breakfast: val(form, 'breakfast'), lunch: val(form, 'lunch'), dinner: val(form, 'dinner') });
      await loadBootstrap();
      toast('Meal rates saved');
    } catch (err) {
      showError(err);
    }
  });
  append(clear(host), panel('Meal plan rates (per guest per meal, added to stays)', {}, form,
    h('p', { class: 'hint', style: { marginTop: '12px' } }, 'Restaurant dishes are priced separately in the Food menu.')));
}

// --- Food menu and services ----------------------------------------------------

async function catalogTab(host, type) {
  const items = await api.get(`/api/menu?all=1&type=${type}`);
  const reload = () => catalogTab(host, type);
  const noun = type === 'FOOD' ? 'dish' : 'service';
  append(clear(host), panel(type === 'FOOD' ? 'Food menu' : 'Services (laundry, extras, transport…)', {
    count: items.length,
    flush: true,
    tools: h('button', { class: 'small primary', onclick: () => editItem(null, type).then((ok) => ok && reload()) }, `Add ${noun}`)
  }, table([
    { title: type === 'FOOD' ? 'Dish' : 'Service', value: (m) => h('span', {}, h('span', { class: `veg-mark${type === 'SERVICE' ? ' svc' : m.isVeg ? '' : ' non'}` }), m.name) },
    { title: 'Group', value: (m) => m.category },
    { title: 'Price', num: true, value: (m) => h('strong', {}, money(m.price)) },
    { title: 'Available', value: (m) => (m.active ? 'Yes' : 'Hidden') }
  ], items, { onRowClick: (m) => editItem(m, type).then((ok) => ok && reload()), rowClass: (m) => (m.active ? '' : 'void'), empty: `No ${noun}s yet.` })));
}

function editItem(m, type) {
  const isFood = type === 'FOOD';
  return formDialog({
    title: m ? `Edit ${m.name}` : isFood ? 'Add dish' : 'Add service',
    body: h('div', { class: 'grid c2' },
      field('Name', { name: 'name', value: m?.name || '', required: true, maxlength: 80 }),
      field('Group', { name: 'category', value: m?.category || '', placeholder: isFood ? 'e.g. Starters, Mains' : 'e.g. Laundry, Travel', maxlength: 40 }),
      field('Price ₹', { name: 'price', type: 'number', min: 0, step: '0.01', value: m ? m.price / 100 : '', required: true }),
      field('Sort order', { name: 'sort', type: 'number', min: 0, value: m?.sort ?? 0 }),
      isFood ? check('Vegetarian', { name: 'isVeg', checked: m ? m.isVeg : true }) : null,
      check('Available', { name: 'active', checked: m ? m.active : true })),
    onSubmit: async (form) => {
      const body = { name: val(form, 'name'), category: val(form, 'category'), price: val(form, 'price'), sort: val(form, 'sort'), isVeg: isFood ? val(form, 'isVeg') : false, active: val(form, 'active'), type };
      await (m ? api.put(`/api/menu/${m.id}`, body) : api.post('/api/menu', body));
      toast('Saved');
      return true;
    }
  });
}

// --- Tables ------------------------------------------------------------------

async function tablesTab(host, reload) {
  const tables = await api.get('/api/tables');
  append(clear(host), panel('Restaurant tables', {
    count: tables.length,
    flush: true,
    tools: h('button', { class: 'small primary', onclick: () => editTable(null).then((ok) => ok && reload()) }, 'Add table')
  }, table([
    { title: 'Table', value: (t) => h('strong', {}, t.name) },
    { title: 'Seats', num: true, value: (t) => t.seats }
  ], tables, { onRowClick: (t) => editTable(t).then((ok) => ok && reload()) })));
}

function editTable(t) {
  return formDialog({
    title: t ? `Edit ${t.name}` : 'Add table',
    body: h('div', { class: 'grid c2' },
      field('Name', { name: 'name', value: t?.name || '', required: true, maxlength: 20 }),
      field('Seats', { name: 'seats', type: 'number', min: 1, value: t?.seats ?? 4 }),
      t ? check('In use', { name: 'active', checked: true }) : null),
    onSubmit: async (form) => {
      const body = { name: val(form, 'name'), seats: val(form, 'seats'), active: t ? val(form, 'active') : true };
      await (t ? api.put(`/api/tables/${t.id}`, body) : api.post('/api/tables', body));
      return true;
    }
  });
}
