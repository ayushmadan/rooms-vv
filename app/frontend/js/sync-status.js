// Sync indicator: a loader bar across the very top while a sync runs, and a status chip in
// the top bar. Polls the local server (cheap; nothing leaves this computer).
import { h } from './dom.js';
import { api } from './api.js';
import { toast, showError } from './ui.js';

const POLL_IDLE_MS = 8000;
const POLL_BUSY_MS = 1000;
const DONE_FLASH_MS = 2500;

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function mountSyncStatus() {
  const loader = h('div', { class: 'sync-loader', role: 'progressbar', 'aria-label': 'Syncing with the admin PC', hidden: true }, h('div'));
  const label = h('span', {}, '');
  const chip = h('button', { type: 'button', class: 'sync-chip', hidden: true, onclick: () => onClick() }, h('i', { 'aria-hidden': 'true' }), label);
  document.body.prepend(loader);

  let current = null;
  let wasBusy = false;
  let timer = null;

  async function onClick() {
    if (current?.role !== 'desk') {
      location.hash = '#/devices';
      return;
    }
    show({ ...current, state: 'syncing' });
    try {
      show(await api.post('/api/sync/run'));
      toast('Synced with the admin PC');
    } catch (err) {
      showError(err);
      poll();
    }
  }

  function show(status) {
    current = status;
    const busy = status.state === 'syncing';
    loader.hidden = !busy;
    chip.hidden = status.role === 'standalone';
    chip.dataset.state = busy ? 'busy' : status.state === 'error' ? 'error' : 'ok';
    if (busy) label.textContent = status.role === 'hub' ? 'Desk syncing…' : 'Syncing…';
    else if (status.state === 'error') label.textContent = 'Sync problem';
    else if (status.role === 'hub') label.textContent = `Admin PC · ${status.hub?.devices?.length || 0} desk${status.hub?.devices?.length === 1 ? '' : 's'}`;
    else label.textContent = status.lastSyncAt ? `Synced ${timeOf(status.lastSyncAt)}` : 'Not synced yet';
    chip.title = status.lastError || (status.role === 'desk' ? 'Click to sync now' : 'Network & licences');
    if (wasBusy && !busy && status.state !== 'error') {
      chip.dataset.state = 'done';
      setTimeout(() => { if (chip.dataset.state === 'done') chip.dataset.state = 'ok'; }, DONE_FLASH_MS);
    }
    wasBusy = busy;
  }

  async function poll() {
    clearTimeout(timer);
    try {
      show(await api.get('/api/sync/status'));
    } catch {
      // The local server restarting; try again shortly.
    }
    timer = setTimeout(poll, current?.state === 'syncing' ? POLL_BUSY_MS : POLL_IDLE_MS);
  }

  poll();
  return chip;
}
