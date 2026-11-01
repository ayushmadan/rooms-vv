// Encryption of identity data (ID numbers and ID photos) at rest.
//
// Anyone using the app can *seal* data with the public key, so front-desk staff can record IDs.
// Only the private key can *open* it, and that key is stored wrapped with a key derived from the
// admin PIN. It is held in memory only while an admin session is unlocked. A copied database or
// backup therefore reveals no identity documents without the PIN.
const crypto = require('crypto');
const { forbidden } = require('../lib/http');

const MAGIC = Buffer.from('VV1');
const RAW_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HKDF_INFO = Buffer.from('rooms-vv identity data');

// Unlocked private keys per open data store, never persisted.
const unlockedKeys = new WeakMap();

function readVault(store) {
  const row = store.get("SELECT value FROM settings WHERE key = 'vault'");
  return row ? JSON.parse(row.value) : null;
}

function writeVault(store, vault) {
  store.run("INSERT INTO settings (key, value) VALUES ('vault', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", JSON.stringify(vault));
}

function pinKey(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32, SCRYPT);
}

function wrapPrivateKey(privateKey, pin) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', pinKey(pin, salt), iv);
  const der = privateKey.export({ format: 'der', type: 'pkcs8' });
  const wrapped = Buffer.concat([cipher.update(der), cipher.final()]);
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), wrapped: wrapped.toString('base64') };
}

function hasKeys(store) {
  return Boolean(readVault(store));
}

/** Creates the key pair for a new install; the private key is wrapped with the PIN. */
function createKeys(store, pin) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  writeVault(store, { version: 1, publicKey: publicKey.export({ format: 'jwk' }).x, ...wrapPrivateKey(privateKey, pin) });
  unlockedKeys.set(store, privateKey);
}

/** Decrypts the private key with the PIN and keeps it in memory. Creates keys on first use. */
function unlock(store, pin) {
  const vault = readVault(store);
  if (!vault) return createKeys(store, pin);
  const decipher = crypto.createDecipheriv('aes-256-gcm', pinKey(pin, Buffer.from(vault.salt, 'base64')), Buffer.from(vault.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
  const der = Buffer.concat([decipher.update(Buffer.from(vault.wrapped, 'base64')), decipher.final()]);
  unlockedKeys.set(store, crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }));
}

/** Re-wraps the private key after a PIN change. Requires an unlocked session. */
function rewrap(store, newPin) {
  const vault = readVault(store);
  if (!vault) return createKeys(store, newPin);
  const key = unlockedKeys.get(store);
  if (!key) throw forbidden('Unlock admin before changing the PIN');
  writeVault(store, { ...vault, ...wrapPrivateKey(key, newPin) });
}

function lock(store) {
  unlockedKeys.delete(store);
}

function isUnlocked(store) {
  return unlockedKeys.has(store);
}

function isSealed(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > MAGIC.length + RAW_KEY_BYTES + IV_BYTES + TAG_BYTES && buffer.subarray(0, MAGIC.length).equals(MAGIC);
}

function derive(sharedSecret, salt) {
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecret, salt, HKDF_INFO, 32));
}

/** Encrypts with the public key: MAGIC | ephemeral public key | iv | tag | ciphertext. */
function seal(store, plaintext) {
  const vault = readVault(store);
  if (!vault) throw new Error('Identity encryption keys are not set up');
  const recipient = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: vault.publicKey }, format: 'jwk' });
  const ephemeral = crypto.generateKeyPairSync('x25519');
  const ephemeralRaw = Buffer.from(ephemeral.publicKey.export({ format: 'jwk' }).x, 'base64url');
  const key = derive(crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }), ephemeralRaw);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  return Buffer.concat([MAGIC, ephemeralRaw, iv, cipher.getAuthTag(), ciphertext]);
}

function open(store, sealed) {
  const unlockedKey = unlockedKeys.get(store);
  if (!unlockedKey) throw forbidden('Admin PIN required to view identity documents');
  let offset = MAGIC.length;
  const ephemeralRaw = sealed.subarray(offset, (offset += RAW_KEY_BYTES));
  const iv = sealed.subarray(offset, (offset += IV_BYTES));
  const tag = sealed.subarray(offset, (offset += TAG_BYTES));
  const ephemeral = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: ephemeralRaw.toString('base64url') }, format: 'jwk' });
  const key = derive(crypto.diffieHellman({ privateKey: unlockedKey, publicKey: ephemeral }), ephemeralRaw);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(offset)), decipher.final()]);
}

/** "123456789012" -> "XXXX XXXX 9012": enough to match a card, not enough to misuse. */
function mask(idNumber) {
  const compact = String(idNumber || '').replace(/\s+/g, '');
  if (!compact) return '';
  const visible = compact.slice(-4);
  return `${'X'.repeat(Math.max(0, compact.length - 4))}${visible}`.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Seals any identity data still stored in plain text (older installs, legacy imports).
 * Needs only the public key, so it can run whenever keys exist.
 */
function sealPlaintext(store) {
  if (!hasKeys(store)) return { guests: 0, files: 0 };
  let guests = 0;
  let files = 0;
  store.tx(() => {
    for (const g of store.all("SELECT id, id_number FROM guests WHERE id_number_enc IS NULL AND id_number <> ''")) {
      store.run('UPDATE guests SET id_number_enc = ?, id_number = ? WHERE id = ?', seal(store, g.id_number), mask(g.id_number), g.id);
      guests += 1;
    }
    const photoFiles = `SELECT f.id, f.data FROM files f WHERE f.encrypted = 0 AND f.id IN
      (SELECT id_photo_file_id FROM guests UNION SELECT id_photo_back_file_id FROM guests)`;
    for (const f of store.all(photoFiles)) {
      store.run('UPDATE files SET data = ?, encrypted = 1 WHERE id = ?', seal(store, f.data), f.id);
      files += 1;
    }
  });
  return { guests, files };
}

module.exports = { hasKeys, createKeys, unlock, rewrap, lock, isUnlocked, seal, open, isSealed, mask, sealPlaintext };
