// Phone capture of guest IDs over the hotel Wi-Fi, without internet.
//
// The desk opens a short-lived session for one guest and shows a QR code. The receptionist's
// phone opens the URL, photographs the front and back of the ID and uploads them.
//
// Exposure is kept small on purpose:
//  - a *separate* listener, started only while a session is open, serves just the capture page
//    and the upload endpoint — the main app API never leaves 127.0.0.1;
//  - each session is bound to one guest, identified by an unguessable 192-bit code in the URL,
//    expires after 10 minutes and accepts a limited number of uploads;
//  - uploads go through the same content checks and encryption as every ID photo.
const os = require('os');
const crypto = require('crypto');
const http = require('http');
const qrcode = require('qrcode-generator');
const { html, raw } = require('../lib/html');
const { HttpError, notFound, conflict } = require('../lib/http');
const guests = require('./guests');
const files = require('./files');
const logger = require('../lib/logger');

const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_UPLOADS = 8;
const SIDES = ['front', 'back'];
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const PRIVATE_V4 = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];

/** IPv4 addresses on the local network, private ranges first. */
function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) found.push(a.address);
    }
  }
  return found.sort((x, y) => Number(PRIVATE_V4.some((r) => r.test(y))) - Number(PRIVATE_V4.some((r) => r.test(x))));
}

/** QR code as rows of "1"/"0" so the browser can draw it without injecting markup. */
function qrModules(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, r) => Array.from({ length: size }, (__, c) => (qr.isDark(r, c) ? '1' : '0')).join(''));
}

function capturePage(session, nonce) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>Photograph ID · ${session.propertyName}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; background: #f5f2ec; color: #1c1916; }
  header { background: #1c1916; color: #fff; padding: 18px 20px; }
  header .name { font: 600 19px Georgia, serif; }
  header .sub { color: #c9c0b3; font-size: 13px; margin-top: 2px; }
  main { padding: 18px 16px 40px; display: grid; gap: 14px; }
  .side { display: block; background: #fff; border: 1px solid #e3ddd2; border-radius: 14px; padding: 18px; text-align: center; cursor: pointer; }
  .side input { display: none; }
  .side b { display: block; font-size: 18px; margin-bottom: 4px; }
  .side span { color: #7a7268; font-size: 14px; }
  .side img { display: block; max-width: 100%; max-height: 200px; margin: 12px auto 0; border-radius: 8px; }
  .side.done { border-color: #2e7d55; background: #e5f3eb; }
  .side.busy { opacity: .6; }
  .note { color: #7a7268; font-size: 13px; text-align: center; }
  .error { color: #a43a3a; text-align: center; font-weight: 600; }
  .finished { text-align: center; font: 600 18px Georgia, serif; color: #2e7d55; }
</style></head><body>
<header><div class="name">${session.propertyName}</div><div class="sub">ID photos for ${session.guestFirstName} · ${session.label}</div></header>
<main>
  <label class="side" id="front"><input type="file" accept="image/*" capture="environment" data-side="front"><b>Front of ID</b><span>Tap to open the camera</span></label>
  <label class="side" id="back"><input type="file" accept="image/*" capture="environment" data-side="back"><b>Back of ID</b><span>Tap to open the camera</span></label>
  <p class="error" id="error" hidden></p>
  <p class="finished" id="finished" hidden>Both sides received. You can close this page.</p>
  <p class="note">Photos go straight to the front-desk computer over the hotel Wi-Fi and are stored encrypted. Nothing is kept on this phone by the app.</p>
</main>
<script nonce="${nonce}">${raw(PHONE_SCRIPT)}</script>
</body></html>`.toString();
}

// Runs on the phone: shrink the photo, upload it, show a tick.
const PHONE_SCRIPT = `
(function () {
  var done = {};
  function shrink(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { resolve(b || file); }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { resolve(file); };
      img.src = URL.createObjectURL(file);
    });
  }
  document.querySelectorAll('input[type=file]').forEach(function (input) {
    input.addEventListener('change', function () {
      var file = input.files[0]; if (!file) return;
      var side = input.dataset.side, box = document.getElementById(side), err = document.getElementById('error');
      box.classList.add('busy'); err.hidden = true;
      shrink(file).then(function (blob) {
        return fetch(location.pathname.replace(/\\/$/, '') + '/' + side, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: blob });
      }).then(function (res) {
        return res.json().then(function (body) { if (!res.ok) throw new Error(body.message || 'Upload failed'); });
      }).then(function () {
        box.classList.remove('busy'); box.classList.add('done');
        box.querySelector('span').textContent = 'Received — tap to retake';
        var old = box.querySelector('img'); if (old) old.remove();
        var img = document.createElement('img'); img.src = URL.createObjectURL(file); box.appendChild(img);
        done[side] = true;
        document.getElementById('finished').hidden = !(done.front && done.back);
      }).catch(function (e) {
        box.classList.remove('busy'); err.textContent = e.message; err.hidden = false;
      });
      input.value = '';
    });
  });
})();
`;

/**
 * @param {{ store, port?: number, host?: string, clock?: () => Date }} options
 */
function createPhoneCapture({ store, port = 47810, host = '0.0.0.0', clock = () => new Date() }) {
  const sessions = new Map(); // id -> session
  const byToken = new Map(); // token -> id
  let server = null;
  let listening = null;

  const now = () => clock().getTime();

  function expire() {
    for (const [id, s] of sessions) if (s.expiresAt <= now()) remove(id);
  }

  function remove(id) {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    byToken.delete(s.token);
    if (!sessions.size) stopListener();
  }

  function stopListener() {
    if (!server) return;
    server.close();
    server.closeAllConnections?.();
    server = null;
    listening = null;
  }

  function send(res, status, body, type = 'application/json') {
    res.writeHead(status, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      ...(type.startsWith('text/html') ? { 'Content-Security-Policy': `default-src 'none'; img-src blob:; style-src 'unsafe-inline'; script-src 'nonce-${body.nonce}'; connect-src 'self'; form-action 'none'; base-uri 'none'` } : {})
    });
    res.end(type.startsWith('text/html') ? body.page : JSON.stringify(body));
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          req.destroy();
          reject(new HttpError(413, 'Photo is too large'));
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  /** The only routes reachable from the network: GET /c/<token> and POST /c/<token>/<side>. */
  async function handleRequest(req, res) {
    expire();
    const match = /^\/c\/([^/]+)(?:\/(front|back))?\/?$/.exec(new URL(req.url, 'http://x').pathname);
    const id = match && TOKEN_PATTERN.test(match[1]) ? byToken.get(match[1]) : null;
    const session = id ? sessions.get(id) : null;
    if (!session) return send(res, 404, { message: 'This link has expired. Ask the front desk for a new QR code.' });
    try {
      if (req.method === 'GET' && !match[2]) {
        const nonce = crypto.randomBytes(12).toString('base64');
        return send(res, 200, { page: capturePage(session, nonce), nonce }, 'text/html; charset=utf-8');
      }
      if (req.method === 'POST' && match[2]) {
        if (session.uploads >= MAX_UPLOADS) throw new HttpError(429, 'Too many photos for this link');
        const buffer = await readBody(req, files.MAX_FILE_BYTES);
        session.uploads += 1;
        const ctx = { store, actor: `${session.actor} (phone)`, isAdmin: false, now: () => clock().toISOString() };
        guests.setIdPhoto(ctx, session.guestId, { name: `id-${match[2]}.jpg`, buffer }, match[2]);
        session.received[match[2]] = clock().toISOString();
        return send(res, 201, { ok: true });
      }
      send(res, 405, { message: 'Not allowed' });
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) logger.error('Phone capture failed', { error: err.stack || err.message });
      send(res, status, { message: status >= 500 ? 'Could not save the photo' : err.message });
    }
  }

  async function ensureListener() {
    if (listening) return listening;
    server = http.createServer((req, res) => handleRequest(req, res));
    server.requestTimeout = 60_000;
    listening = new Promise((resolve, reject) => {
      server.once('error', (err) => {
        if (err.code !== 'EADDRINUSE' || port === 0) return reject(err);
        server.listen(0, host); // preferred port busy: any free port
      });
      server.on('listening', () => resolve(server.address().port));
      server.listen(port, host);
    });
    try {
      return await listening;
    } catch (err) {
      stopListener();
      throw err;
    }
  }

  /** Opens a session for a guest. Resolves to what the desk needs to show the QR code. */
  async function open(ctx, guestId, { label = '' } = {}) {
    const guest = guests.getRow(store, guestId);
    expire();
    const actualPort = await ensureListener();
    const id = crypto.randomBytes(9).toString('hex');
    const token = crypto.randomBytes(24).toString('base64url');
    const propertyName = JSON.parse(store.get("SELECT value FROM settings WHERE key = 'property'")?.value || '{}').name || 'Front desk';
    const session = {
      id, token, guestId, actor: ctx.actor, uploads: 0, received: {}, expiresAt: now() + SESSION_TTL_MS,
      propertyName, guestFirstName: guest.full_name.split(/\s+/)[0], label: label || 'Check-in'
    };
    sessions.set(id, session);
    byToken.set(token, id);
    const hosts = host === '0.0.0.0' ? lanAddresses() : [host];
    if (!hosts.length) {
      remove(id);
      throw conflict('This computer is not connected to a network. Connect it to the hotel Wi-Fi to use phone capture.');
    }
    const urls = hosts.map((h) => `http://${h}:${actualPort}/c/${token}`);
    return { id, url: urls[0], otherUrls: urls.slice(1), qr: qrModules(urls[0]), expiresAt: new Date(session.expiresAt).toISOString() };
  }

  function status(id) {
    expire();
    const s = sessions.get(id);
    if (!s) throw notFound('Capture session has ended');
    return { received: { ...s.received }, expiresAt: new Date(s.expiresAt).toISOString() };
  }

  function close(id) {
    remove(id);
  }

  function closeAll() {
    for (const id of [...sessions.keys()]) remove(id);
    stopListener();
  }

  return { open, status, close, closeAll, SIDES };
}

module.exports = { createPhoneCapture, lanAddresses, qrModules };
