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

function createAuth({ store, clock = () => Date.now() }) {
  const sessions = new Map();
  const tickets = new Map();
  let failures = 0;
  let lockedUntil = 0;

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
      if (!sessions.size) vault.lock(store);
      return false;
    }
    sessions.set(token, now + SESSION_TTL_MS);
    return true;
  }

  function lock(token) {
    sessions.delete(token);
    if (!sessions.size) vault.lock(store);
  }

  function lockAll() {
    sessions.clear();
    tickets.clear();
    vault.lock(store);
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
