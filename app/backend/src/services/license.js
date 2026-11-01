// Machine activation. A copied installer installs fine but the app stays locked until the
// owner issues an activation key for that computer's machine code (scripts/license.js).
// Keys are Ed25519 signatures; only the public key ships with the app, so keys cannot be forged.
const fs = require('fs');
const crypto = require('crypto');
const { PUBLIC_KEY_PEM } = require('./license-key');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 16;

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

function isValidKey(code, activationKey, publicKeyPem = PUBLIC_KEY_PEM) {
  try {
    const signature = Buffer.from(normalizeKey(activationKey), 'base64url');
    if (signature.length !== 64) return false;
    return crypto.verify(null, Buffer.from(code), crypto.createPublicKey(publicKeyPem), signature);
  } catch (_err) {
    return false;
  }
}

/**
 * @param {{ required: boolean, machineId: string, file: string, publicKeyPem?: string }} options
 */
function createLicense({ required, machineId, file, publicKeyPem = PUBLIC_KEY_PEM }) {
  const code = machineCode(machineId);

  function readStored() {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8')).key;
    } catch (_err) {
      return '';
    }
  }

  let valid = !required || isValidKey(code, readStored(), publicKeyPem);

  function activate(key) {
    if (!isValidKey(code, key, publicKeyPem)) return false;
    fs.writeFileSync(file, JSON.stringify({ key: normalizeKey(key), machineCode: code, activatedAt: new Date().toISOString() }));
    valid = true;
    return true;
  }

  return {
    get status() {
      return { required, valid, machineCode: code };
    },
    isActive: () => valid,
    activate
  };
}

module.exports = { createLicense, machineCode, isValidKey };
