// Boundary parsers: turn untrusted request values into typed values or throw a 400.
const { badRequest } = require('./http');
const { isYmd } = require('./dates');
const { rupeesToPaise } = require('./money');

const MAX_TEXT = 2000;

function text(value, field, { required = false, max = 200 } = {}) {
  const str = value === undefined || value === null ? '' : String(value).trim();
  if (required && !str) throw badRequest(`${field} is required`);
  if (str.length > Math.min(max, MAX_TEXT)) throw badRequest(`${field} is too long (max ${max} characters)`);
  return str;
}

function ymd(value, field) {
  if (!isYmd(value)) throw badRequest(`${field} must be a date (YYYY-MM-DD)`);
  return value;
}

function optionalYmd(value, field) {
  return value ? ymd(value, field) : null;
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) throw badRequest(`${field} must be a whole number between ${min} and ${max}`);
  return num;
}

function number(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) throw badRequest(`${field} must be a number between ${min} and ${max}`);
  return num;
}

/** Rupee amount from the UI -> paise. */
function rupees(value, field, options = {}) {
  const amount = number(value, field, { min: 0, max: 10_000_000, ...options });
  return amount === null ? null : rupeesToPaise(amount);
}

function oneOf(value, field, allowed, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!allowed.includes(value)) throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function id(value, field = 'id') {
  return integer(value, field, { min: 1 });
}

module.exports = { text, ymd, optionalYmd, integer, number, rupees, oneOf, bool, id };
