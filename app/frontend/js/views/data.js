// Backup & transfer: export everything to one file, import it on another computer,
// automatic daily backups, and the one-time import from version 1.
import { h, clear, append } from '../dom.js';
import { api } from '../api.js';
import { state } from '../state.js';
import { pageHead, panel, table, field, formDialog, confirmDialog, toast, showError, val, saveBlob, pickFile, loading } from '../ui.js';
import { dateTime, date } from '../format.js';

const MB = 1024 * 1024;

export async function render(page) {
  loading(page);
  let backups;
  let settings;
  try {
    [backups, settings] = await Promise.all([api.get('/api/data/backups'), api.get('/api/settings')]);
  } catch (err) {
    append(clear(page), pageHead('Backup & transfer'), h('div', { class: 'notice' }, err.message));
    return;
  }
  const reload = () => render(page);

  append(clear(page), 
    pageHead('Backup & transfer', {
      eyebrow: 'Back office',
      lede: 'All bookings, guests, ID photos, bills, menu and settings live in one data file on this computer.'
    }),
    h('div', { class: 'columns two' },
      panel('Move to another computer', {},
        h('p', {}, 'Export a single .vvdata file, copy it on a pen drive or send it, then choose “Import data file” on the other computer (or “Move from another computer” during its first-time setup).'),
        h('div', { class: 'row', style: { marginTop: '12px' } },
          h('button', { class: 'primary', onclick: exportData }, 'Export data file'),
          h('button', { onclick: () => importData(reload) }, 'Import data file'),
          window.desktop ? h('button', { class: 'quiet', onclick: () => window.desktop.openDataFolder() }, 'Open data folder') : null)),
      autoBackupPanel(settings.backup, backups.folder, reload)),
    h('div', { style: { height: '18px' } }),
    panel('Backups on this computer', {
      count: backups.files.length,
      flush: true,
      tools: h('button', { class: 'small', onclick: () => api.post('/api/data/backups').then(() => { toast('Backup saved'); reload(); }).catch(showError) }, 'Back up now')
    }, table([
      { title: 'File', value: (f) => f.name },
      { title: 'Saved', value: (f) => dateTime(f.modifiedAt) },
      { title: 'Size', num: true, value: (f) => `${(f.size / MB).toFixed(1)} MB` },
      {
        title: '', value: (f) => h('div', { class: 'row end' },
          h('button', { class: 'small', onclick: () => downloadBackup(f.name) }, 'Save copy'),
          h('button', { class: 'small danger', onclick: () => restoreBackup(f, reload) }, 'Restore'))
      }
    ], backups.files, { empty: 'No backups yet. The first automatic backup runs shortly after the app starts.' })));
}

async function exportData() {
  try {
    toast('Preparing export…');
    const blob = await api.get('/api/data/export');
    const name = `${state.property.name.replace(/[^\w-]+/g, '-')}-${state.today}.vvdata`;
    saveBlob(blob, name);
  } catch (err) {
    showError(err);
  }
}

async function importData(reload) {
  const file = await pickFile({ accept: '.vvdata' });
  if (!file) return;
  try {
    toast('Checking file…');
    const { uploadId, summary } = await api.upload('POST', '/api/data/import/upload', file);
    const ok = await formDialog({
      title: 'Replace all data on this computer?',
      lede: 'A safety backup of the current data is saved first, so this can be undone from “Backups on this computer”.',
      body: h('div', { class: 'stack' },
        h('dl', { class: 'pairs' },
          h('dt', {}, 'Property'), h('dd', {}, summary.propertyName || '—'),
          h('dt', {}, 'Exported'), h('dd', {}, summary.meta ? `${dateTime(summary.meta.exportedAt)} by ${summary.meta.by}` : '—'),
          h('dt', {}, 'Guests'), h('dd', {}, summary.counts.guests),
          h('dt', {}, 'Bookings'), h('dd', {}, summary.counts.bookings),
          h('dt', {}, 'Last booking'), h('dd', {}, summary.lastBookingAt ? date(summary.lastBookingAt.slice(0, 10)) : '—')),
        field('Type REPLACE to confirm', { name: 'confirm', required: true, autocomplete: 'off' })),
      submitLabel: 'Replace data',
      submitClass: 'danger',
      onSubmit: (form) => {
        if (val(form, 'confirm') !== 'REPLACE') throw new Error('Type REPLACE in capitals to confirm');
        return api.post('/api/data/import/confirm', { uploadId });
      }
    });
    if (!ok) return;
    toast(`Imported. Safety backup: ${ok.safetyBackup}`);
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    showError(err);
    reload();
  }
}

async function downloadBackup(name) {
  try {
    saveBlob(await api.get(`/api/data/backups/${encodeURIComponent(name)}`), name);
  } catch (err) {
    showError(err);
  }
}

async function restoreBackup(f) {
  const ok = await confirmDialog({
    title: 'Restore this backup?',
    message: `Everything will go back to ${dateTime(f.modifiedAt)}. The current data is saved as a safety backup first.`,
    confirmLabel: 'Restore',
    danger: true
  });
  if (!ok) return;
  try {
    await api.post(`/api/data/backups/${encodeURIComponent(f.name)}/restore`);
    toast('Restored');
    setTimeout(() => location.reload(), 900);
  } catch (err) {
    showError(err);
  }
}

function autoBackupPanel(backup, folder, reload) {
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', {}, `A backup is saved once a day in ${folder}.`),
    field('Also copy to folder', { name: 'folder', value: backup.folder, placeholder: 'e.g. D:\\Backups or a Google Drive / OneDrive folder', maxlength: 400 },
      { hint: 'A second drive, pen drive or synced cloud folder protects you if this computer fails.' }),
    field('Keep daily backups for (days)', { name: 'keepDays', type: 'number', min: 3, max: 365, value: backup.keepDays }),
    h('div', { class: 'row' }, h('button', { type: 'submit', class: 'primary' }, 'Save'), h('button', { type: 'button', onclick: runNow }, 'Run backup now')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/settings/backup', { folder: val(form, 'folder'), keepDays: val(form, 'keepDays') });
      toast('Backup settings saved');
    } catch (err) {
      showError(err);
    }
  });
  async function runNow() {
    try {
      const r = await api.post('/api/data/backups/run-auto');
      toast(r.mirrored ? 'Backed up and copied to your folder' : 'Backed up');
      reload();
    } catch (err) {
      showError(err);
    }
  }
  return panel('Automatic backups', {}, form);
}

