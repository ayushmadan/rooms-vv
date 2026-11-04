import { h, clear, append } from './dom.js';
import { api, admin, staff } from './api.js';
import { state, loadBootstrap } from './state.js';
import { formDialog, field, toast, showError, val } from './ui.js';
import { longDate } from './format.js';
import { mountSyncStatus } from './sync-status.js';

// Each view module exports render(container, params) and may return a cleanup function.
const ROUTES = [
  { path: 'today', label: 'Today', group: 'Front desk', load: () => import('./views/today.js') },
  { path: 'reservations', label: 'Calendar', group: 'Front desk', load: () => import('./views/reservations.js') },
  { path: 'guests', label: 'Guests', group: 'Front desk', load: () => import('./views/guests.js') },
  { path: 'restaurant', label: 'Restaurant & bills', group: 'Sales', load: () => import('./views/restaurant.js') },
  { path: 'housekeeping', label: 'Housekeeping', group: 'Operations', load: () => import('./views/housekeeping.js') },
  { path: 'expenses', label: 'Expenses', group: 'Operations', load: () => import('./views/expenses.js') },
  { path: 'reports', label: 'Reports', group: 'Back office', load: () => import('./views/reports.js') },
  { path: 'menu', label: 'Prices & catalogue', group: 'Back office', load: () => import('./views/menu.js') },
  { path: 'documents', label: 'Documents & printing', group: 'Back office', load: () => import('./views/documents.js') },
  { path: 'devices', label: 'Network & licences', group: 'Back office', load: () => import('./views/devices.js') },
  { path: 'settings', label: 'Settings', group: 'Back office', load: () => import('./views/settings.js') },
  { path: 'data', label: 'Backup & transfer', group: 'Back office', load: () => import('./views/data.js') },
  // Not in the navigation:
  { path: 'new-booking', label: 'New booking', load: () => import('./views/booking-new.js') },
  { path: 'booking', label: 'Booking', load: () => import('./views/booking.js') },
  { path: 'guest', label: 'Guest', load: () => import('./views/guest.js') }
];

// Detail pages highlight their list page in the navigation.
const NAV_PARENT = { booking: 'reservations', guest: 'guests', 'new-booking': 'reservations' };

const app = document.getElementById('app');
let outlet;
let navLinks = [];
let cleanup = null;
let renderToken = 0;

function parseHash() {
  const [path, queryString] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, id] = path.split('/');
  return { name: name || 'today', id, params: Object.fromEntries(new URLSearchParams(queryString || '')) };
}

export function go(path) {
  location.hash = `#/${path}`;
}

async function route() {
  const { name, id, params } = parseHash();
  const match = ROUTES.find((r) => r.path === name) || ROUTES[0];
  const token = ++renderToken;
  const activePath = NAV_PARENT[match.path] || match.path;
  for (const a of navLinks) {
    if (a.dataset.path === activePath) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  const page = h('div', { class: 'page' });
  append(clear(outlet), page);
  try {
    const view = await match.load();
    if (token !== renderToken) return;
    cleanup = await view.render(page, { id, ...params });
    document.title = `${match.label || 'Rooms'} · ${state.property.name}`;
  } catch (err) {
    if (token !== renderToken) return;
    append(clear(page), h('div', { class: 'notice danger' }, err.message || String(err)));
  }
  window.scrollTo(0, 0);
}

export function refresh() {
  route();
}

// --- Admin PIN -----------------------------------------------------------

function askForPin() {
  return formDialog({
    title: 'Admin PIN',
    lede: 'This action needs the owner or manager. The unlock lasts 15 minutes of activity.',
    body: field('PIN', { name: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', required: true, pattern: '\\d{4,8}' }),
    submitLabel: 'Unlock',
    onSubmit: async (form) => {
      const { token } = await api.post('/api/auth/unlock', { pin: val(form, 'pin') });
      admin.setToken(token);
      return true;
    }
  }).then(Boolean);
}

async function lockAdmin() {
  await api.post('/api/auth/lock').catch(() => {});
  admin.setToken('');
  toast('Admin locked');
  refresh();
}

function askStaffName() {
  return formDialog({
    title: 'Who is on duty?',
    lede: 'Your name is written against bookings, payments and changes you make on this computer.',
    body: field('Your name', { name: 'name', value: staff.get(), required: true, maxlength: 40 }),
    submitLabel: 'Continue',
    onSubmit: (form) => {
      staff.set(val(form, 'name'));
      return true;
    }
  });
}

// --- Updates (desktop only) ----------------------------------------------

async function checkForUpdates(button) {
  const result = await window.desktop.checkForUpdate();
  if (!result.ok) return showError(new Error(result.message));
  if (!result.updateAvailable) return toast(`You are on the latest version (${result.current}).`);
  if (!result.ready) return toast(`Version ${result.latest} is being prepared. Check again in a few minutes.`);
  const bar = h('div');
  const progress = h('div', { class: 'progress', hidden: true }, bar);
  const stop = window.desktop.onUpdateProgress((percent) => { progress.hidden = false; bar.style.width = `${percent}%`; });
  await formDialog({
    title: `Update to version ${result.latest}`,
    lede: `This computer has ${result.current}. A backup is taken first, then the app closes, updates and reopens on its own.`,
    body: h('div', { class: 'stack' }, result.notes ? h('div', { class: 'notice', style: { whiteSpace: 'pre-line' } }, result.notes) : null, progress),
    submitLabel: 'Install update',
    submitClass: 'accent',
    onSubmit: async () => {
      if (!admin.isUnlocked && !(await askForPin())) throw new Error('Admin PIN is needed to install updates');
      const outcome = await window.desktop.installUpdate(admin.token);
      if (!outcome.ok) throw new Error(outcome.message);
      return true;
    }
  });
  stop();
  if (button) {
    delete button.dataset.available;
    button.classList.remove('accent');
    button.textContent = 'Check for updates';
  }
}

const UPDATE_CHECK_FIRST_MS = 15_000;
const UPDATE_CHECK_EVERY_MS = 15 * 60 * 1000;

/** Checks GitHub for a newer version shortly after start and every 15 minutes after that. */
function backgroundUpdateCheck(button) {
  if (!window.desktop?.checkForUpdate) return;
  const check = async () => {
    const result = await window.desktop.checkForUpdate().catch(() => null);
    if (result?.ok && result.updateAvailable && result.ready && !button.dataset.available) {
      button.dataset.available = result.latest;
      button.classList.add('accent');
      button.textContent = `Update to ${result.latest}`;
    }
  };
  setTimeout(check, UPDATE_CHECK_FIRST_MS);
  setInterval(check, UPDATE_CHECK_EVERY_MS);
}

// --- Shell ---------------------------------------------------------------

async function quickFind(term) {
  const text = term.trim();
  if (!text) return;
  const byCode = await api.get(`/api/bookings/by-code/${encodeURIComponent(text)}`).catch(() => null);
  if (byCode) return go(`booking/${byCode.id}`);
  go(`guests?q=${encodeURIComponent(text)}`);
}

function buildShell() {
  const groups = [...new Set(ROUTES.filter((r) => r.group).map((r) => r.group))];
  navLinks = [];
  const nav = h('nav', { 'aria-label': 'Main' }, groups.map((group) => [
    h('div', { class: 'group' }, group),
    ROUTES.filter((r) => r.group === group).map((r) => {
      const a = h('a', { href: `#/${r.path}`, dataset: { path: r.path } }, r.label);
      navLinks.push(a);
      return a;
    })
  ]));

  const adminFlag = h('span', { class: 'admin-flag', hidden: !admin.isUnlocked }, 'Admin');
  const lockButton = h('button', { class: 'quiet small', onclick: () => (admin.isUnlocked ? lockAdmin() : askForPin().then((ok) => ok && refresh())) }, admin.isUnlocked ? 'Lock admin' : 'Unlock admin');
  admin.onChange((unlocked) => {
    adminFlag.hidden = !unlocked;
    lockButton.textContent = unlocked ? 'Lock admin' : 'Unlock admin';
  });

  const staffName = h('strong', {}, staff.get() || '—');
  const updateButton = h('button', { class: 'small', hidden: !window.desktop?.checkForUpdate, onclick: () => checkForUpdates(updateButton).catch(showError) }, 'Check for updates');
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Booking code, guest name or phone', 'aria-label': 'Find booking or guest' });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') quickFind(search.value).catch(showError);
  });

  outlet = h('div', { id: 'outlet' });
  const shell = h('div', { class: 'shell' },
    h('aside', { class: 'rail' },
      h('a', { class: 'brand', href: '#/today' },
        h('img', { src: 'assets/logo.png', alt: '' }),
        h('div', {}, h('div', { class: 'name' }, state.property.name), h('div', { class: 'sub' }, 'Front desk'))),
      nav,
      h('div', { class: 'foot' },
        lockButton,
        h('div', { style: { padding: '4px 0 0' } }, `Version ${state.boot.version}`))),
    h('main', { class: 'main' },
      h('div', { class: 'topbar' },
        h('span', { class: 'date' }, longDate(state.today)),
        adminFlag,
        mountSyncStatus(),
        h('span', { class: 'spacer' }),
        updateButton,
        search,
        h('span', { class: 'staff' }, 'On duty ', staffName,
          h('button', { class: 'quiet small', onclick: () => askStaffName().then(() => { staffName.textContent = staff.get(); }) }, 'Change')),
        h('a', { class: 'button primary', href: '#/new-booking' }, 'New booking')),
      outlet));
  append(clear(app), shell);
  backgroundUpdateCheck(updateButton);

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]');
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '/') {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'n') go('new-booking');
    else if (e.key === 't') go('today');
  });
}

async function start() {
  admin.setPrompt(askForPin);
  try {
    await loadBootstrap();
  } catch (err) {
    append(clear(app), h('div', { class: 'loading' }, err.message));
    return;
  }
  if (state.boot.license.required && !state.boot.license.valid) {
    const activation = await import('./views/activate.js');
    return activation.render(app, { onDone: () => location.reload() });
  }
  if (!state.boot.setupCompleted) {
    const setup = await import('./views/setup.js');
    return setup.render(app, { onDone: () => location.reload() });
  }
  buildShell();
  if (!staff.get()) await askStaffName();
  document.querySelector('.staff strong').textContent = staff.get();
  window.addEventListener('hashchange', route);
  route();
}

start();
