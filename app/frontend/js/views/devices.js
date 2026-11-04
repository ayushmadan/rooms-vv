// Network & licences: this computer's role, hotel-network sync, and (on the admin PC)
// pairing desks and issuing or removing licence keys.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { pageHead, panel, table, tag, field, formDialog, confirmDialog, toast, showError, val, loading, saveBlob, pickFile } from '../ui.js';
import { dateTime } from '../format.js';
import { joinAdminPc } from '../pairing.js';

const ROLE_LABEL = { hub: 'Admin PC', desk: 'Front desk (synced)', standalone: 'Standalone' };

export async function render(page) {
  loading(page);
  const [boot, status, conflicts] = await Promise.all([api.get('/api/bootstrap'), api.get('/api/sync/status'), api.get('/api/sync/conflicts')]);
  const reload = () => render(page);
  const lic = boot.license;

  append(clear(page),
    pageHead('Network & licences', {
      eyebrow: 'Back office',
      lede: `Desks sync with the admin PC over the hotel network every ${status.intervalMinutes} minutes. No internet is used for syncing.`
    }),
    // The admin PC's desk table needs the full width; a desk shows its two panels side by side.
    status.role === 'hub'
      ? [thisComputer(status, lic, reload), h('div', { style: { height: '18px' } }), pairingPanel(status, reload)]
      : h('div', { class: 'columns two' }, thisComputer(status, lic, reload), deskPanel(status, reload)),
    h('div', { style: { height: '18px' } }),
    status.role === 'hub' ? await licencesPanel(reload) : null,
    historyPanel(status),
    conflictsPanel(conflicts, reload));
}

function thisComputer(status, lic, reload) {
  const licenceText = lic.owner ? 'Owner key loaded — always active'
    : !lic.required ? 'Not required on this installation'
      : lic.valid ? `Active${lic.label ? ` · ${lic.label}` : ''}${lic.lastConfirmedAt ? ` · confirmed ${dateTime(lic.lastConfirmedAt)}` : ' · not confirmed yet'}`
        : `Locked (${lic.reason})`;
  return panel('This computer', {},
    h('dl', { class: 'pairs' },
      h('dt', {}, 'Role'), h('dd', {}, h('strong', {}, ROLE_LABEL[status.role])),
      h('dt', {}, 'Machine code'), h('dd', {}, h('code', { style: { fontSize: '14px', letterSpacing: '1px' } }, lic.machineCode)),
      h('dt', {}, 'Licence'), h('dd', {}, licenceText),
      lic.required && !lic.owner && lic.graceDaysLeft !== null ? [h('dt', {}, 'Works offline for'), h('dd', {}, `${lic.graceDaysLeft} more day${lic.graceDaysLeft === 1 ? '' : 's'} without a check`)] : null),
    h('div', { class: 'row', style: { marginTop: '14px' } },
      lic.required && !lic.owner ? h('button', { class: 'small', onclick: () => api.post('/api/license/check').then((r) => { toast(`Licence check: ${r.result}`); reload(); }).catch(showError) }, 'Check licence now') : null,
      status.role === 'hub'
        ? h('button', { class: 'small quiet', onclick: () => removeOwnerKey(reload) }, 'Remove owner key')
        : h('button', { class: 'small', onclick: () => loadOwnerKey(reload) }, 'Make this the admin PC')));
}

async function loadOwnerKey(reload) {
  const ok = await confirmDialog({
    title: 'Make this the admin PC?',
    message: 'Load the owner key file (license-private.pem) from your pen drive. This computer will then issue licence keys and act as the hub every desk syncs with. Only do this on the owner’s computer.',
    confirmLabel: 'Choose key file'
  });
  if (!ok) return;
  const file = await pickFile({ accept: '.pem' });
  if (!file) return;
  try {
    await api.upload('PUT', '/api/owner/key', file);
    toast('Owner key loaded. This is now the admin PC.');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    showError(err);
  }
  reload();
}

async function removeOwnerKey(reload) {
  if (!(await confirmDialog({ title: 'Remove the owner key?', message: 'This computer stops being the admin PC: desks can no longer sync with it and you cannot issue keys here until the key is loaded again.', confirmLabel: 'Remove', danger: true }))) return;
  await api.del('/api/owner/key').catch(showError);
  location.reload();
}

function deskPanel(status, reload) {
  if (status.role !== 'desk') {
    return panel('Hotel network', {},
      status.unpairedAt ? h('div', { class: 'notice danger', style: { marginBottom: '12px' } }, `Disconnected from the admin PC on ${dateTime(status.unpairedAt)}.`) : null,
      h('p', {}, 'Connect this desk to the admin PC so bookings, guests and bills are shared between all desks.'),
      h('button', { class: 'primary', onclick: () => joinAdminPc() }, 'Connect to the admin PC'));
  }
  const d = status.desk;
  const skewMinutes = Math.round(Math.abs(d.clockSkewMs || 0) / 60000);
  return panel('Hotel network', { tools: h('button', { class: 'small primary', onclick: () => api.post('/api/sync/run').then(() => { toast('Synced'); reload(); }).catch(showError) }, 'Sync now') },
    h('dl', { class: 'pairs' },
      h('dt', {}, 'Admin PC'), h('dd', {}, `${d.hubName || 'Admin PC'} · ${d.hubAddress}`),
      h('dt', {}, 'This desk'), h('dd', {}, `Desk ${d.node} · numbers bills as series D${d.node}`),
      h('dt', {}, 'Last sync'), h('dd', {}, status.lastSyncAt ? dateTime(status.lastSyncAt) : 'Not yet'),
      status.lastError ? [h('dt', {}, 'Problem'), h('dd', { class: 'money-due' }, status.lastError)] : null),
    skewMinutes >= 2 ? h('div', { class: 'notice', style: { marginTop: '12px' } }, `This computer’s clock differs from the admin PC by about ${skewMinutes} minutes. Set both clocks correctly so the newest change wins.`) : null,
    h('div', { class: 'row', style: { marginTop: '12px' } }, h('button', {
      class: 'small quiet',
      onclick: async () => {
        if (!(await confirmDialog({ title: 'Disconnect from the admin PC?', message: 'This desk keeps its data but stops syncing. To reconnect, pair it again (its data is then replaced by the admin PC’s).', confirmLabel: 'Disconnect', danger: true }))) return;
        await api.post('/api/sync/disconnect').catch(showError);
        reload();
      }
    }, 'Disconnect')));
}

function pairingPanel(status, reload) {
  const codeBox = h('div');
  const showCode = async () => {
    try {
      const { code, expiresAt, addresses } = await api.post('/api/sync/pairing-code');
      append(clear(codeBox), h('div', { class: 'notice', style: { marginTop: '12px' } },
        h('div', { class: 'hint' }, 'On the desk: Network & licences (or first-time setup) → Connect to the admin PC'),
        h('div', { style: { fontFamily: 'var(--serif)', fontSize: '34px', letterSpacing: '4px', margin: '6px 0' } }, code),
        h('div', { class: 'hint' }, `Works once, until ${dateTime(expiresAt)}. If the desk cannot find this PC, type: ${addresses.join(' or ')}`)));
    } catch (err) {
      showError(err);
    }
  };
  const devices = status.hub.devices;
  const tools = [
    devices.length ? h('button', { class: 'small', onclick: () => requestSync(undefined, reload) }, 'Sync all now') : null,
    h('button', { class: 'small primary', onclick: showCode }, 'Add a desk')
  ];
  return panel('Front desks', { count: devices.length, tools },
    codeBox,
    h('div', { style: { marginTop: '12px' } }, table([
      { title: 'Desk', value: (d) => h('div', {}, h('strong', {}, d.label), h('div', { class: 'hint' }, `Desk ${d.node} · ${d.machineCode || ''}`)) },
      { title: 'Status', value: deskState },
      { title: 'Last sync', value: (d) => (d.lastSeen ? dateTime(d.lastSeen) : 'Never') },
      { title: 'Address', value: (d) => d.lastIp || '—' },
      { title: 'Version', value: (d) => d.appVersion || '—' },
      { title: '', value: (d) => h('button', { class: 'small', onclick: () => requestSync(d.node, reload) }, 'Sync now') },
      {
        title: '', value: (d) => h('button', {
          class: 'small quiet',
          onclick: async () => {
            if (!(await confirmDialog({ title: `Remove ${d.label}?`, message: 'It stops syncing immediately. To stop it working entirely, also remove its licence key below.', confirmLabel: 'Remove', danger: true }))) return;
            await api.del(`/api/sync/devices/${d.node}`).catch(showError);
            reload();
          }
        }, 'Remove')
      }
    ], devices, { empty: 'No desks paired yet.' })));
}

function deskState(d) {
  if (d.syncRequested) return tag('BOOKED', 'Sync requested');
  return d.online ? tag('CHECKED_IN', 'Online') : tag('CANCELLED', d.lastPing ? `Offline since ${dateTime(d.lastPing)}` : 'Offline');
}

// Desks check in every 30 seconds and pick up the request then; the page refreshes to show the result.
const PICKUP_WAIT_MS = 35 * 1000;

async function requestSync(node, reload) {
  try {
    await api.post('/api/sync/request', { node });
    toast(node === undefined ? 'Every online desk will sync within 30 seconds' : 'The desk will sync within 30 seconds');
    reload();
    setTimeout(() => { if (location.hash.startsWith('#/devices')) reload(); }, PICKUP_WAIT_MS);
  } catch (err) {
    showError(err);
  }
}

const TRIGGER_LABEL = { schedule: 'Every 15 min', manual: 'Sync now', admin: 'Asked by admin PC', pairing: 'First connection' };

function historyPanel(status) {
  const rows = status.history || [];
  const columns = [
    { title: 'When', value: (r) => dateTime(r.at) },
    status.role === 'hub' ? { title: 'Desk', value: (r) => r.label || `Desk ${r.node}` } : null,
    { title: 'Started by', value: (r) => TRIGGER_LABEL[r.trigger] || r.trigger },
    { title: 'Sent', num: true, value: (r) => (r.ok ? String(r.sent) : '—') },
    { title: 'Received', num: true, value: (r) => (r.ok ? String(r.received) : '—') },
    { title: 'Result', value: (r) => (!r.ok ? h('span', { class: 'money-due' }, r.error || 'Failed') : r.conflicts ? `${r.conflicts} double booking${r.conflicts === 1 ? '' : 's'} to check` : 'OK') },
    { title: 'Took', num: true, value: (r) => `${(r.duration_ms / 1000).toFixed(1)} s` }
  ].filter(Boolean);
  return panel('Sync history', { count: rows.length },
    status.role === 'hub' ? h('p', { class: 'hint', style: { marginTop: 0 } }, 'Sent and received are counted from this admin PC: changes it sent to the desk and changes it received from it.') : null,
    table(columns, rows, { empty: 'No syncs yet.' }));
}

async function licencesPanel(reload) {
  const data = await api.get('/api/licenses');
  const issue = async () => {
    const issued = await formDialog({
      title: 'Issue a licence key',
      lede: 'The machine code is shown on the new computer’s activation screen.',
      body: h('div', { class: 'grid c2' },
        field('Machine code', { name: 'machineCode', required: true, placeholder: 'ABCD-EFGH-JKLM-NPQR', maxlength: 19, style: { textTransform: 'uppercase' } }),
        field('Label', { name: 'label', placeholder: 'e.g. Reception desktop', maxlength: 60 })),
      submitLabel: 'Issue key',
      onSubmit: (form) => api.post('/api/licenses', { machineCode: val(form, 'machineCode').toUpperCase(), label: val(form, 'label') })
    });
    if (issued) {
      await showKey(issued.key, issued.label);
      reload();
    }
  };
  const registerEarlier = async () => {
    const done = await formDialog({
      title: 'Register a key issued earlier',
      lede: 'Computers activated before keys were managed here must be listed, or publishing licenses.json would lock them. Paste each one’s key (it is in that computer’s license.json, or in your records).',
      body: h('div', { class: 'stack' },
        field('Activation key', { name: 'existingKey', type: 'textarea', required: true, rows: 3 }),
        h('div', { class: 'grid c2' },
          field('Machine code', { name: 'machineCode', placeholder: 'Needed for keys made before version 3.1', maxlength: 19, style: { textTransform: 'uppercase' } }),
          field('Label', { name: 'label', placeholder: 'e.g. Reception desktop', maxlength: 60 }))),
      submitLabel: 'Register',
      onSubmit: (form) => api.post('/api/licenses', { existingKey: val(form, 'existingKey'), label: val(form, 'label'), machineCode: val(form, 'machineCode').toUpperCase() })
    });
    if (done) {
      toast(`${done.label} registered`);
      reload();
    }
  };
  const exportList = async () => {
    try {
      saveBlob(await api.get('/api/licenses/export'), 'licenses.json');
      toast('Saved licenses.json — commit it to the repository root and push to main.');
    } catch (err) {
      showError(err);
    }
  };
  return panel('Licence keys', {
    count: `list version ${data.serial}`,
    tools: [
      h('button', { class: 'small quiet', onclick: registerEarlier }, 'Register earlier key'),
      h('button', { class: 'small', onclick: exportList }, 'Export licenses.json'),
      h('button', { class: 'small primary', onclick: issue }, 'Issue key')
    ]
  },
  h('div', { class: 'notice', style: { marginBottom: '12px' } },
    'After issuing or removing a key, export licenses.json, put it in the repository root and push it to main. ',
    'Desks on this network learn about the change at their next sync; desks elsewhere when they next reach GitHub.'),
  table([
    { title: 'Computer', value: (k) => h('div', {}, h('strong', {}, k.label), h('div', { class: 'hint' }, k.machineCode)) },
    { title: 'Issued', value: (k) => dateTime(k.issuedAt) },
    { title: 'Status', value: (k) => (k.active ? tag('CHECKED_IN', 'Active') : tag('CANCELLED', `Removed ${dateTime(k.revokedAt)}`)) },
    {
      title: '', value: (k) => (k.active ? h('div', { class: 'row end' },
        h('button', { class: 'small quiet', onclick: async () => showKey((await api.get(`/api/licenses/${k.hash}/key`)).key, k.label) }, 'Show key'),
        h('button', {
          class: 'small danger',
          onclick: async () => {
            if (!(await confirmDialog({ title: `Remove the key for ${k.label}?`, message: 'That computer locks at its next check. Export and commit licenses.json so computers off this network learn about it too.', confirmLabel: 'Remove key', danger: true }))) return;
            await api.del(`/api/licenses/${k.hash}`).catch(showError);
            reload();
          }
        }, 'Remove')) : '')
    }
  ], data.keys, { empty: 'No keys issued yet.' }));
}

function showKey(key, label) {
  return formDialog({
    title: `Activation key · ${label}`,
    lede: 'Send this to the computer’s user (WhatsApp, email or a pen drive). They paste it on the activation screen.',
    body: h('textarea', { readonly: true, rows: 4, style: { fontFamily: 'monospace', fontSize: '13px' }, onfocus: (e) => e.target.select() }, key),
    submitLabel: 'Copy key',
    onSubmit: async () => {
      await navigator.clipboard?.writeText(key);
      toast('Key copied');
      return true;
    }
  });
}

function conflictsPanel(conflicts, reload) {
  if (!conflicts.overlaps.length && !conflicts.failed.length) return null;
  return panel('Needs attention', { count: conflicts.overlaps.length + conflicts.failed.length },
    conflicts.overlaps.length ? h('div', {}, h('p', {}, 'These bookings were made on different desks while they could not sync, and overlap. Move or cancel one of each pair:'),
      table([
        { title: 'Room', value: (o) => o.unit },
        { title: 'Dates', value: (o) => `${o.fromDate} → ${o.toDate}` },
        { title: 'Booking 1', value: (o) => h('a', { href: `#/booking/${o.aId}` }, `${o.aCode} · ${o.aGuest}`) },
        { title: 'Booking 2', value: (o) => h('a', { href: `#/booking/${o.bId}` }, `${o.bCode} · ${o.bGuest}`) }
      ], conflicts.overlaps)) : null,
    conflicts.failed.length ? h('div', { style: { marginTop: '14px' } }, h('p', {}, 'Changes from another computer that could not be applied here:'),
      table([
        { title: 'When', value: (c) => dateTime(c.at) },
        { title: 'What', value: (c) => `${c.tbl} ${c.row_key}` },
        { title: 'Why', value: (c) => c.reason },
        { title: '', value: (c) => h('button', { class: 'small quiet', onclick: () => api.post(`/api/sync/conflicts/${c.id}/resolve`).then(reload).catch(showError) }, 'Dismiss') }
      ], conflicts.failed)) : null);
}
