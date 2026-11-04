// Encryption for traffic between desks and the admin PC on the hotel network.
// Each paired desk shares a random secret with the admin PC; every message is AES-256-GCM
// sealed with a key derived from it and carries a timestamp, so a captured message can neither
// be read, altered, nor replayed later. Pairing uses a key derived from the one-time code.
const crypto = require('crypto');

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function deriveKey(secret, purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret, 'base64'), Buffer.alloc(0), Buffer.from(`rooms-vv sync ${purpose}`), 32));
}

/** Key for the pairing exchange, from the code shown on the admin PC (slow to brute-force). */
function pairingKey(code, salt) {
  return crypto.scryptSync(String(code).replace(/[^A-Z0-9]/gi, '').toUpperCase(), `rooms-vv pair ${salt}`, 32, SCRYPT);
}

function seal(key, value, now = Date.now()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = Buffer.from(JSON.stringify({ ts: now, value }));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

/** Opens a sealed message; throws if it was altered, uses another key, or is stale. */
function open(key, envelope, now = Date.now()) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(String(envelope.iv), 'base64'));
  decipher.setAuthTag(Buffer.from(String(envelope.tag), 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(String(envelope.data), 'base64')), decipher.final()]);
  const { ts, value } = JSON.parse(plain.toString('utf8'));
  if (Math.abs(now - ts) > MAX_CLOCK_SKEW_MS) throw new Error('Message is too old or the computer clocks differ by more than 10 minutes');
  return value;
}

function newSecret() {
  return crypto.randomBytes(32).toString('base64');
}

/** Eight characters from an unambiguous alphabet, shown as XXXX-XXXX. */
function newPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

module.exports = { deriveKey, pairingKey, seal, open, newSecret, newPairingCode, MAX_CLOCK_SKEW_MS };
