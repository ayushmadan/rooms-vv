// Identity documents in the UI. Staff can add an ID photo (file or camera) and see a masked
// number; viewing the photo or full number asks for the admin PIN.
import { h, clear, append } from './dom.js';
import { api, admin } from './api.js';
import { toast, showError, compressImage, captureFromCamera, idPhotoUrl, formDialog } from './ui.js';

const POLL_MS = 2000;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Draws the QR matrix from the server as SVG using DOM calls only. */
function qrSvg(rows, size = 232) {
  const quiet = 4;
  const n = rows.length + quiet * 2;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code for the phone');
  const bg = document.createElementNS(SVG_NS, 'rect');
  bg.setAttribute('width', n);
  bg.setAttribute('height', n);
  bg.setAttribute('fill', '#fff');
  svg.append(bg);
  const path = document.createElementNS(SVG_NS, 'path');
  let d = '';
  rows.forEach((row, y) => [...row].forEach((bit, x) => { if (bit === '1') d += `M${x + quiet} ${y + quiet}h1v1h-1z`; }));
  path.setAttribute('d', d);
  path.setAttribute('fill', '#1c1916');
  svg.append(path);
  return svg;
}

/**
 * Shows a QR code; the receptionist's phone photographs the ID and the photos land on this
 * guest. Resolves to the sides received, e.g. { front: '…', back: '…' }.
 */
export async function phoneCaptureDialog(guest, label) {
  let session;
  try {
    session = await api.post('/api/phone-capture', { guestId: guest.id, label });
  } catch (err) {
    showError(err);
    return {};
  }
  let received = {};
  const line = (side) => h('div', { class: 'row', dataset: { side } }, h('span', { class: 'tag OPEN' }, 'Waiting'), side === 'front' ? 'Front of ID' : 'Back of ID');
  const lines = h('div', { class: 'stack', style: { gap: '8px' } }, line('front'), line('back'));
  const timer = setInterval(async () => {
    try {
      ({ received } = await api.get(`/api/phone-capture/${session.id}`));
      for (const side of ['front', 'back']) {
        if (!received[side]) continue;
        const tag = lines.querySelector(`[data-side="${side}"] .tag`);
        tag.className = 'tag CHECKED_IN';
        tag.textContent = 'Received';
      }
    } catch {
      clearInterval(timer);
    }
  }, POLL_MS);
  try {
    await formDialog({
      title: 'Photograph the ID with a phone',
      lede: 'Scan with any phone on the hotel Wi-Fi. Take the front, then the back. Photos arrive here encrypted.',
      wide: true,
      body: h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '24px', alignItems: 'center' } },
        h('div', { style: { padding: '10px', background: '#fff', border: '1px solid var(--line)', borderRadius: '12px' } }, qrSvg(session.qr)),
        h('div', { class: 'stack' },
          lines,
          h('p', { class: 'hint' }, 'If the camera app does not open the link, type this address in the phone browser:'),
          h('code', { style: { fontSize: '12.5px', wordBreak: 'break-all', background: 'var(--surface-2)', padding: '8px 10px', borderRadius: '8px' } }, session.url),
          session.otherUrls.length ? h('p', { class: 'hint' }, `Other networks on this PC: ${session.otherUrls.map((u) => new URL(u).host).join(', ')}`) : null,
          h('p', { class: 'hint' }, 'The link works for 10 minutes and only for this guest. Windows may ask once to allow network access — choose Private networks.'))),
      submitLabel: 'Done',
      cancelLabel: 'Close',
      onSubmit: () => true
    });
  } finally {
    clearInterval(timer);
    await api.del(`/api/phone-capture/${session.id}`).catch(() => {});
  }
  const count = Object.keys(received).length;
  if (count) toast(`${count === 2 ? 'Both sides' : 'One side'} of the ID received from the phone`);
  return received;
}

export async function uploadIdPhoto(guestId, fileOrBlob) {
  const name = fileOrBlob.name || 'id-camera.jpg';
  await api.upload('PUT', `/api/guests/${guestId}/photo?name=${encodeURIComponent(name)}`, await compressImage(fileOrBlob));
}

function pickFile() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: 'image/*,application/pdf' });
    input.addEventListener('change', () => resolve(input.files[0] || null));
    input.click();
  });
}

/** Photo area for a guest: shows the photo to admin, otherwise a locked placeholder. */
export function idPhotoBlock(guest, { canChange = true, onChanged } = {}) {
  const view = h('div');
  const sides = [['front', guest.hasIdPhoto], ['back', guest.hasIdPhotoBack]].filter(([, has]) => has).map(([side]) => side);
  const show = async () => {
    try {
      const urls = await Promise.all(sides.map((side) => idPhotoUrl(guest.id, side)));
      append(clear(view), h('div', { class: 'stack', style: { gap: '8px' } }, urls.map((url, i) => h('img', {
        class: 'idphoto', src: url, alt: `${sides[i] === 'front' ? 'Front' : 'Back'} of photo ID of ${guest.fullName}`,
        onload: () => setTimeout(() => URL.revokeObjectURL(url), 1000)
      }))));
    } catch (err) {
      showError(err);
    }
  };
  if (!sides.length) view.append(h('p', { class: 'hint' }, 'No ID photo on file.'));
  else if (admin.isUnlocked) show();
  else view.append(h('div', { class: 'notice' }, 'ID photo on file. ', h('button', { class: 'small', onclick: show }, 'View (admin PIN)')));

  const save = async (blob) => {
    if (!blob) return;
    try {
      await uploadIdPhoto(guest.id, blob);
      toast('ID photo saved and encrypted');
      if (onChanged) onChanged();
    } catch (err) {
      showError(err);
    }
  };
  return h('div', { class: 'stack' }, view, canChange ? h('div', { class: 'row' },
    h('button', { class: 'small accent', onclick: async () => { const got = await phoneCaptureDialog(guest, 'ID photos'); if (Object.keys(got).length && onChanged) onChanged(); } }, 'Use phone'),
    h('button', { class: 'small', onclick: async () => save(await captureFromCamera()) }, 'PC camera'),
    h('button', { class: 'small', onclick: async () => save(await pickFile()) }, guest.hasIdPhoto ? 'Replace from file' : 'Upload file')) : null);
}

/** Masked ID number with an admin-only "show" action. */
export function idNumberText(guest) {
  if (!guest.idType) return h('span', { class: 'money-due' }, 'Not recorded');
  const value = h('span', {}, `${guest.idType} · ${guest.idNumber}`);
  const reveal = h('button', {
    class: 'quiet small',
    onclick: async () => {
      try {
        const { idNumber } = await api.get(`/api/guests/${guest.id}/id-number`);
        value.textContent = `${guest.idType} · ${idNumber}`;
        reveal.remove();
      } catch (err) {
        showError(err);
      }
    }
  }, 'Show');
  return h('span', {}, value, ' ', reveal);
}

/**
 * Photo input for dialogs: phone capture, PC camera or a file. read() returns a file or PC-camera
 * image still to upload (phone photos are already saved); hasNewPhoto() covers all three.
 */
export function idPhotoInput(guest) {
  let captured = null;
  let fromPhone = false;
  const status = h('span', { class: 'hint' }, guest.hasIdPhoto ? 'A photo is already on file (encrypted).' : 'Not added yet.');
  const file = h('input', { type: 'file', name: 'photo', accept: 'image/*,application/pdf' });
  file.addEventListener('change', () => {
    captured = null;
    status.textContent = file.files[0] ? `Selected ${file.files[0].name}` : '';
  });
  const node = h('div', { class: 'field span-2', style: { display: 'grid', gap: '6px' } },
    h('span', { style: { fontSize: '12.5px', fontWeight: 500 } }, guest.hasIdPhoto ? 'Replace ID photo (optional)' : 'ID photo'),
    h('div', { class: 'row' },
      h('button', { type: 'button', class: 'small accent', onclick: async () => {
        const got = await phoneCaptureDialog(guest, 'Check-in');
        if (!Object.keys(got).length) return;
        fromPhone = true;
        status.textContent = `${got.front && got.back ? 'Front and back' : got.front ? 'Front' : 'Back'} received from the phone.`;
      } }, 'Use phone'),
      h('button', { type: 'button', class: 'small', onclick: async () => {
        const blob = await captureFromCamera();
        if (!blob) return;
        captured = blob;
        file.value = '';
        status.textContent = 'Captured from camera.';
      } }, 'PC camera'),
      file),
    status);
  return { node, read: () => captured || file.files[0] || null, hasNewPhoto: () => fromPhone || Boolean(captured || file.files[0]) };
}
