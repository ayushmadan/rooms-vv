// The owner's signing key turns one computer into the admin PC: it issues and removes
// activation keys and produces the signed licenses.json for the repo. The key never ships in
// the installer; it is loaded from the owner's own file (e.g. a pen drive).
const fs = require('fs');
const crypto = require('crypto');
const { badRequest, notFound } = require('../lib/http');
const { PUBLIC_KEY_PEM } = require('./license-key');
const { keyHash, parseKey, normalizeKey, isValidKey } = require('./license');

const MACHINE_CODE = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

/**
 * @param {{ keyFile: string, registryFile: string, publicKeyPem?: string, clock?: () => number }} options
 */
function createOwner({ keyFile, registryFile, publicKeyPem = PUBLIC_KEY_PEM, clock = () => Date.now() }) {
  let privateKey = load();

  function load() {
    try {
      const key = crypto.createPrivateKey(fs.readFileSync(keyFile));
      return matches(key) ? key : null;
    } catch (_err) {
      return null; // No key on this computer (the usual case for front desks).
    }
  }

  /** True if the private key belongs to the public key built into this app. */
  function matches(key) {
    const derived = crypto.createPublicKey(key).export({ format: 'pem', type: 'spki' }).toString().trim();
    return derived === String(publicKeyPem).trim();
  }

  function install(pem) {
    let key;
    try {
      key = crypto.createPrivateKey(String(pem));
    } catch (err) {
      throw badRequest('That file is not a private key', { cause: err });
    }
    if (!matches(key)) throw badRequest('This key does not belong to this app. Use the license-private.pem made for Vira Villas Rooms.');
    fs.writeFileSync(keyFile, key.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    privateKey = key;
  }

  /** A 32-byte secret only this owner key can produce (used to keep ID data open on the admin PC). */
  function deriveSecret(purpose) {
    requireKey();
    const der = privateKey.export({ format: 'der', type: 'pkcs8' });
    return Buffer.from(crypto.hkdfSync('sha256', der, Buffer.alloc(0), Buffer.from(`rooms-vv ${purpose}`), 32));
  }

  function remove() {
    fs.rmSync(keyFile, { force: true });
    privateKey = null;
  }

  function registry() {
    try {
      return JSON.parse(fs.readFileSync(registryFile, 'utf8'));
    } catch (_err) {
      return { serial: 0, keys: [] };
    }
  }

  function saveRegistry(next) {
    fs.writeFileSync(registryFile, JSON.stringify(next, null, 2), { mode: 0o600 });
  }

  function requireKey() {
    if (!privateKey) throw badRequest('Load the owner key on this computer first');
  }

  function sign(text) {
    return crypto.sign(null, Buffer.from(text), privateKey).toString('base64url');
  }

  /** Issues an activation key for a machine code and adds it to the published list. */
  function issue(machineCodeInput, label) {
    requireKey();
    const code = String(machineCodeInput || '').trim().toUpperCase();
    if (!MACHINE_CODE.test(code)) throw badRequest('Enter the machine code shown on that computer, e.g. ABCD-EFGH-JKLM-NPQR');
    const cleanLabel = String(label || '').trim().slice(0, 60) || 'Front desk';
    const issuedAt = new Date(clock()).toISOString();
    const payload = Buffer.from(JSON.stringify({ m: code, l: cleanLabel, i: issuedAt })).toString('base64url');
    const key = `${payload}.${sign(payload)}`;
    const reg = registry();
    reg.keys.push({ label: cleanLabel, machineCode: code, key, hash: keyHash(key), issuedAt, revokedAt: null });
    reg.serial += 1;
    reg.updatedAt = issuedAt;
    saveRegistry(reg);
    return { key, label: cleanLabel, machineCode: code };
  }

  /**
   * Adds a key issued before keys were tracked here (e.g. by the command-line tool) so that
   * publishing licenses.json does not lock computers that are already activated.
   */
  function register(existingKey, label, machineCodeInput) {
    requireKey();
    const key = normalizeKey(existingKey);
    const parsed = parseKey(key, publicKeyPem);
    if (!parsed) throw badRequest('That is not a valid activation key for this app');
    if (parsed.legacySignature) {
      // Older keys are a bare signature: they can only be checked against their machine code.
      const code = String(machineCodeInput || '').trim().toUpperCase();
      if (!MACHINE_CODE.test(code)) throw badRequest('This is an older key: also enter the machine code of the computer it belongs to');
      if (!isValidKey(code, key, publicKeyPem)) throw badRequest('That key does not belong to this machine code');
      parsed.machineCode = code;
    }
    const reg = registry();
    if (reg.keys.some((k) => k.hash === keyHash(key))) throw badRequest('This key is already listed');
    const entry = {
      label: String(label || parsed.label || 'Earlier key').trim().slice(0, 60), machineCode: parsed.machineCode || '(older key)',
      key, hash: keyHash(key), issuedAt: parsed.issuedAt || new Date(clock()).toISOString(), revokedAt: null
    };
    reg.keys.push(entry);
    reg.serial += 1;
    reg.updatedAt = new Date(clock()).toISOString();
    saveRegistry(reg);
    return { label: entry.label, machineCode: entry.machineCode };
  }

  function revoke(hash) {
    requireKey();
    const reg = registry();
    const entry = reg.keys.find((k) => k.hash === hash && !k.revokedAt);
    if (!entry) throw notFound('Key not found');
    entry.revokedAt = new Date(clock()).toISOString();
    reg.serial += 1;
    reg.updatedAt = entry.revokedAt;
    saveRegistry(reg);
  }

  function list() {
    return registry().keys.map(({ key, ...rest }) => ({ ...rest, active: !rest.revokedAt, keyPreview: `${key.slice(0, 10)}…` }))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }

  function keyFor(hash) {
    const entry = registry().keys.find((k) => k.hash === hash);
    if (!entry) throw notFound('Key not found');
    return entry.key;
  }

  /** The signed list for licenses.json (GitHub) and for desks on the hotel network. */
  function signedList() {
    if (!privateKey) return null;
    const reg = registry();
    const payload = JSON.stringify({
      serial: reg.serial, updatedAt: reg.updatedAt || new Date(clock()).toISOString(),
      hashes: reg.keys.filter((k) => !k.revokedAt).map((k) => k.hash)
    });
    return { payload, signature: sign(payload) };
  }

  function activeHashes() {
    return new Set(registry().keys.filter((k) => !k.revokedAt).map((k) => k.hash));
  }

  return {
    get loaded() {
      return Boolean(privateKey);
    },
    install, remove, deriveSecret, issue, register, revoke, list, keyFor, signedList, activeHashes,
    get serial() {
      return registry().serial;
    }
  };
}

module.exports = { createOwner };
