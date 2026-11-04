// Machine activation and remote revocation.
//
// Activation key: an owner-signed statement "this machine code, this label, issued at…".
// Revocation list: licenses.json in the GitHub repo (and served by the admin PC on the hotel
// network) — a signed, serial-numbered list of SHA-256 hashes of the active keys.
//
// A desk stays active while its key is in the newest list it has seen. A key missing from a
// list published after the key was issued is revoked. If no list confirms the key for
// GRACE_DAYS (no internet and no admin PC), the desk locks until it can check again.
// Only the public key ships with the app, so neither keys nor lists can be forged.
const fs = require('fs');
const crypto = require('crypto');
const { PUBLIC_KEY_PEM } = require('./license-key');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;
const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const GITHUB_LIST_URL = 'https://raw.githubusercontent.com/ayushmadan/rooms-vv/main/licenses.json';
const FETCH_TIMEOUT_MS = 10_000;

/** Short, typeable code derived from the OS machine id (the raw id is never shown). */
function machineCode(rawMachineId) {
  const digest = crypto.createHash('sha256').update(`vira-villas-rooms|${String(rawMachineId).trim().toLowerCase()}`).digest();
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  return code.match(/.{4}/g).join('-');
}

function normalizeKey(key) {
  return String(key || '').replace(/\s+/g, '');
}

function keyHash(key) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex');
}

function verify(message, signatureB64, publicKeyPem) {
  try {
    const signature = Buffer.from(signatureB64, 'base64url');
    return signature.length === 64 && crypto.verify(null, Buffer.from(message), crypto.createPublicKey(publicKeyPem), signature);
  } catch (_err) {
    return false;
  }
}

/**
 * Reads an activation key. v2 keys are "<payload>.<signature>" with payload {m, l, i};
 * v1 keys (a bare signature of the machine code) are still accepted, with no issue date.
 * Returns { machineCode, label, issuedAt } or null if invalid for this public key.
 */
function parseKey(key, publicKeyPem = PUBLIC_KEY_PEM) {
  const text = normalizeKey(key);
  const [payloadPart, signature] = text.split('.');
  if (signature) {
    if (!verify(payloadPart, signature, publicKeyPem)) return null;
    try {
      const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
      return { machineCode: payload.m, label: payload.l || '', issuedAt: payload.i || '' };
    } catch (_err) {
      return null;
    }
  }
  return { machineCode: null, label: '', issuedAt: '', legacySignature: text };
}

function isValidKey(code, activationKey, publicKeyPem = PUBLIC_KEY_PEM) {
  const parsed = parseKey(activationKey, publicKeyPem);
  if (!parsed) return false;
  if (parsed.legacySignature) return verify(code, parsed.legacySignature, publicKeyPem);
  return parsed.machineCode === code;
}

/** Verifies a signed license list; returns { serial, updatedAt, hashes:Set } or null. */
function readList(signed, publicKeyPem = PUBLIC_KEY_PEM) {
  if (!signed || typeof signed.payload !== 'string' || !verify(signed.payload, signed.signature, publicKeyPem)) return null;
  try {
    const payload = JSON.parse(signed.payload);
    if (!Number.isInteger(payload.serial) || !Array.isArray(payload.hashes)) return null;
    return { serial: payload.serial, updatedAt: String(payload.updatedAt || ''), hashes: new Set(payload.hashes) };
  } catch (_err) {
    return null;
  }
}

/**
 * @param {object} options
 * @param {boolean} options.required enforced by the packaged app
 * @param {string} options.machineId raw OS machine id
 * @param {string} options.file where this computer's key and check results are kept
 * @param {() => boolean} [options.isOwner] the admin PC (owner key loaded) is always active
 * @param {() => number} [options.clock] ms since epoch
 */
function createLicense({ required, machineId, file, publicKeyPem = PUBLIC_KEY_PEM, isOwner = () => false, clock = () => Date.now(), fetchImpl = fetch }) {
  const code = machineCode(machineId);
  let state = read();

  function read() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_err) {
      return {};
    }
  }

  function write(next) {
    state = { ...state, ...next };
    fs.writeFileSync(file, JSON.stringify(state, null, 2));
  }

  function evaluate() {
    if (!required || isOwner()) return { valid: true, reason: '' };
    if (!state.key || !isValidKey(code, state.key, publicKeyPem)) return { valid: false, reason: 'not-activated' };
    if (state.revoked) return { valid: false, reason: 'revoked' };
    const confirmedAt = Date.parse(state.lastConfirmedAt || state.activatedAt || 0);
    if (clock() - confirmedAt > GRACE_DAYS * DAY_MS) return { valid: false, reason: 'check-overdue' };
    return { valid: true, reason: '' };
  }

  /** Applies a signed list from GitHub or the admin PC. Returns what it meant for this computer. */
  function applyList(signed) {
    const list = readList(signed, publicKeyPem);
    if (!list) return 'invalid';
    if (list.serial < (state.listSerial || 0)) return 'older';
    const updates = { listSerial: list.serial, listUpdatedAt: list.updatedAt, lastListAt: new Date(clock()).toISOString() };
    if (!state.key) {
      write(updates);
      return 'no-key';
    }
    if (list.hashes.has(keyHash(state.key))) {
      write({ ...updates, lastConfirmedAt: new Date(clock()).toISOString(), revoked: false });
      return 'confirmed';
    }
    // A key issued after this list was published is waiting for the owner to commit the new list.
    const issuedAt = parseKey(state.key, publicKeyPem)?.issuedAt || '';
    if (issuedAt && list.updatedAt && issuedAt > list.updatedAt) {
      write(updates);
      return 'pending';
    }
    write({ ...updates, revoked: true });
    return 'revoked';
  }

  async function checkGithub() {
    try {
      const res = await fetchImpl(`${GITHUB_LIST_URL}?t=${clock()}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { 'Cache-Control': 'no-cache' } });
      // No licenses.json in the repo yet: revocation is not in use, so the key stands confirmed.
      // (Keeps installs activated before revocation existed from locking after 7 days.)
      if (res.status === 404 && !state.listSerial) {
        if (state.key) write({ lastConfirmedAt: new Date(clock()).toISOString() });
        return 'no-list';
      }
      if (!res.ok) return 'unreachable';
      return applyList(await res.json());
    } catch (_err) {
      return 'unreachable';
    }
  }

  function activate(key) {
    if (!isValidKey(code, key, publicKeyPem)) return false;
    write({ key: normalizeKey(key), machineCode: code, activatedAt: new Date(clock()).toISOString(), revoked: false, lastConfirmedAt: null });
    return true;
  }

  return {
    get status() {
      const { valid, reason } = evaluate();
      const confirmedAt = state.lastConfirmedAt || state.activatedAt || null;
      const daysLeft = confirmedAt ? Math.max(0, Math.ceil((Date.parse(confirmedAt) + GRACE_DAYS * DAY_MS - clock()) / DAY_MS)) : null;
      return {
        required, valid, reason, machineCode: code, owner: isOwner(),
        label: state.key ? parseKey(state.key, publicKeyPem)?.label || '' : '',
        lastConfirmedAt: state.lastConfirmedAt || null, lastCheckedAt: state.lastListAt || null, graceDaysLeft: daysLeft
      };
    },
    isActive: () => evaluate().valid,
    keyHash: () => (state.key ? keyHash(state.key) : ''),
    activate,
    applyList,
    checkGithub
  };
}

module.exports = { createLicense, machineCode, isValidKey, parseKey, readList, keyHash, normalizeKey, GRACE_DAYS, GITHUB_LIST_URL };
