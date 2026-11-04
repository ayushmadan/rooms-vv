// Admin unlock: PIN -> short-lived session token held in memory.
const crypto = require('crypto');
const settings = require('./settings');
const vault = require('./vault');
const { HttpError } = require('../lib/http');

const SESSION_TTL_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60 * 1000;
// Lets a print window (which cannot send headers) load admin-only data briefly.
const TICKET_TTL_MS = 2 * 60 * 1000;

/**
 * @param {object} deps
 * @param {{ remember: () => void, restore: () => void }} [deps.idAccess] keeps ID data open on the admin PC
 */
function createAuth({ store, clock = () => Date.now(), idAccess = { remember() {}, restore() {} } }) {
  const sessions = new Map();
  const tickets = new Map();
  let failures = 0;
  let lockedUntil = 0;

  // Closing the vault re-opens it straight away on the admin PC, which may see IDs without a PIN.
  function closeVault() {
    vault.lock(store);
    idAccess.restore();
  }

  function unlock(pin) {
    const now = clock();
    if (now < lockedUntil) {
      throw new HttpError(429, `Too many wrong PINs. Try again in ${Math.ceil((lockedUntil - now) / 1000)} seconds.`);
    }
    if (!settings.verifyAdminPin(store, String(pin || ''))) {
      failures += 1;
      if (failures >= MAX_FAILURES) {
        lockedUntil = now + LOCKOUT_MS;
        failures = 0;
      }
      throw new HttpError(401, 'Wrong PIN');
    }
    failures = 0;
    vault.unlock(store, String(pin));
    vault.sealPlaintext(store);
    idAccess.remember();
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, now + SESSION_TTL_MS);
    return { token, expiresInMs: SESSION_TTL_MS };
  }

  /** True if the token is valid; extends it (sliding expiry). */
  function check(token) {
    if (!token) return false;
    const expiry = sessions.get(token);
    const now = clock();
    if (!expiry || expiry < now) {
      sessions.delete(token);
      if (expiry && !sessions.size) closeVault();
      return false;
    }
    sessions.set(token, now + SESSION_TTL_MS);
    return true;
  }

  function lock(token) {
    sessions.delete(token);
    if (!sessions.size) closeVault();
  }

  function lockAll() {
    sessions.clear();
    tickets.clear();
    closeVault();
  }

  function issueTicket() {
    const ticket = crypto.randomBytes(18).toString('hex');
    tickets.set(ticket, clock() + TICKET_TTL_MS);
    return ticket;
  }

  function checkTicket(ticket) {
    if (!ticket) return false;
    const expiry = tickets.get(String(ticket));
    if (!expiry || expiry < clock()) {
      tickets.delete(String(ticket));
      return false;
    }
    return vault.isUnlocked(store);
  }

  return { unlock, check, lock, lockAll, issueTicket, checkTicket };
}

module.exports = { createAuth, SESSION_TTL_MS };
